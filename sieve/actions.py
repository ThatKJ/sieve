"""PR lifecycle actions: read the live control state of one PR, and perform one human-confirmed write.

Safety model (see docs/PR_CONTROLS.md):
  * Writes are off unless the engine is started with SIEVE_ENABLE_WRITES=1, whatever the token can do,
    and stay off when the token demonstrably lacks write scope.
  * Every write re-reads the PR from GitHub first and is refused if the head commit moved since the
    maintainer loaded it (stale state), or if `availability()` says the action does not apply.
  * One write per PR at a time, and each confirmation's request_id is accepted once.
  * GitHub's response is the result: after a write the PR is re-read and the expected change checked.
  * The model modules (gemma, llm) never import this module; only POST /api/pr/action calls perform().
"""
import os
import re
import threading
import time
import urllib.parse

from . import github

PERMISSION_RANK = {"READ": 1, "TRIAGE": 2, "WRITE": 3, "MAINTAIN": 4, "ADMIN": 5}
MERGE_METHODS = ("merge", "squash", "rebase")
REVIEW_EVENTS = {"approve": "APPROVE", "request_changes": "REQUEST_CHANGES", "review_comment": "COMMENT"}
ACTIONS = ("merge", "close", "reopen", "approve", "request_changes", "review_comment", "comment", "inline_comment",
           "add_labels", "remove_labels", "add_assignees", "remove_assignees", "request_reviewers",
           "remove_reviewers", "set_milestone", "clear_milestone", "ready_for_review", "convert_to_draft", "update_branch")
LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
HUNK_RE = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@")
MAX_BODY = 65536
MAX_ITEMS = 20
REQUEST_ID_TTL = 600  # seconds a confirmed request_id is remembered

# What GitHub's mergeStateStatus means, in words a maintainer can act on.
MERGE_STATE_TEXT = {
    "CLEAN": "Mergeable: checks and review requirements are satisfied.",
    "HAS_HOOKS": "Mergeable; the repository runs pre-receive hooks on merge.",
    "UNSTABLE": "Mergeable, but some non-required checks are failing.",
    "BEHIND": "The branch is behind the base branch and branch protection requires it to be up to date.",
    "BLOCKED": "Blocked by branch protection: required reviews or required checks are not satisfied.",
    "DIRTY": "Merge conflicts with the base branch must be resolved first.",
    "DRAFT": "Draft pull requests cannot be merged.",
    "UNKNOWN": "GitHub is still computing mergeability. Refresh in a moment.",
}

CONTROLS_QUERY = """
query($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    viewerPermission mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed
    labels(first: 100) { nodes { name } }
    milestones(first: 50, states: OPEN) { nodes { number title } }
    pullRequest(number: $number) {
      id number title url state isDraft merged mergeable mergeStateStatus reviewDecision
      headRefOid baseRefName headRefName isMergeQueueEnabled isInMergeQueue
      mergeQueueEntry { state position }
      author { login }
      milestone { number title }
      labels(first: 50) { nodes { name } }
      assignees(first: 20) { nodes { login } }
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
      latestReviews(first: 20) { nodes { author { login } state submittedAt } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes {
        ... on CheckRun { name status conclusion isRequired(pullRequestNumber: $number) }
        ... on StatusContext { context state isRequired(pullRequestNumber: $number) } } } } } } }
    }
  }
}"""
READY_MUTATION = "mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }"
DRAFT_MUTATION = "mutation($id: ID!) { convertPullRequestToDraft(input: {pullRequestId: $id}) { pullRequest { isDraft } } }"

_in_flight = set()
_seen_requests = {}  # request_id -> monotonic time accepted
_lock = threading.Lock()


class ActionError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def writes_enabled():
    return os.environ.get("SIEVE_ENABLE_WRITES") == "1"


def access():
    """How far Sieve may go, independent of any one repository. Never contains the token."""
    if github.OFFLINE:
        return {"mode": "offline", "source": github.token_source()}
    if not github._get_token():
        return {"mode": "no_token", "source": "none"}
    info = github.token_info()
    mode = "read_only" if not writes_enabled() else ("auth_expired" if info["valid"] is False
                                                     else "token_read_only" if info["write_capable"] == "no" else "write")
    return {"mode": mode, **{k: info[k] for k in ("source", "kind", "login", "scopes", "write_capable")}}


def _check(ctx):
    # ponytail: summarises the latest commit's rollup only (first 100 contexts); enough to explain a block.
    name = ctx.get("name") or ctx.get("context") or "check"
    if "context" in ctx:  # StatusContext
        state = {"SUCCESS": "pass", "FAILURE": "fail", "ERROR": "fail"}.get(ctx.get("state"), "pending")
    elif ctx.get("status") != "COMPLETED":
        state = "pending"
    else:
        state = {"SUCCESS": "pass", "NEUTRAL": "pass", "SKIPPED": "pass"}.get(ctx.get("conclusion"), "fail")
    return {"name": name, "state": state, "required": bool(ctx.get("isRequired"))}


def commentable_lines(patch):
    """(left, right) line numbers GitHub accepts for review comments on this file's diff."""
    left, right, old, new = set(), set(), None, None
    for line in (patch or "").splitlines():
        m = HUNK_RE.match(line)
        if m:
            old, new = int(m.group(1)), int(m.group(2))
        elif old is None or line.startswith("\\"):
            continue
        elif line.startswith("+"):
            right.add(new)
            new += 1
        elif line.startswith("-"):
            left.add(old)
            old += 1
        else:  # context line: commentable on both sides
            left.add(old)
            right.add(new)
            old, new = old + 1, new + 1
    return left, right


def _ranges(lines):
    out, run = [], []
    for n in sorted(lines):
        if run and n == run[-1] + 1:
            run.append(n)
        else:
            if run:
                out.append(f"{run[0]}-{run[-1]}" if len(run) > 1 else str(run[0]))
            run = [n]
    if run:
        out.append(f"{run[0]}-{run[-1]}" if len(run) > 1 else str(run[0]))
    return ",".join(out)


def diff_files(owner, repo, number):
    """Changed files with their current patches, uncached. ponytail: first 300 files (GitHub's per-PR file listing caps at 3000)."""
    files = []
    for page in (1, 2, 3):
        batch = github.get(f"/repos/{owner}/{repo}/pulls/{number}/files", {"per_page": 100, "page": page}, ttl=0)
        files += batch
        if len(batch) < 100:
            break
    return files


def controls(owner, repo, number):
    """Live, uncached lifecycle state of one PR plus which actions apply and why not."""
    data, _ = github.graphql(CONTROLS_QUERY, {"owner": owner, "repo": repo, "number": number}, ttl=0)
    r = data.get("repository")
    if r is None:
        raise github.GitHubError(f"Repository {owner}/{repo} not found or not accessible with this token", status=404)
    p = r.get("pullRequest")
    if p is None:
        raise github.GitHubError(f"Pull request #{number} not found in {owner}/{repo}", status=404)
    commit = ((p.get("commits") or {}).get("nodes") or [{}])[-1].get("commit") or {}
    rollup = commit.get("statusCheckRollup") or {}
    checks = [_check(c) for c in ((rollup.get("contexts") or {}).get("nodes") or []) if c]
    reviewers = [(n.get("requestedReviewer") or {}) for n in (p.get("reviewRequests") or {}).get("nodes", [])]
    queue = p.get("mergeQueueEntry") or {}
    try:
        files = [{"path": f["filename"], **dict(zip(("left", "right"), map(_ranges, commentable_lines(f.get("patch")))))}
                 for f in diff_files(owner, repo, number)]
    except github.GitHubError:
        files = None  # inline comments become unavailable; everything else still works
    c = {
        "pr": {"owner": owner, "repo": repo, "number": number, "id": p["id"], "title": p["title"], "url": p["url"],
               "state": "merged" if p.get("merged") else p["state"].lower(), "draft": bool(p.get("isDraft")),
               "head_sha": p["headRefOid"], "base": p.get("baseRefName"), "head": p.get("headRefName"),
               "author": (p.get("author") or {}).get("login")},
        "viewer": {"login": (data.get("viewer") or {}).get("login"), "permission": r.get("viewerPermission") or "NONE"},
        "access": access(),
        "merge": {
            "methods": [m for m, ok in zip(MERGE_METHODS, (r.get("mergeCommitAllowed"), r.get("squashMergeAllowed"),
                                                           r.get("rebaseMergeAllowed"))) if ok],
            "mergeable": p.get("mergeable") or "UNKNOWN",
            "state": p.get("mergeStateStatus") or "UNKNOWN",
            "state_text": MERGE_STATE_TEXT.get(p.get("mergeStateStatus") or "UNKNOWN", "Unknown merge state."),
            "review_decision": p.get("reviewDecision"),
            "checks_state": rollup.get("state"),
            "checks": checks,
            "queue": {"enabled": bool(p.get("isMergeQueueEnabled")), "queued": bool(p.get("isInMergeQueue")),
                      "state": queue.get("state"), "position": queue.get("position")},
        },
        "labels": [n["name"] for n in (p.get("labels") or {}).get("nodes", [])],
        "repo_labels": [n["name"] for n in (r.get("labels") or {}).get("nodes", [])],
        "milestone": p.get("milestone"),
        "repo_milestones": [{"number": m["number"], "title": m["title"]} for m in (r.get("milestones") or {}).get("nodes", [])],
        "assignees": [n["login"] for n in (p.get("assignees") or {}).get("nodes", [])],
        "requested_reviewers": [x.get("login") or f"team:{x.get('slug')}" for x in reviewers if x],
        "reviews": [{"login": (n.get("author") or {}).get("login"), "state": n.get("state"), "at": n.get("submittedAt")}
                    for n in (p.get("latestReviews") or {}).get("nodes", [])],
        "files": files,
    }
    c["available"] = availability(c)
    return c


def availability(c):
    """{action: None if it may be attempted, else {"status", "reason"}}. GitHub still has the final say."""
    pr, viewer, merge = c["pr"], c["viewer"], c["merge"]
    rank = PERMISSION_RANK.get(viewer["permission"], 0)
    is_author = bool(viewer["login"]) and viewer["login"] == pr["author"]
    is_open = pr["state"] == "open"
    blocked_access = {
        "read_only": "Sieve is in read-only mode. Start the engine with SIEVE_ENABLE_WRITES=1 to allow actions.",
        "no_token": "No GitHub token: set GITHUB_TOKEN or run `gh auth login`.",
        "offline": "Offline mode: GitHub actions are unavailable.",
        "auth_expired": "GitHub rejected the token (expired or revoked). Run `gh auth login` or update GITHUB_TOKEN, then restart the engine.",
        "token_read_only": "The GitHub token has no write scope (needs `repo` or `public_repo`). Sieve stays read-only.",
    }.get(c["access"]["mode"])

    def no(status, reason):
        return {"status": status, "reason": reason}

    def need(level, author_ok=False):
        if rank >= PERMISSION_RANK[level] or (author_ok and is_author):
            return None
        return no(403, f"Needs {level.lower()} access to {pr['owner']}/{pr['repo']}; you have {viewer['permission'].lower()}.")

    not_open = no(409, f"This pull request is already {pr['state']}.") if not is_open else None
    no_self_review = no(409, "GitHub does not let authors approve or request changes on their own pull request.") if is_author else None
    rules = {
        "merge": not_open or (no(409, "Draft pull requests cannot be merged. Mark it ready for review first.") if pr["draft"] else None)
                 or (no(409, MERGE_STATE_TEXT["DIRTY"]) if merge["state"] == "DIRTY" or merge["mergeable"] == "CONFLICTING" else None)
                 or (no(409, "This branch requires GitHub's merge queue. Sieve shows queue status but does not enqueue; use GitHub.")
                     if merge["queue"]["enabled"] else None)
                 or (no(409, "This repository allows no merge method.") if not merge["methods"] else None) or need("WRITE"),
        "close": not_open or need("TRIAGE", author_ok=True),
        "reopen": (no(409, "Merged pull requests cannot be reopened.") if pr["state"] == "merged"
                   else no(409, "This pull request is already open.") if is_open else None) or need("TRIAGE", author_ok=True),
        "approve": not_open or no_self_review or need("READ"),
        "request_changes": not_open or no_self_review or need("READ"),
        "review_comment": not_open or need("READ"),
        "comment": need("READ"),
        "inline_comment": not_open or (no(503, "Could not load this pull request's diff, so line comments are unavailable.")
                                       if c.get("files") is None else None) or need("READ"),
        "add_labels": need("TRIAGE"), "remove_labels": need("TRIAGE"),
        "add_assignees": need("TRIAGE"), "remove_assignees": need("TRIAGE"),
        "request_reviewers": not_open or need("TRIAGE", author_ok=True), "remove_reviewers": not_open or need("TRIAGE", author_ok=True),
        "set_milestone": need("TRIAGE"), "clear_milestone": (no(409, "No milestone is set.") if not c.get("milestone") else None) or need("TRIAGE"),
        "ready_for_review": not_open or (no(409, "Already ready for review.") if not pr["draft"] else None) or need("WRITE", author_ok=True),
        "convert_to_draft": not_open or (no(409, "Already a draft.") if pr["draft"] else None) or need("WRITE", author_ok=True),
        "update_branch": not_open or (no(409, "The branch is not behind its base branch.") if merge["state"] != "BEHIND" else None)
                         or need("WRITE", author_ok=True),
    }
    return {a: (no(403, blocked_access) if blocked_access else rules[a]) for a in ACTIONS}


def _logins(params, key):
    vals = params.get(key)
    if not isinstance(vals, list) or not vals or len(vals) > MAX_ITEMS:
        raise ActionError(f"'{key}' must be a list of 1 to {MAX_ITEMS} GitHub usernames.")
    bad = [v for v in vals if not (isinstance(v, str) and LOGIN_RE.match(v))]
    if bad:
        raise ActionError(f"Not a valid GitHub username: {str(bad[0])[:40]}")
    return vals


def _body(params, required):
    body = params.get("body", "")
    if not isinstance(body, str) or len(body) > MAX_BODY:
        raise ActionError(f"'body' must be text of at most {MAX_BODY} characters.")
    if required and not body.strip():
        raise ActionError("This action needs a message.")
    return body


def validate(action, params, expected_head_sha, request_id):
    """Shape-check a request before touching GitHub. Returns cleaned params."""
    if action not in ACTIONS:
        raise ActionError(f"Unknown action: {str(action)[:40]}")
    if not isinstance(params, dict):
        raise ActionError("'params' must be an object.")
    if not (isinstance(expected_head_sha, str) and SHA_RE.match(expected_head_sha)):
        raise ActionError("'expected_head_sha' (the 40-character head commit you reviewed) is required.")
    if not (isinstance(request_id, str) and REQUEST_ID_RE.match(request_id)):
        raise ActionError("'request_id' (one per confirmation) is required.")
    if action == "merge":
        if params.get("method") not in MERGE_METHODS:
            raise ActionError("'method' must be one of merge, squash, rebase.")
        return {"method": params["method"]}
    if action in ("comment", "request_changes", "review_comment"):
        return {"body": _body(params, required=True)}
    if action in ("approve", "close"):
        return {"body": _body(params, required=False)}
    if action == "inline_comment":
        path, line, side = params.get("path"), params.get("line"), params.get("side", "RIGHT")
        if not isinstance(path, str) or not path or len(path) > 1000:
            raise ActionError("'path' must be a changed file's path.")
        if not isinstance(line, int) or isinstance(line, bool) or line < 1:
            raise ActionError("'line' must be a positive line number.")
        if side not in ("LEFT", "RIGHT"):
            raise ActionError("'side' must be LEFT (old file) or RIGHT (new file).")
        return {"body": _body(params, required=True), "path": path, "line": line, "side": side}
    if action in ("add_labels", "remove_labels"):
        labels = params.get("labels")
        if not isinstance(labels, list) or not labels or len(labels) > MAX_ITEMS or \
                not all(isinstance(x, str) and 0 < len(x.strip()) <= 50 for x in labels):
            raise ActionError(f"'labels' must be a list of 1 to {MAX_ITEMS} label names.")
        return {"labels": [x.strip() for x in labels]}
    if action in ("add_assignees", "remove_assignees"):
        return {"assignees": _logins(params, "assignees")}
    if action in ("request_reviewers", "remove_reviewers"):
        return {"reviewers": _logins(params, "reviewers")}
    if action == "set_milestone":
        m = params.get("milestone")
        if not isinstance(m, int) or isinstance(m, bool) or m < 1:
            raise ActionError("'milestone' must be a milestone number.")
        return {"milestone": m}
    return {}


def _execute(c, action, params):
    """Perform the write. Returns (message, evidence_url_or_None)."""
    pr = c["pr"]
    base = f"/repos/{pr['owner']}/{pr['repo']}"
    n, sha = pr["number"], pr["head_sha"]
    if action == "merge":
        if params["method"] not in c["merge"]["methods"]:
            raise ActionError(f"This repository does not allow '{params['method']}' merges. "
                              f"Allowed: {', '.join(c['merge']['methods'])}.", status=409)
        res = github.write("PUT", f"{base}/pulls/{n}/merge", {"merge_method": params["method"], "sha": sha})
        if not res.get("merged"):
            raise ActionError(f"GitHub did not merge: {res.get('message') or 'no reason given'}", status=409)
        return f"Merged #{n} ({params['method']}) as {str(res.get('sha', ''))[:7]}.", None
    if action == "close":
        github.write("PATCH", f"{base}/pulls/{n}", {"state": "closed"})
        if params["body"].strip():
            try:
                res = github.write("POST", f"{base}/issues/{n}/comments", {"body": params["body"]})
                return f"Closed #{n} with a closing comment. The branch was not deleted.", res.get("html_url")
            except github.GitHubError as e:
                return f"Closed #{n}, but the closing comment failed: {e}", None
        return f"Closed #{n}. The branch was not deleted.", None
    if action == "reopen":
        github.write("PATCH", f"{base}/pulls/{n}", {"state": "open"})
        return f"Reopened #{n}.", None
    if action in REVIEW_EVENTS:
        body = {"event": REVIEW_EVENTS[action], "commit_id": sha}
        if params["body"].strip():
            body["body"] = params["body"]
        res = github.write("POST", f"{base}/pulls/{n}/reviews", body)
        verb = {"approve": "Approved", "request_changes": "Requested changes on", "review_comment": "Submitted a review comment on"}[action]
        return f"{verb} #{n} at {sha[:7]}.", res.get("html_url")
    if action == "comment":
        res = github.write("POST", f"{base}/issues/{n}/comments", {"body": params["body"]})
        return f"Commented on #{n}.", res.get("html_url")
    if action == "inline_comment":
        # Re-validate against the diff at the head SHA just confirmed; never guess a position.
        f = next((f for f in diff_files(pr["owner"], pr["repo"], n) if f["filename"] == params["path"]), None)
        if f is None:
            raise ActionError(f"{params['path'][:200]} is not changed in this pull request.", status=422)
        if not f.get("patch"):
            raise ActionError("GitHub provides no diff for this file (binary or too large), so it cannot take line comments.", status=422)
        left, right = commentable_lines(f["patch"])
        if params["line"] not in (right if params["side"] == "RIGHT" else left):
            raise ActionError(f"Line {params['line']} ({'new' if params['side'] == 'RIGHT' else 'old'} file) is not part of this diff. "
                              f"Commentable: {_ranges(right if params['side'] == 'RIGHT' else left) or 'none'}.", status=422)
        res = github.write("POST", f"{base}/pulls/{n}/comments", {"body": params["body"], "commit_id": sha, "path": params["path"],
                                                                  "line": params["line"], "side": params["side"]})
        return f"Commented on {params['path']}:{params['line']} at {sha[:7]}.", res.get("html_url")
    if action == "add_labels":
        unknown = [x for x in params["labels"] if x not in c["repo_labels"]]
        if unknown:  # GitHub would silently create them; Sieve only applies labels that already exist
            raise ActionError(f"No label named '{unknown[0][:50]}' in this repository.", status=422)
        github.write("POST", f"{base}/issues/{n}/labels", {"labels": params["labels"]})
        return f"Added {', '.join(params['labels'])} to #{n}.", None
    if action == "remove_labels":
        missing = [x for x in params["labels"] if x not in c["labels"]]
        if missing:
            raise ActionError(f"'{missing[0][:50]}' is not on this pull request.", status=422)
        for label in params["labels"]:
            github.write("DELETE", f"{base}/issues/{n}/labels/{urllib.parse.quote(label, safe='')}")
        return f"Removed {', '.join(params['labels'])} from #{n}.", None
    if action in ("add_assignees", "remove_assignees"):
        res = github.write("POST" if action == "add_assignees" else "DELETE", f"{base}/issues/{n}/assignees",
                           {"assignees": params["assignees"]})
        now = {a["login"] for a in res.get("assignees") or []}
        if action == "add_assignees" and not set(params["assignees"]) <= now:
            # GitHub returns 201 but silently skips users who cannot be assigned
            raise ActionError(f"GitHub did not assign {', '.join(sorted(set(params['assignees']) - now))}: "
                              "they may lack access to this repository.", status=422)
        return ("Assigned " if action == "add_assignees" else "Unassigned ") + ", ".join(params["assignees"]) + f" on #{n}.", None
    if action in ("request_reviewers", "remove_reviewers"):
        github.write("POST" if action == "request_reviewers" else "DELETE", f"{base}/pulls/{n}/requested_reviewers",
                     {"reviewers": params["reviewers"]})
        return ("Requested review from " if action == "request_reviewers" else "Removed review request for ") + \
            ", ".join(params["reviewers"]) + f" on #{n}.", None
    if action == "set_milestone":
        m = next((m for m in c["repo_milestones"] if m["number"] == params["milestone"]), None)
        if m is None:
            raise ActionError(f"No open milestone #{params['milestone']} in this repository.", status=422)
        github.write("PATCH", f"{base}/issues/{n}", {"milestone": m["number"]})
        return f"Set milestone '{m['title']}' on #{n}.", None
    if action == "clear_milestone":
        github.write("PATCH", f"{base}/issues/{n}", {"milestone": None})
        return f"Cleared the milestone on #{n}.", None
    if action in ("ready_for_review", "convert_to_draft"):
        github.graphql_mutation(READY_MUTATION if action == "ready_for_review" else DRAFT_MUTATION, {"id": pr["id"]})
        return (f"Marked #{n} ready for review." if action == "ready_for_review" else f"Converted #{n} to a draft."), None
    if action == "update_branch":
        github.write("PUT", f"{base}/pulls/{n}/update-branch", {"expected_head_sha": sha})
        return f"GitHub accepted the request to update #{n} from {pr['base']}.", None
    raise ActionError(f"Unknown action: {action}")


def verify(action, params, after, viewer):
    """Did GitHub's re-read state change as intended? True, False, or None when it cannot be checked immediately."""
    if after is None:
        return None
    pr = after["pr"]
    my_review = next((r["state"] for r in after["reviews"] if r["login"] == viewer), None)
    checks = {
        "merge": lambda: pr["state"] == "merged",
        "close": lambda: pr["state"] == "closed",
        "reopen": lambda: pr["state"] == "open",
        "approve": lambda: my_review == "APPROVED",
        "request_changes": lambda: my_review == "CHANGES_REQUESTED",
        "add_labels": lambda: set(params["labels"]) <= set(after["labels"]),
        "remove_labels": lambda: not set(params["labels"]) & set(after["labels"]),
        "add_assignees": lambda: set(params["assignees"]) <= set(after["assignees"]),
        "remove_assignees": lambda: not set(params["assignees"]) & set(after["assignees"]),
        "request_reviewers": lambda: set(params["reviewers"]) <= set(after["requested_reviewers"]),
        "remove_reviewers": lambda: not set(params["reviewers"]) & set(after["requested_reviewers"]),
        "set_milestone": lambda: (after["milestone"] or {}).get("number") == params["milestone"],
        "clear_milestone": lambda: after["milestone"] is None,
        "ready_for_review": lambda: not pr["draft"],
        "convert_to_draft": lambda: pr["draft"],
    }
    # comments carry GitHub's own URL as evidence; update_branch completes asynchronously on GitHub
    return checks[action]() if action in checks else None


def perform(owner, repo, number, action, params, expected_head_sha, request_id):
    """Validate, re-check live state, perform one write, re-read and verify.

    Returns {"ok", "action", "message", "evidence", "verified", "controls"}; raises ActionError / github.GitHubError.
    """
    params = validate(action, params, expected_head_sha, request_id)
    key = (owner.lower(), repo.lower(), number)
    with _lock:
        now = time.monotonic()
        for rid in [r for r, t in _seen_requests.items() if now - t > REQUEST_ID_TTL]:
            del _seen_requests[rid]
        if request_id in _seen_requests:
            raise ActionError("This confirmation was already submitted. Nothing was sent again.", status=409)
        if key in _in_flight:
            raise ActionError("Another action on this pull request is still in progress.", status=409)
        _in_flight.add(key)
        _seen_requests[request_id] = now
    try:
        c = controls(owner, repo, number)
        if c["pr"]["head_sha"] != expected_head_sha:
            raise ActionError(f"The pull request changed since you loaded it (head is now {c['pr']['head_sha'][:7]}, "
                              f"you reviewed {expected_head_sha[:7]}). Review the new state before acting.", status=409)
        blocked = c["available"][action]
        if blocked:
            raise ActionError(blocked["reason"], status=blocked["status"])
        message, evidence = _execute(c, action, params)
    finally:
        # request_id stays remembered even on failure: after a network error GitHub may have applied the
        # write, so retrying needs a fresh confirmation (and a fresh request_id), never a silent resend.
        with _lock:
            _in_flight.discard(key)
    try:
        after = controls(owner, repo, number)
    except github.GitHubError:
        after = None  # the write succeeded; only the follow-up read failed
    return {"ok": True, "action": action, "message": message, "evidence": evidence,
            "verified": verify(action, params, after, c["viewer"]["login"]), "controls": after}
