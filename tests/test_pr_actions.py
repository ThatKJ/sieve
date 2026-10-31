"""PR Control Center: security boundaries, auth detection, every write action and its failure modes.

All GitHub traffic is mocked: nothing here touches the network or a real repository.
"""
import http.client
import io
import json
import os
import pathlib
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from sieve import actions, github, server

SHA = "a" * 40
NEW_SHA = "b" * 40
PATCH = "@@ -1,3 +1,4 @@\n context\n-old\n+new\n+added\n tail"


def gql(state="OPEN", merged=False, draft=False, mergeable="MERGEABLE", mss="CLEAN", perm="WRITE", viewer="maint",
        author="contrib", head=SHA, labels=(), assignees=(), reviewers=(), reviews=(), milestone=None,
        queue_enabled=False, checks=(), methods=(True, True, False)):
    """A CONTROLS_QUERY response, shaped like GitHub's."""
    return ({
        "viewer": {"login": viewer},
        "repository": {
            "viewerPermission": perm, "mergeCommitAllowed": methods[0], "squashMergeAllowed": methods[1],
            "rebaseMergeAllowed": methods[2],
            "labels": {"nodes": [{"name": "bug"}, {"name": "docs"}]},
            "milestones": {"nodes": [{"number": 3, "title": "v1.0"}]},
            "pullRequest": {
                "id": "PR_node", "number": 7, "title": "Fix parser", "url": "https://github.com/o/r/pull/7",
                "state": state, "isDraft": draft, "merged": merged, "mergeable": mergeable, "mergeStateStatus": mss,
                "reviewDecision": "REVIEW_REQUIRED", "headRefOid": head, "baseRefName": "main", "headRefName": "fix",
                "isMergeQueueEnabled": queue_enabled, "isInMergeQueue": False, "mergeQueueEntry": None,
                "author": {"login": author}, "milestone": milestone,
                "labels": {"nodes": [{"name": x} for x in labels]},
                "assignees": {"nodes": [{"login": x} for x in assignees]},
                "reviewRequests": {"nodes": [{"requestedReviewer": {"login": x}} for x in reviewers]},
                "latestReviews": {"nodes": [{"author": {"login": a}, "state": s, "submittedAt": "2026-10-31T00:00:00Z"} for a, s in reviews]},
                "commits": {"nodes": [{"commit": {"statusCheckRollup": {"state": "FAILURE" if checks else "SUCCESS", "contexts": {"nodes": list(checks)}}}}]},
            },
        },
    }, 0)


WRITE_TOKEN = {"source": "GITHUB_TOKEN", "kind": "classic_pat", "login": "maint", "scopes": ["repo"], "write_capable": "yes", "valid": True}


class Base(unittest.TestCase):
    def setUp(self):
        actions._in_flight.clear()
        actions._seen_requests.clear()
        self.rid = 0
        patches = [
            patch.dict(os.environ, {"SIEVE_ENABLE_WRITES": "1"}),
            patch.object(github, "OFFLINE", False),
            patch.object(github, "_get_token", return_value="x"),
            patch.object(github, "token_source", return_value="GITHUB_TOKEN"),
            patch.object(github, "token_info", return_value=dict(WRITE_TOKEN)),
            patch.object(github, "get", return_value=[{"filename": "src/a.py", "patch": PATCH}, {"filename": "img.png"}]),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.write = patch.object(github, "write", return_value={}).start()
        self.mutation = patch.object(github, "graphql_mutation", return_value={}).start()
        self.addCleanup(patch.stopall)

    def states(self, before, after=None):
        self.graphql = patch.object(github, "graphql", side_effect=[before] + ([after] if after else [before])).start()

    def run_action(self, action, params=None, sha=SHA, rid=None):
        self.rid += 1
        return actions.perform("o", "r", 7, action, params or {}, sha, rid or f"req-{self.rid:06d}")

    def assertRefused(self, status, action, params=None, sha=SHA, contains=""):
        with self.assertRaises(actions.ActionError) as cm:
            self.run_action(action, params, sha)
        self.assertEqual(cm.exception.status, status, str(cm.exception))
        self.assertIn(contains, str(cm.exception))
        self.write.assert_not_called()
        self.mutation.assert_not_called()
        return cm.exception


class Merge(Base):
    def test_successful_merge_sends_head_sha_and_verifies(self):
        self.write.return_value = {"merged": True, "sha": "c" * 40}
        self.states(gql(), gql(state="MERGED", merged=True))
        res = self.run_action("merge", {"method": "squash"})
        self.write.assert_called_once_with("PUT", "/repos/o/r/pulls/7/merge", {"merge_method": "squash", "sha": SHA})
        self.assertTrue(res["ok"])
        self.assertTrue(res["verified"])
        self.assertEqual(res["controls"]["pr"]["state"], "merged")

    def test_merge_conflict_refused_before_github(self):
        self.states(gql(mergeable="CONFLICTING", mss="DIRTY"))
        self.assertRefused(409, "merge", {"method": "merge"}, contains="conflicts")

    def test_failing_required_checks_reports_githubs_reason(self):
        ci = {"name": "ci", "status": "COMPLETED", "conclusion": "FAILURE", "isRequired": True}
        self.states(gql(mss="BLOCKED", checks=[ci]))
        c = actions.controls("o", "r", 7)
        self.assertEqual(c["merge"]["checks"], [{"name": "ci", "state": "fail", "required": True}])
        self.assertIn("required", c["merge"]["state_text"])
        # Sieve lets GitHub decide (admins may bypass); GitHub's refusal is surfaced verbatim
        self.states(gql(mss="BLOCKED", checks=[ci]))
        self.write.side_effect = github.GitHubError("GitHub refused: Required status check \"ci\" is failing.", status=409)
        with self.assertRaises(github.GitHubError) as cm:
            self.run_action("merge", {"method": "merge"})
        self.assertIn("ci", str(cm.exception))

    def test_permission_denied_without_write_role(self):
        self.states(gql(perm="TRIAGE"))
        self.assertRefused(403, "merge", {"method": "merge"}, contains="write access")

    def test_invalid_merge_method_rejected(self):
        self.assertRefused(400, "merge", {"method": "fast-forward"})

    def test_method_not_allowed_by_repository(self):
        self.states(gql(methods=(True, False, False)))
        self.assertRefused(409, "merge", {"method": "rebase"}, contains="Allowed: merge")

    def test_already_merged(self):
        self.states(gql(state="MERGED", merged=True))
        self.assertRefused(409, "merge", {"method": "merge"}, contains="already merged")

    def test_draft_and_merge_queue_block_merge(self):
        self.states(gql(draft=True))
        self.assertRefused(409, "merge", {"method": "merge"}, contains="Draft")
        self.states(gql(queue_enabled=True))
        self.assertRefused(409, "merge", {"method": "merge"}, contains="merge queue")

    def test_github_says_not_merged(self):
        self.write.return_value = {"merged": False, "message": "Base branch was modified"}
        self.states(gql())
        with self.assertRaises(actions.ActionError) as cm:
            self.run_action("merge", {"method": "merge"})
        self.assertIn("Base branch was modified", str(cm.exception))


class Lifecycle(Base):
    def test_close_never_deletes_branch_and_posts_optional_comment(self):
        self.write.return_value = {"html_url": "https://github.com/o/r/pull/7#c1"}
        self.states(gql(), gql(state="CLOSED"))
        res = self.run_action("close", {"body": "Superseded by #8"})
        self.assertEqual([c.args[:2] for c in self.write.call_args_list],
                         [("PATCH", "/repos/o/r/pulls/7"), ("POST", "/repos/o/r/issues/7/comments")])
        self.assertFalse(any("refs" in c.args[1] for c in self.write.call_args_list))
        self.assertTrue(res["verified"])
        self.assertIn("not deleted", res["message"])

    def test_close_comment_failure_is_reported(self):
        self.write.side_effect = [{}, github.GitHubError("boom", status=502)]
        self.states(gql(), gql(state="CLOSED"))
        self.assertIn("closing comment failed", self.run_action("close", {"body": "bye"})["message"])

    def test_already_closed(self):
        self.states(gql(state="CLOSED"))
        self.assertRefused(409, "close", contains="already closed")

    def test_reopen(self):
        self.states(gql(state="CLOSED"), gql())
        res = self.run_action("reopen")
        self.write.assert_called_once_with("PATCH", "/repos/o/r/pulls/7", {"state": "open"})
        self.assertTrue(res["verified"])

    def test_merged_cannot_reopen(self):
        self.states(gql(state="MERGED", merged=True))
        self.assertRefused(409, "reopen", contains="Merged")

    def test_author_may_close_own_pr_with_read_role(self):
        self.states(gql(perm="READ", viewer="contrib"), gql(state="CLOSED", viewer="contrib"))
        self.assertTrue(self.run_action("close")["ok"])

    def test_draft_toggle_uses_graphql_mutation(self):
        self.states(gql(draft=True), gql())
        self.assertTrue(self.run_action("ready_for_review")["verified"])
        self.assertIn("markPullRequestReadyForReview", self.mutation.call_args.args[0])
        self.states(gql(), gql(draft=True))
        self.assertTrue(self.run_action("convert_to_draft")["verified"])

    def test_update_branch_only_when_behind(self):
        self.states(gql())
        self.assertRefused(409, "update_branch", contains="not behind")
        self.states(gql(mss="BEHIND"))
        res = self.run_action("update_branch")
        self.write.assert_called_once_with("PUT", "/repos/o/r/pulls/7/update-branch", {"expected_head_sha": SHA})
        self.assertIsNone(res["verified"])  # GitHub applies it asynchronously


class Reviews(Base):
    def test_approve_pins_commit_and_verifies(self):
        self.write.return_value = {"html_url": "https://github.com/o/r/pull/7#r1"}
        self.states(gql(), gql(reviews=[("maint", "APPROVED")]))
        res = self.run_action("approve")
        self.write.assert_called_once_with("POST", "/repos/o/r/pulls/7/reviews", {"event": "APPROVE", "commit_id": SHA})
        self.assertTrue(res["verified"])
        self.assertEqual(res["evidence"], "https://github.com/o/r/pull/7#r1")

    def test_author_cannot_approve_own_pr(self):
        self.states(gql(viewer="contrib"))
        self.assertRefused(409, "approve", contains="own pull request")

    def test_request_changes_needs_body(self):
        self.assertRefused(400, "request_changes", {"body": "  "})
        self.states(gql(), gql(reviews=[("maint", "CHANGES_REQUESTED")]))
        self.assertTrue(self.run_action("request_changes", {"body": "Please add a test"})["verified"])
        self.assertEqual(self.write.call_args.args[2]["event"], "REQUEST_CHANGES")

    def test_general_comment(self):
        self.write.return_value = {"html_url": "https://github.com/o/r/pull/7#issuecomment-1"}
        self.states(gql())
        res = self.run_action("comment", {"body": "Thanks!"})
        self.write.assert_called_once_with("POST", "/repos/o/r/issues/7/comments", {"body": "Thanks!"})
        self.assertIn("issuecomment", res["evidence"])

    def test_comment_allowed_on_closed_pr(self):
        self.states(gql(state="CLOSED"))
        self.assertTrue(self.run_action("comment", {"body": "Noted"})["ok"])

    def test_inline_comment_on_a_diff_line(self):
        self.write.return_value = {"html_url": "https://github.com/o/r/pull/7#discussion_r1"}
        self.states(gql())
        self.run_action("inline_comment", {"body": "nit", "path": "src/a.py", "line": 3, "side": "RIGHT"})
        self.write.assert_called_once_with("POST", "/repos/o/r/pulls/7/comments",
                                           {"body": "nit", "commit_id": SHA, "path": "src/a.py", "line": 3, "side": "RIGHT"})

    def test_inline_comment_refuses_lines_outside_the_diff(self):
        self.states(gql())
        e = self.assertRefused(422, "inline_comment", {"body": "x", "path": "src/a.py", "line": 40, "side": "RIGHT"})
        self.assertIn("Commentable: 1-4", str(e))
        self.states(gql())
        self.assertRefused(422, "inline_comment", {"body": "x", "path": "img.png", "line": 1}, contains="no diff")
        self.states(gql())
        self.assertRefused(422, "inline_comment", {"body": "x", "path": "other.py", "line": 1}, contains="not changed")

    def test_commentable_lines(self):
        left, right = actions.commentable_lines(PATCH)
        self.assertEqual(right, {1, 2, 3, 4})  # context, +new, +added, tail
        self.assertEqual(left, {1, 2, 3})       # context, -old, tail
        self.assertEqual(actions.commentable_lines(None), (set(), set()))


class Collaboration(Base):
    def test_labels(self):
        self.states(gql(), gql(labels=["bug"]))
        self.assertTrue(self.run_action("add_labels", {"labels": ["bug"]})["verified"])
        self.states(gql())
        self.write.reset_mock()
        self.assertRefused(422, "add_labels", {"labels": ["nonexistent"]}, contains="No label")
        self.states(gql(labels=["bug", "docs"]), gql(labels=["docs"]))
        self.assertTrue(self.run_action("remove_labels", {"labels": ["bug"]})["verified"])
        self.assertEqual(self.write.call_args.args, ("DELETE", "/repos/o/r/issues/7/labels/bug"))

    def test_remove_label_not_on_pr(self):
        self.states(gql())
        self.assertRefused(422, "remove_labels", {"labels": ["bug"]}, contains="not on this pull request")

    def test_assignees_and_silent_skip(self):
        self.write.return_value = {"assignees": [{"login": "alice"}]}
        self.states(gql(), gql(assignees=["alice"]))
        self.assertTrue(self.run_action("add_assignees", {"assignees": ["alice"]})["verified"])
        self.write.return_value = {"assignees": []}
        self.states(gql())
        with self.assertRaises(actions.ActionError) as cm:
            self.run_action("add_assignees", {"assignees": ["outsider"]})
        self.assertIn("did not assign outsider", str(cm.exception))

    def test_reviewers(self):
        self.states(gql(), gql(reviewers=["bob"]))
        self.assertTrue(self.run_action("request_reviewers", {"reviewers": ["bob"]})["verified"])
        self.write.assert_called_with("POST", "/repos/o/r/pulls/7/requested_reviewers", {"reviewers": ["bob"]})
        self.states(gql(reviewers=["bob"]), gql())
        self.assertTrue(self.run_action("remove_reviewers", {"reviewers": ["bob"]})["verified"])

    def test_milestones(self):
        self.states(gql(), gql(milestone={"number": 3, "title": "v1.0"}))
        self.assertTrue(self.run_action("set_milestone", {"milestone": 3})["verified"])
        self.write.assert_called_with("PATCH", "/repos/o/r/issues/7", {"milestone": 3})
        self.write.reset_mock()
        self.states(gql())
        self.assertRefused(422, "set_milestone", {"milestone": 99}, contains="No open milestone")
        self.states(gql())
        self.assertRefused(409, "clear_milestone", contains="No milestone")
        self.states(gql(milestone={"number": 3, "title": "v1.0"}), gql())
        self.assertTrue(self.run_action("clear_milestone")["verified"])
        self.write.assert_called_with("PATCH", "/repos/o/r/issues/7", {"milestone": None})

    def test_triage_needed_for_labels(self):
        self.states(gql(perm="READ"))
        self.assertRefused(403, "add_labels", {"labels": ["bug"]}, contains="triage")


class Safety(Base):
    def test_stale_head_sha_refused(self):
        self.states(gql(head=NEW_SHA))
        self.assertRefused(409, "approve", contains="changed since you loaded it")

    def test_same_confirmation_cannot_be_sent_twice(self):
        self.states(gql(), gql(state="CLOSED"))
        self.run_action("close", rid="dup-request-1")
        with self.assertRaises(actions.ActionError) as cm:
            self.run_action("close", rid="dup-request-1")
        self.assertEqual(cm.exception.status, 409)
        self.assertEqual(self.write.call_count, 1)

    def test_failed_confirmation_is_not_resent_silently(self):
        self.states(gql())
        self.write.side_effect = github.GitHubError("Could not reach GitHub", status=503)
        with self.assertRaises(github.GitHubError):
            self.run_action("comment", {"body": "hi"}, rid="net-fail-01")
        with self.assertRaises(actions.ActionError):
            self.run_action("comment", {"body": "hi"}, rid="net-fail-01")
        self.assertEqual(self.write.call_count, 1)

    def test_concurrent_action_on_same_pr_refused(self):
        actions._in_flight.add(("o", "r", 7))
        self.assertRefused(409, "comment", {"body": "x"}, contains="in progress")

    def test_lock_released_after_failure(self):
        self.states(gql(head=NEW_SHA))
        with self.assertRaises(actions.ActionError):
            self.run_action("comment", {"body": "x"})
        self.assertEqual(actions._in_flight, set())

    def test_malformed_input(self):
        self.assertRefused(400, "explode")
        self.assertRefused(400, "comment", {"body": "x"}, sha="abc")
        self.assertRefused(400, "add_assignees", {"assignees": ["bad name!"]})
        self.assertRefused(400, "add_labels", {"labels": []})
        self.assertRefused(400, "comment", {"body": "x" * (actions.MAX_BODY + 1)})
        self.assertRefused(400, "set_milestone", {"milestone": True})
        self.assertRefused(400, "inline_comment", {"body": "x", "path": "a", "line": 0})
        with self.assertRaises(actions.ActionError):
            actions.perform("o", "r", 7, "comment", "not a dict", SHA, "req-000001")
        with self.assertRaises(actions.ActionError):
            actions.perform("o", "r", 7, "comment", {"body": "x"}, SHA, "x")  # request_id too short

    def test_invalid_repository_or_pr(self):
        self.graphql = patch.object(github, "graphql", return_value=({"viewer": {}, "repository": None}, 0)).start()
        with self.assertRaises(github.GitHubError) as cm:
            self.run_action("comment", {"body": "x"})
        self.assertEqual(cm.exception.status, 404)
        data = gql()[0]
        data["repository"]["pullRequest"] = None
        self.graphql.return_value = (data, 0)
        with self.assertRaises(github.GitHubError) as cm:
            actions.controls("o", "r", 7)
        self.assertEqual(cm.exception.status, 404)

    def test_refresh_failure_after_successful_write(self):
        self.graphql = patch.object(github, "graphql", side_effect=[gql(), github.GitHubError("rate", status=429)]).start()
        res = self.run_action("comment", {"body": "x"})
        self.assertTrue(res["ok"])
        self.assertIsNone(res["controls"])
        self.assertIsNone(res["verified"])

    def test_diff_unavailable_only_disables_inline_comments(self):
        github.get.side_effect = github.GitHubError("rate", status=429)
        self.states(gql())
        c = actions.controls("o", "r", 7)
        self.assertIsNotNone(c["available"]["inline_comment"])
        self.assertIsNone(c["available"]["comment"])

    def test_model_modules_cannot_reach_actions(self):
        root = pathlib.Path(actions.__file__).parent
        for mod in ("gemma.py", "llm.py", "core.py", "atlas.py"):
            src = (root / mod).read_text()
            self.assertNotIn("import actions", src, mod)
            self.assertNotIn("actions.", src, mod)
            self.assertNotIn("github.write", src, mod)
            self.assertNotIn("graphql_mutation", src, mod)


class AccessModes(Base):
    def blocked(self, mode_reason):
        self.states(gql())
        c = actions.controls("o", "r", 7)
        self.assertTrue(all(v and v["status"] == 403 and mode_reason in v["reason"] for v in c["available"].values()))
        return c

    def test_writes_disabled_by_default(self):
        with patch.dict(os.environ, {"SIEVE_ENABLE_WRITES": ""}):
            self.assertEqual(self.blocked("read-only mode")["access"]["mode"], "read_only")
            self.states(gql())
            self.assertRefused(403, "comment", {"body": "x"})

    def test_token_without_write_scope(self):
        github.token_info.return_value = dict(WRITE_TOKEN, scopes=["read:org"], write_capable="no")
        self.assertEqual(self.blocked("no write scope")["access"]["mode"], "token_read_only")

    def test_expired_token(self):
        github.token_info.return_value = dict(WRITE_TOKEN, valid=False)
        self.assertEqual(self.blocked("expired")["access"]["mode"], "auth_expired")

    def test_no_token_and_offline(self):
        github._get_token.return_value = ""
        self.blocked("No GitHub token")
        github._get_token.return_value = "x"
        with patch.object(github, "OFFLINE", True):
            self.blocked("Offline")

    def test_fine_grained_token_write_unknown_github_decides(self):
        github.token_info.return_value = dict(WRITE_TOKEN, kind="fine_grained_pat", scopes=None, write_capable="unknown")
        self.states(gql())
        c = actions.controls("o", "r", 7)
        self.assertEqual((c["access"]["mode"], c["access"]["write_capable"]), ("write", "unknown"))

    def test_access_never_contains_token(self):
        github._get_token.return_value = "ghp_SECRETSECRET"
        self.states(gql())
        self.assertNotIn("SECRET", json.dumps(actions.controls("o", "r", 7)))


def http_error(code, body=None, headers=None):
    msg = http.client.HTTPMessage()
    for k, v in (headers or {}).items():
        msg[k] = v
    return urllib.error.HTTPError("https://api.github.com/x", code, "err", msg, io.BytesIO(json.dumps(body or {}).encode()))


class WriteClient(unittest.TestCase):
    def setUp(self):
        for p in (patch.object(github, "_get_token", return_value="ghp_SECRET"), patch.object(github, "OFFLINE", False)):
            p.start()
            self.addCleanup(p.stop)

    def call(self, exc):
        with patch("urllib.request.urlopen", side_effect=exc):
            with self.assertRaises(github.GitHubError) as cm:
                github.write("POST", "/repos/o/r/issues/7/comments", {"body": "x"})
        self.assertNotIn("SECRET", str(cm.exception))
        return cm.exception

    def test_status_mapping(self):
        self.assertEqual(self.call(http_error(401)).status, 401)
        self.assertEqual(self.call(http_error(403, {"message": "Resource not accessible by personal access token"})).status, 403)
        self.assertEqual(self.call(http_error(403, {"message": "x"}, {"X-RateLimit-Remaining": "0"})).status, 429)
        self.assertEqual(self.call(http_error(403, {"message": "You have exceeded a secondary rate limit"})).status, 429)
        self.assertEqual(self.call(http_error(429)).status, 429)
        self.assertEqual(self.call(http_error(404)).status, 404)
        e = self.call(http_error(405, {"message": "Pull Request is not mergeable"}))
        self.assertEqual((e.status, "not mergeable" in str(e)), (409, True))
        e = self.call(http_error(422, {"message": "Validation Failed", "errors": [{"message": "Review cannot be requested from pull request author."}]}))
        self.assertEqual(e.status, 422)
        self.assertIn("pull request author", str(e))
        e = self.call(urllib.error.URLError("timed out"))
        self.assertEqual(e.status, 503)
        self.assertIn("may not have been applied", str(e))

    def test_write_refuses_without_token_offline_or_bad_method(self):
        with patch.object(github, "OFFLINE", True), self.assertRaises(github.GitHubError):
            github.write("POST", "/x", {})
        github._get_token.return_value = ""
        with self.assertRaises(github.GitHubError) as cm:
            github.write("POST", "/x", {})
        self.assertEqual(cm.exception.status, 401)
        with self.assertRaises(ValueError):
            github.write("GET", "/x")

    def test_graphql_mutation_only_mutations(self):
        with self.assertRaises(ValueError):
            github.graphql_mutation("query { viewer { login } }", {})
        with patch.object(github, "write", return_value={"errors": [{"message": "not permitted"}]}):
            with self.assertRaises(github.GitHubError):
                github.graphql_mutation("mutation { x }", {})


class TokenDetection(unittest.TestCase):
    def setUp(self):
        github._token, github._token_info = None, None
        self.addCleanup(lambda: setattr(github, "_token", None) or setattr(github, "_token_info", None))

    def test_env_token_wins_and_gh_not_consulted(self):
        with patch.dict(os.environ, {"GITHUB_TOKEN": "ghp_env"}), patch("subprocess.run") as run:
            self.assertEqual(github._get_token(), "ghp_env")
            self.assertEqual(github.token_source(), "GITHUB_TOKEN")
            run.assert_not_called()

    def test_gh_fallback_and_opt_out(self):
        env = {k: v for k, v in os.environ.items() if k != "GITHUB_TOKEN"}
        with patch.dict(os.environ, env, clear=True), patch("subprocess.run", return_value=MagicMock(stdout="gho_cli\n")):
            self.assertEqual(github._get_token(), "gho_cli")
            self.assertEqual(github.token_source(), "gh_cli")
        github._token = None
        with patch.dict(os.environ, dict(env, SIEVE_GH_FALLBACK="0"), clear=True), patch("subprocess.run") as run:
            self.assertEqual(github._get_token(), "")
            self.assertEqual(github.token_source(), "none")
            run.assert_not_called()

    def scopes(self, token, scopes_header):
        resp = MagicMock()
        resp.read.return_value = b'{"login": "maint"}'
        resp.headers = {"X-OAuth-Scopes": scopes_header} if scopes_header is not None else {}
        resp.__enter__.return_value = resp
        with patch.object(github, "_get_token", return_value=token), patch.object(github, "OFFLINE", False), \
                patch("urllib.request.urlopen", return_value=resp):
            return github.token_info(refresh=True)

    def test_scopes_decide_write_capability(self):
        self.assertEqual(self.scopes("gho_x", "repo, read:org")["write_capable"], "yes")
        self.assertEqual(self.scopes("ghp_x", "public_repo")["write_capable"], "yes")
        self.assertEqual(self.scopes("ghp_x", "read:org, gist")["write_capable"], "no")
        info = self.scopes("github_pat_x", None)
        self.assertEqual((info["kind"], info["write_capable"]), ("fine_grained_pat", "unknown"))
        self.assertNotIn("github_pat_x", json.dumps(info))

    def test_rejected_token_and_network_failure(self):
        with patch.object(github, "_get_token", return_value="ghp_x"), patch.object(github, "OFFLINE", False):
            with patch("urllib.request.urlopen", side_effect=http_error(401)):
                self.assertIs(github.token_info(refresh=True)["valid"], False)
            with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")):
                info = github.token_info(refresh=True)
                self.assertEqual((info["valid"], info["write_capable"]), (None, "unknown"))


def handler(method, path, headers, body=None):
    h = server.Handler.__new__(server.Handler)
    h.path, h.command = path, method
    msg = http.client.HTTPMessage()
    raw = json.dumps(body).encode() if body is not None else b""
    for k, v in headers:
        msg[k] = v
    if body is not None:
        msg["Content-Length"] = str(len(raw))
    h.headers, h.rfile, h.wfile = msg, io.BytesIO(raw), io.BytesIO()
    status = []
    h.send_response = lambda code, *a: status.append(code)
    h.send_header = lambda *a: None
    h.end_headers = lambda: None
    h.log_message = lambda *a: None
    h.log_error = lambda *a: None
    getattr(h, f"do_{method}")()
    out = h.wfile.getvalue()
    return status[0], (json.loads(out) if out else None)


EXT = f"chrome-extension://{server.SIEVE_EXTENSION_ID}"
GOOD_HOST = ("Host", "127.0.0.1:8787")


class ServerBoundaries(unittest.TestCase):
    def test_host_validation(self):
        ok = server._is_allowed_host
        for host in ("127.0.0.1:8787", "localhost:8787", "LOCALHOST:8787", "[::1]:8787"):
            self.assertTrue(ok([host]), host)
        for hosts in ([], ["evil.com:8787"], ["127.0.0.1:9999"], ["127.0.0.1"], ["attacker.127.0.0.1.nip.io:8787"],
                      ["127.0.0.1:8787", "evil.com"], ["127.0.0.1:8787@evil.com"], [""]):
            self.assertFalse(ok(hosts), hosts)
        with patch.dict(os.environ, {"SIEVE_ALLOWED_HOSTS": "sieve.lan:8787"}):
            self.assertTrue(ok(["sieve.lan:8787"]))

    def test_origin_validation(self):
        ok = server._is_allowed_origin
        self.assertTrue(ok(EXT))
        for origin in ("null", "chrome-extension://" + "a" * 32, EXT + "/", EXT.upper(), "chrome-extension://short",
                       "http://localhost:8787/", "https://localhost:8787", "http://localhost:3000", "file://",
                       "http://127.0.0.1:8787.evil.com", " " + EXT, "moz-extension://x"):
            self.assertFalse(ok(origin), origin)
        with patch.dict(os.environ, {"SIEVE_EXTENSION_IDS": "b" * 32, "SIEVE_DEV_ORIGINS": "http://localhost:3000"}):
            self.assertTrue(ok("chrome-extension://" + "b" * 32))
            self.assertTrue(ok("http://localhost:3000"))

    def test_manifest_key_produces_pinned_id(self):
        import base64
        import hashlib
        m = json.loads((pathlib.Path(server.__file__).parent.parent / "extension" / "manifest.json").read_text())
        digest = hashlib.sha256(base64.b64decode(m["key"])).hexdigest()[:32]
        self.assertEqual("".join(chr(ord("a") + int(ch, 16)) for ch in digest), server.SIEVE_EXTENSION_ID)

    def test_dns_rebinding_get_refused(self):
        status, body = handler("GET", "/api/health", [("Host", "rebind.attacker.com:8787")])
        self.assertEqual(status, 403)
        self.assertIn("Host", body["error"])
        self.assertEqual(handler("GET", "/api/health", [])[0], 403)  # missing Host
        self.assertEqual(handler("GET", "/api/health", [GOOD_HOST, ("Host", "evil.com")])[0], 403)  # duplicate Host

    @patch("sieve.actions.perform")
    def test_action_route_requires_trusted_origin(self, perform):
        perform.return_value = {"ok": True, "action": "comment", "message": "done", "evidence": None, "verified": None, "controls": None}
        body = {"pr": "o/r#7", "action": "comment", "params": {"body": "x"}, "expected_head_sha": SHA, "request_id": "req-000001"}
        self.assertEqual(handler("POST", "/api/pr/action", [GOOD_HOST], body)[0], 403)  # no Origin
        self.assertEqual(handler("POST", "/api/pr/action", [GOOD_HOST, ("Origin", "chrome-extension://" + "c" * 32)], body)[0], 403)
        self.assertEqual(handler("POST", "/api/pr/action", [GOOD_HOST, ("Origin", "null")], body)[0], 403)
        self.assertEqual(handler("POST", "/api/pr/action", [("Host", "evil.com:8787"), ("Origin", EXT)], body)[0], 403)
        perform.assert_not_called()
        status, res = handler("POST", "/api/pr/action", [GOOD_HOST, ("Origin", EXT)], body)
        self.assertEqual((status, res["ok"]), (200, True))
        perform.assert_called_once_with("o", "r", 7, "comment", {"body": "x"}, SHA, "req-000001")

    @patch("sieve.actions.perform")
    def test_action_route_error_mapping(self, perform):
        hdrs = [GOOD_HOST, ("Origin", EXT)]
        body = {"pr": "o/r#7", "action": "merge", "params": {}, "expected_head_sha": SHA, "request_id": "req-000001"}
        perform.side_effect = actions.ActionError("stale", status=409)
        self.assertEqual(handler("POST", "/api/pr/action", hdrs, body), (409, {"error": "stale"}))
        perform.side_effect = github.GitHubError("rate limit", status=429)
        self.assertEqual(handler("POST", "/api/pr/action", hdrs, body)[0], 429)
        perform.side_effect = RuntimeError("internal detail ghp_SECRET")
        status, res = handler("POST", "/api/pr/action", hdrs, body)
        self.assertEqual(status, 500)
        self.assertNotIn("SECRET", json.dumps(res))
        self.assertEqual(handler("POST", "/api/pr/action", hdrs, dict(body, pr="not a pr"))[0], 400)
        self.assertEqual(handler("POST", "/api/pr/action", hdrs, ["list"])[0], 400)

    @patch("sieve.actions.controls", return_value={"pr": {"number": 7}})
    def test_controls_route(self, controls):
        self.assertEqual(handler("GET", "/api/pr/controls?pr=o%2Fr%237", [GOOD_HOST, ("Origin", EXT)]), (200, {"pr": {"number": 7}}))
        controls.assert_called_once_with("o", "r", 7)


if __name__ == "__main__":
    unittest.main()
