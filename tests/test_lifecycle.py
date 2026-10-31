"""Deterministic tests for PR lifecycle classification. Fixed clock, synthetic PRs, no network."""
import unittest
from datetime import datetime, timezone

from sieve import lifecycle as L

NOW = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)
ME = "maintainer"


def pr(**over):
    base = {"number": 1, "author": "contrib", "draft": False, "created_at": "2026-10-28T10:00:00Z",
            "requested_reviewers": [], "requested_teams": [], "reviews": [], "review_decision": None,
            "mergeable": "MERGEABLE", "checks": "SUCCESS", "failing_checks": [], "last_commit_at": "2026-10-29T10:00:00Z"}
    base.update(over)
    return base


def review(author, state, at):
    return {"author": author, "state": state, "submitted_at": at}


def run(p, viewer=ME):
    return L.classify(p, viewer=viewer, now=NOW)


class Classification(unittest.TestCase):
    def test_01_review_requested_from_me(self):
        c = run(pr(requested_reviewers=["maintainer"]))
        self.assertEqual((c["status"], c["responsible"]), ("action_needed", "maintainer"))
        self.assertIn("Review requested from you (@maintainer)", c["evidence"])

    def test_02_changes_requested_waits_on_author(self):
        c = run(pr(reviews=[review("rev", "CHANGES_REQUESTED", "2026-10-30T10:00:00Z")]))
        self.assertEqual((c["status"], c["responsible"]), ("waiting_on_author", "author"))
        self.assertIn("No commit since that review", c["evidence"])

    def test_03_commit_after_changes_requested_needs_rereview(self):
        p = pr(reviews=[review("maintainer", "CHANGES_REQUESTED", "2026-10-29T08:00:00Z")], last_commit_at="2026-10-30T09:00:00Z")
        c = run(p)
        self.assertEqual((c["status"], c["responsible"]), ("action_needed", "maintainer"))
        self.assertEqual(c["next_action"], "Re-review the updated changes")

    def test_04_approval_with_green_checks_is_ready(self):
        c = run(pr(reviews=[review("rev", "APPROVED", "2026-10-30T10:00:00Z")], review_decision="APPROVED"))
        self.assertEqual(c["status"], "ready_to_merge")

    def test_05_mixed_reviews_changes_request_wins(self):
        p = pr(reviews=[review("a", "APPROVED", "2026-10-30T10:00:00Z"), review("b", "CHANGES_REQUESTED", "2026-10-30T11:00:00Z")])
        self.assertEqual(run(p)["status"], "waiting_on_author")

    def test_06_waiting_for_another_reviewer(self):
        c = run(pr(requested_reviewers=["someone"], requested_teams=["core"]))
        self.assertEqual((c["status"], c["responsible"]), ("waiting_for_review", "reviewer"))
        self.assertIn("team core", c["next_action"])

    def test_07_failed_checks_block(self):
        c = run(pr(checks="FAILURE", failing_checks=["test (3.12)"]))
        self.assertEqual((c["status"], c["responsible"]), ("blocked", "author"))
        self.assertEqual(c["blockers"][0], {"kind": "checks_failed", "severity": "hard", "detail": "Failing checks: test (3.12)"})

    def test_08_pending_checks_on_approved_pr_block_softly(self):
        c = run(pr(reviews=[review("rev", "APPROVED", "2026-10-30T10:00:00Z")], checks="PENDING"))
        self.assertEqual((c["status"], c["responsible"]), ("blocked", "ci"))
        self.assertEqual(c["blockers"][0]["severity"], "soft")

    def test_09_merge_conflict_blocks(self):
        c = run(pr(mergeable="CONFLICTING", reviews=[review("rev", "APPROVED", "2026-10-30T10:00:00Z")]))
        self.assertEqual((c["status"], c["responsible"], c["next_action"]), ("blocked", "author", "Resolve the merge conflicts"))

    def test_10_missing_required_approvals(self):
        c = run(pr(reviews=[review("rev", "APPROVED", "2026-10-30T10:00:00Z")], review_decision="REVIEW_REQUIRED"))
        self.assertEqual(c["status"], "blocked")
        self.assertEqual(c["blockers"][-1]["kind"], "approvals_missing")

    def test_11_ready_needs_confirmed_merge_state(self):
        c = run(pr(reviews=[review("rev", "APPROVED", "2026-10-30T10:00:00Z")], mergeable="UNKNOWN"))
        self.assertEqual(c["status"], "action_needed")  # never "ready" without confirmation
        self.assertIn("merge state", c["missing"])

    def test_12_draft(self):
        c = run(pr(draft=True, reviews=[review("rev", "APPROVED", "2026-10-30T10:00:00Z")]))
        self.assertEqual((c["status"], c["responsible"]), ("draft", "author"))

    def test_13_stale_flag(self):
        c = run(pr(created_at="2026-09-01T00:00:00Z", last_commit_at="2026-10-01T00:00:00Z", requested_reviewers=["someone"]))
        self.assertTrue(c["stale"])
        self.assertEqual(c["status"], "waiting_for_review")  # stale is secondary

    def test_14_stale_and_blocked(self):
        c = run(pr(created_at="2026-09-01T00:00:00Z", last_commit_at="2026-10-01T00:00:00Z", checks="FAILURE"))
        self.assertEqual((c["status"], c["stale"]), ("blocked", True))

    def test_15_missing_review_data_is_triage_not_a_guess(self):
        c = run(pr(reviews=None, checks=None, mergeable=None))
        self.assertEqual((c["status"], c["responsible"], c["completeness"]), ("needs_triage", "unknown", "insufficient"))

    def test_16_missing_check_data_blocks_ready(self):
        c = run(pr(reviews=[review("rev", "APPROVED", "2026-10-30T10:00:00Z")], checks=None))
        self.assertEqual(c["status"], "action_needed")
        self.assertIn("checks", c["missing"])

    def test_17_unknown_viewer_cannot_claim_my_review(self):
        c = run(pr(requested_reviewers=["maintainer"]), viewer=None)
        self.assertEqual(c["status"], "waiting_for_review")
        self.assertIn("your GitHub identity", c["missing"])

    def test_18_no_timestamps(self):
        c = run(pr(created_at=None, last_commit_at=None))
        self.assertIsNone(c["stale"])
        self.assertIsNone(c["last_activity_at"])

    def test_19_removed_review_request_falls_back_to_triage(self):
        # a request GitHub no longer lists is simply absent from requested_reviewers
        c = run(pr(requested_reviewers=[]))
        self.assertEqual((c["status"], c["next_action"]), ("action_needed", "Triage: review it or request a reviewer"))

    def test_20_newer_review_supersedes_older(self):
        p = pr(reviews=[review("rev", "CHANGES_REQUESTED", "2026-10-29T09:00:00Z"), review("rev", "APPROVED", "2026-10-30T09:00:00Z")])
        self.assertEqual(run(p)["status"], "ready_to_merge")


class Chronology(unittest.TestCase):
    def test_comment_does_not_override_decision(self):
        p = pr(reviews=[review("rev", "CHANGES_REQUESTED", "2026-10-30T09:00:00Z"), review("rev", "COMMENTED", "2026-10-30T11:00:00Z")])
        self.assertEqual(run(p)["status"], "waiting_on_author")

    def test_dismissed_review_clears_decision(self):
        p = pr(reviews=[review("rev", "CHANGES_REQUESTED", "2026-10-29T09:00:00Z"), review("rev", "DISMISSED", "2026-10-30T09:00:00Z")])
        self.assertEqual(run(p)["next_action"], "Triage: review it or request a reviewer")

    def test_commit_after_other_reviewers_change_request(self):
        p = pr(reviews=[review("rev", "CHANGES_REQUESTED", "2026-10-29T08:00:00Z")], last_commit_at="2026-10-30T09:00:00Z")
        c = run(p)
        self.assertEqual((c["status"], c["responsible"]), ("waiting_for_review", "reviewer"))
        self.assertIn("@rev", c["next_action"])

    def test_deterministic(self):
        p = pr(reviews=[review("a", "APPROVED", "2026-10-30T10:00:00Z")], checks="PENDING")
        self.assertEqual(run(p), run(p))


class Normalization(unittest.TestCase):
    def test_graphql_node(self):
        node = {"number": 7, "isDraft": False, "author": {"login": "x"}, "createdAt": "2026-10-01T00:00:00Z",
                "reviewRequests": {"nodes": [{"requestedReviewer": {"login": "maintainer"}}, {"requestedReviewer": {"slug": "core"}}]},
                "latestOpinionatedReviews": {"nodes": [{"author": {"login": "r"}, "state": "APPROVED", "submittedAt": "2026-10-02T00:00:00Z"}]},
                "commits": {"nodes": [{"commit": {"committedDate": "2026-10-03T00:00:00Z", "statusCheckRollup": {"state": "FAILURE", "contexts": {"nodes": [{"name": "lint", "conclusion": "FAILURE"}]}}}}]},
                "mergeable": "MERGEABLE", "reviewDecision": "APPROVED", "labels": {"nodes": [{"name": "bug"}]}}
        n = L.normalize_graphql_pr(node)
        self.assertEqual((n["requested_reviewers"], n["requested_teams"], n["checks"], n["failing_checks"], n["labels"]),
                         (["maintainer"], ["core"], "FAILURE", ["lint"], ["bug"]))

    def test_no_rollup_means_no_checks_configured(self):
        n = L.normalize_graphql_pr({"commits": {"nodes": [{"commit": {"committedDate": "2026-10-03T00:00:00Z", "statusCheckRollup": None}}]}})
        self.assertEqual(n["checks"], "NONE")

    def test_rest_fallback_marks_unknowns(self):
        n = L.normalize_rest_pr({"number": 3, "user": {"login": "x"}, "requested_reviewers": [{"login": "y"}], "draft": False})
        self.assertEqual((n["reviews"], n["checks"], n["mergeable"]), (None, None, None))

    def test_summary_counts_are_exclusive(self):
        cs = [run(pr(draft=True)), run(pr(checks="FAILURE")), run(pr(created_at="2026-01-01T00:00:00Z", last_commit_at="2026-01-02T00:00:00Z"))]
        s = L.summarize(cs)
        self.assertEqual((s["total"], s["draft"], s["blocked"], s["action_needed"], s["stale"]), (3, 1, 1, 1, 1))


if __name__ == "__main__":
    unittest.main()
