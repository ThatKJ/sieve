"""PR lifecycle actions: read the live control state of one PR, and perform a human-confirmed write.

Safety model (see docs/PR_CONTROLS.md):
  * Writes are off unless the engine is started with SIEVE_ENABLE_WRITES=1, whatever the token can do.
  * Every write re-reads the PR from GitHub first and is refused if the head commit moved since the
    maintainer loaded it (stale state), or if `availability()` says the action does not apply.
  * One write per PR at a time; a second concurrent request is refused, not queued.
  * GitHub's response is the result: nothing is reported as done until GitHub confirms it.
  * Nothing here is reachable from the model code paths (gemma/llm); only /api/pr/action calls perform().
"""
import os
import re
import threading

from . import github

PERMISSION_RANK = {"READ": 1, "TRIAGE": 2, "WRITE": 3, "MAINTAIN": 4, "ADMIN": 5}
MERGE_METHODS = ("merge", "squash", "rebase")
REVIEW_EVENTS = {"approve": "APPROVE", "request_changes": "REQUEST_CHANGES", "review_comment": "COMMENT"}
ACTIONS = ("merge", "close", "reopen", "approve", "request_changes", "review_comment", "comment",
           "add_labels", "remove_labels", "add_assignees", "remove_assignees", "request_reviewers",
           "remove_reviewers", "ready_for_review", "convert_to_draft", "update_branch")
LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
MAX_BODY = 65536
MAX_ITEMS = 20

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
    pullRequest(number: $number) {
      id number title url state isDraft merged mergeable mergeStateStatus reviewDecision
      headRefOid baseRefName headRefName
      author { login }
      labels(first: 50) { nodes { name } }
      assignees(first: 20) { nodes { login } }
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes {
        ... on CheckRun { name status conclusion isRequired(pullRequestNumber: $number) }
        ... on StatusContext { context state isRequired(pullRequestNumber: $number) } } } } } } }
    }
  }
}"""
READY_MUTATION = "mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }"
DRAFT_MUTATION = "mutation($id: ID!) { convertPullRequestToDraft(input: {pullRequestId: $id}) { pullRequest { isDraft } } }"

_in_flight = set()
_lock = threading.Lock()


class ActionError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def writes_enabled():
    return os.environ.get("SIEVE_ENABLE_WRITES") == "1"


def access_mode():
    """read-only / write / no_token / offline: how far Sieve may go, independent of any one repository."""
    if github.OFFLINE:
        return "offline"
    if not github._get_token():
        return "no_token"
    return "write" if writes_enabled() else "read_only"


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
    c = {
        "pr": {"owner": owner, "repo": repo, "number": number, "id": p["id"], "title": p["title"], "url": p["url"],
               "state": "merged" if p.get("merged") else p["state"].lower(), "draft": bool(p.get("isDraft")),
               "head_sha": p["headRefOid"], "base": p.get("baseRefName"), "head": p.get("headRefName"),
               "author": (p.get("author") or {}).get("login")},
        "viewer": {"login": (data.get("viewer") or {}).get("login"), "permission": r.get("viewerPermission") or "NONE"},
        "access": access_mode(),
        "merge": {
            "methods": [m for m, ok in zip(MERGE_METHODS, (r.get("mergeCommitAllowed"), r.get("squashMergeAllowed"),
                                                           r.get("rebaseMergeAllowed"))) if ok],
            "mergeable": p.get("mergeable") or "UNKNOWN",
            "state": p.get("mergeStateStatus") or "UNKNOWN",
            "state_text": MERGE_STATE_TEXT.get(p.get("mergeStateStatus") or "UNKNOWN", "Unknown merge state."),
            "review_decision": p.get("reviewDecision"),
            "checks_state": rollup.get("state"),
            "checks": checks,
        },
        "labels": [n["name"] for n in (p.get("labels") or {}).get("nodes", [])],
        "repo_labels": [n["name"] for n in (r.get("labels") or {}).get("nodes", [])],
        "assignees": [n["login"] for n in (p.get("assignees") or {}).get("nodes", [])],
        "requested_reviewers": [x.get("login") or f"team:{x.get('slug')}" for x in reviewers if x],
    }
    c["available"] = availability(c)
    return c


def availability(c):
    """{action: None if it may be attempted, else (http_status, reason)}. GitHub still has the final say."""
    pr, viewer, merge = c["pr"], c["viewer"], c["merge"]
    rank = PERMISSION_RANK.get(viewer["permission"], 0)
    is_author = bool(viewer["login"]) and viewer["login"] == pr["author"]
    is_open = pr["state"] == "open"
    blocked_access = {
        "read_only": "Sieve is in read-only mode. Start the engine with SIEVE_ENABLE_WRITES=1 to allow actions.",
        "no_token": "No GitHub token: set GITHUB_TOKEN or run `gh auth login`.",
        "offline": "Offline mode: GitHub actions are unavailable.",
    }.get(c["access"])

    def need(level, author_ok=False):
        if rank >= PERMISSION_RANK[level] or (author_ok and is_author):
            return None
        return 403, f"Needs {level.lower()} access to {pr['owner']}/{pr['repo']}; you have {viewer['permission'].lower()}."

    not_open = (409, f"This pull request is already {pr['state']}.") if not is_open else None
    rules = {
        "merge": not_open or ((409, "Draft pull requests cannot be merged. Mark it ready for review first.") if pr["draft"] else None)
                 or ((409, MERGE_STATE_TEXT["DIRTY"]) if merge["state"] == "DIRTY" or merge["mergeable"] == "CONFLICTING" else None)
                 or ((409, "This repository allows no merge method.") if not merge["methods"] else None) or need("WRITE"),
        "close": not_open or need("TRIAGE", author_ok=True),
        "reopen": ((409, "Merged pull requests cannot be reopened.") if pr["state"] == "merged"
                   else (409, "This pull request is already open.") if is_open else None) or need("TRIAGE", author_ok=True),
        "approve": not_open or ((409, "GitHub does not let authors approve their own pull request.") if is_author else None) or need("READ"),
        "request_changes": not_open or ((409, "GitHub does not let authors request changes on their own pull request.") if is_author else None) or need("READ"),
        "review_comment": not_open or need("READ"),
        "comment": need("READ"),
        "add_labels": need("TRIAGE"), "remove_labels": need("TRIAGE"),
        "add_assignees": need("TRIAGE"), "remove_assignees": need("TRIAGE"),
        "request_reviewers": not_open or need("TRIAGE", author_ok=True), "remove_reviewers": not_open or need("TRIAGE", author_ok=True),
        "ready_for_review": not_open or ((409, "Already ready for review.") if not pr["draft"] else None) or need("WRITE", author_ok=True),
        "convert_to_draft": not_open or ((409, "Already a draft.") if pr["draft"] else None) or need("WRITE", author_ok=True),
        "update_branch": not_open or ((409, "The branch is not behind its base branch.") if merge["state"] != "BEHIND" else None) or need("WRITE", author_ok=True),
    }
    return {a: ((403, blocked_access) if blocked_access else rules[a]) for a in ACTIONS}


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


def validate(action, params, expected_head_sha):
    """Shape-check a request before touching GitHub. Returns cleaned params."""
    if action not in ACTIONS:
        raise ActionError(f"Unknown action: {str(action)[:40]}")
    if not isinstance(params, dict):
        raise ActionError("'params' must be an object.")
    if not (isinstance(expected_head_sha, str) and SHA_RE.match(expected_head_sha)):
        raise ActionError("'expected_head_sha' (the 40-character head commit you reviewed) is required.")
    if action == "merge":
        if params.get("method") not in MERGE_METHODS:
            raise ActionError("'method' must be one of merge, squash, rebase.")
        return {"method": params["method"]}
    if action in ("comment", "request_changes", "review_comment"):
        return {"body": _body(params, required=True)}
    if action in ("approve", "close"):
        return {"body": _body(params, required=False)}
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
    return {}


def _execute(c, action, params):
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
        return f"Merged #{n} ({params['method']}) as {str(res.get('sha', ''))[:7]}."
    if action == "close":
        github.write("PATCH", f"{base}/pulls/{n}", {"state": "closed"})
        if params["body"].strip():
            try:
                github.write("POST", f"{base}/issues/{n}/comments", {"body": params["body"]})
            except github.GitHubError as e:
                return f"Closed #{n}, but the closing comment failed: {e}"
        return f"Closed #{n}. The branch was not deleted."
    if action == "reopen":
        github.write("PATCH", f"{base}/pulls/{n}", {"state": "open"})
        return f"Reopened #{n}."
    if action in REVIEW_EVENTS:
        body = {"event": REVIEW_EVENTS[action], "commit_id": sha}
        if params["body"].strip():
            body["body"] = params["body"]
        github.write("POST", f"{base}/pulls/{n}/reviews", body)
        return {"approve": "Approved", "request_changes": "Requested changes on", "review_comment": "Submitted a review comment on"}[action] + f" #{n} at {sha[:7]}."
    if action == "comment":
        github.write("POST", f"{base}/issues/{n}/comments", {"body": params["body"]})
        return f"Commented on #{n}."
    if action == "add_labels":
        unknown = [x for x in params["labels"] if x not in c["repo_labels"]]
        if unknown:  # GitHub would silently create them; Sieve only applies labels that already exist
            raise ActionError(f"No label named '{unknown[0][:50]}' in this repository.", status=422)
        github.write("POST", f"{base}/issues/{n}/labels", {"labels": params["labels"]})
        return f"Added {', '.join(params['labels'])} to #{n}."
    if action == "remove_labels":
        for label in params["labels"]:
            if label in c["labels"]:
                github.write("DELETE", f"{base}/issues/{n}/labels/{github.urllib.parse.quote(label, safe='')}")
        return f"Removed {', '.join(params['labels'])} from #{n}."
    if action in ("add_assignees", "remove_assignees"):
        res = github.write("POST" if action == "add_assignees" else "DELETE", f"{base}/issues/{n}/assignees",
                           {"assignees": params["assignees"]})
        now = {a["login"] for a in res.get("assignees") or []}
        if action == "add_assignees" and not set(params["assignees"]) <= now:
            # GitHub returns 201 but silently skips users who cannot be assigned
            raise ActionError(f"GitHub did not assign {', '.join(sorted(set(params['assignees']) - now))}: "
                              "they may lack access to this repository.", status=422)
        return ("Assigned " if action == "add_assignees" else "Unassigned ") + ", ".join(params["assignees"]) + f" on #{n}."
    if action in ("request_reviewers", "remove_reviewers"):
        github.write("POST" if action == "request_reviewers" else "DELETE", f"{base}/pulls/{n}/requested_reviewers",
                     {"reviewers": params["reviewers"]})
        return ("Requested review from " if action == "request_reviewers" else "Removed review request for ") + ", ".join(params["reviewers"]) + f" on #{n}."
    if action in ("ready_for_review", "convert_to_draft"):
        github.graphql_mutation(READY_MUTATION if action == "ready_for_review" else DRAFT_MUTATION, {"id": pr["id"]})
        return f"Marked #{n} ready for review." if action == "ready_for_review" else f"Converted #{n} to a draft."
    if action == "update_branch":
        github.write("PUT", f"{base}/pulls/{n}/update-branch", {"expected_head_sha": sha})
        return f"GitHub accepted the request to update #{n} from {pr['base']}. The new commit appears once GitHub finishes."
    raise ActionError(f"Unknown action: {action}")


def perform(owner, repo, number, action, params, expected_head_sha):
    """Validate, re-check live state, perform one write, and return GitHub-confirmed state.

    Returns {"ok": True, "action", "message", "controls"}; raises ActionError / github.GitHubError otherwise.
    """
    params = validate(action, params, expected_head_sha)
    key = (owner.lower(), repo.lower(), number)
    with _lock:
        if key in _in_flight:
            raise ActionError("Another action on this pull request is still in progress.", status=409)
        _in_flight.add(key)
    try:
        c = controls(owner, repo, number)
        if c["pr"]["head_sha"] != expected_head_sha:
            raise ActionError(f"The pull request changed since you loaded it (head is now {c['pr']['head_sha'][:7]}, "
                              f"you reviewed {expected_head_sha[:7]}). Review the new state before acting.", status=409)
        blocked = c["available"][action]
        if blocked:
            raise ActionError(blocked[1], status=blocked[0])
        message = _execute(c, action, params)
    finally:
        with _lock:
            _in_flight.discard(key)
    try:
        fresh = controls(owner, repo, number)
    except github.GitHubError:
        fresh = None  # the write succeeded; only the follow-up read failed
    return {"ok": True, "action": action, "message": message, "controls": fresh}
