"""PR lifecycle classification: who needs to act next, and why.

Pure and deterministic: the same input always gives the same output, and nothing here touches the
network. Input is one normalized PR (see `normalize_graphql_pr` / `normalize_rest_pr`); output is a
primary status, the responsible party, the next action, and the evidence behind them.

Precedence (first matching rule wins), so statuses never contradict each other:

  1. draft                                   → DRAFT                  (author)
  2. merge conflict                          → BLOCKED, hard          (author)
  3. checks failing                          → BLOCKED, hard          (author)
  4. a reviewer's latest review requests changes:
       no commit since that review           → WAITING ON AUTHOR      (author)
       new commit since that review          → re-review needed: ACTION NEEDED if that reviewer is
                                               you, else WAITING FOR REVIEW (reviewer)
  5. review requested from you               → ACTION NEEDED          (maintainer)
  6. review requested from others / teams    → WAITING FOR REVIEW     (reviewer)
  7. approved:
       checks pending                        → BLOCKED, soft          (CI)
       more approvals required               → BLOCKED, soft          (maintainer)
       mergeable and checks pass             → READY TO MERGE         (maintainer)
       merge state not confirmed             → ACTION NEEDED: verify  (maintainer)
  8. reviews unknown (data unavailable)      → NEEDS TRIAGE           (unknown)
  9. otherwise (nobody reviewing yet)        → ACTION NEEDED: triage  (maintainer)

Stale is a secondary flag, independent of the primary status: no commit or review for
`stale_days` (default 14). Comments are not counted as meaningful activity.
"""
from datetime import datetime, timezone

STATUSES = ("action_needed", "waiting_on_author", "waiting_for_review", "blocked", "ready_to_merge", "draft", "needs_triage")
DEFAULT_STALE_DAYS = 14
OPINIONATED = {"APPROVED", "CHANGES_REQUESTED", "DISMISSED"}
EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def _ts(value):
    """Parse an ISO-8601 timestamp; None for missing or malformed values."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def latest_reviews(reviews):
    """Each reviewer's latest opinionated review (approve / request changes / dismissed).

    Comments don't change a reviewer's decision, so they're ignored. A later review by the same
    person supersedes the earlier one; a dismissed review clears that reviewer's decision.
    """
    latest = {}
    for r in reviews or []:
        if r.get("state") not in OPINIONATED or not r.get("author"):
            continue
        t = _ts(r.get("submitted_at"))
        prev = latest.get(r["author"])
        if prev is None or (t or EPOCH) >= (prev["_t"] or EPOCH):
            latest[r["author"]] = {**r, "_t": t}
    return {a: r for a, r in latest.items() if r["state"] != "DISMISSED"}


def last_activity(pr):
    """Latest commit or review timestamp (comments excluded), else creation time."""
    times = [_ts(pr.get("last_commit_at")), _ts(pr.get("created_at"))]
    times += [_ts(r.get("submitted_at")) for r in pr.get("reviews") or []]
    times = [t for t in times if t]
    return max(times) if times else None


def classify(pr, viewer=None, now=None, stale_days=DEFAULT_STALE_DAYS):
    now = now or datetime.now(timezone.utc)
    evidence, blockers, missing = [], [], []
    reviews_known = pr.get("reviews") is not None
    checks = pr.get("checks")            # "SUCCESS" | "FAILURE" | "PENDING" | "NONE" | None (unknown)
    mergeable = pr.get("mergeable")      # "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | None
    if not reviews_known:
        missing.append("reviews")
    if checks is None:
        missing.append("checks")
    if mergeable in (None, "UNKNOWN"):
        missing.append("merge state")
    if viewer is None:
        missing.append("your GitHub identity")

    activity = last_activity(pr)
    stale = None if activity is None else (now - activity).days >= stale_days
    requested = list(pr.get("requested_reviewers") or [])
    teams = list(pr.get("requested_teams") or [])
    latest = latest_reviews(pr.get("reviews"))
    last_commit = _ts(pr.get("last_commit_at"))

    def result(status, responsible, next_action, reason):
        return {
            "status": status, "responsible": responsible, "next_action": next_action, "reason": reason,
            "evidence": evidence, "blockers": blockers, "stale": stale, "stale_days": stale_days,
            "last_activity_at": activity.isoformat() if activity else None,
            "completeness": "complete" if not missing else ("partial" if reviews_known else "insufficient"),
            "missing": missing,
        }

    # 1. draft
    if pr.get("draft"):
        evidence.append("Marked as a draft by the author")
        return result("draft", "author", "Finish the work and mark it ready for review", "The author is still working on it")

    # record every blocker first, so they show alongside whichever status wins
    if mergeable == "CONFLICTING":
        blockers.append({"kind": "merge_conflict", "severity": "hard", "detail": "Merge conflicts with the base branch"})
    if checks == "FAILURE":
        failing = pr.get("failing_checks") or []
        blockers.append({"kind": "checks_failed", "severity": "hard",
                         "detail": ("Failing checks: " + ", ".join(failing[:5])) if failing else "Checks are failing"})
    if checks == "PENDING":
        blockers.append({"kind": "checks_pending", "severity": "soft", "detail": "Checks are still running"})

    # 2–3. hard blockers
    if mergeable == "CONFLICTING":
        evidence.append("GitHub reports merge conflicts with the base branch")
        return result("blocked", "author", "Resolve the merge conflicts", "Merge conflicts block this pull request")
    if checks == "FAILURE":
        evidence.append(next(b["detail"] for b in blockers if b["kind"] == "checks_failed"))
        return result("blocked", "author", "Fix the failing checks", "Checks are failing")

    # 4. changes requested, resolved by chronology
    changes = sorted((r for r in latest.values() if r["state"] == "CHANGES_REQUESTED"), key=lambda r: r["_t"] or EPOCH)
    if changes:
        newest = changes[-1]
        who = ", ".join(sorted(f"@{r['author']}" for r in changes))
        evidence.append(f"Latest review from {who} requested changes")
        pushed_after = bool(last_commit and newest["_t"] and last_commit > newest["_t"])
        if not pushed_after:
            evidence.append("No commit since that review" if last_commit and newest["_t"]
                            else "Commit or review time unavailable; assuming no new commit")
            return result("waiting_on_author", "author", "Address the requested changes", f"{who} requested changes")
        evidence.append("The author pushed a new commit after the change request")
        reviewer = newest["author"]
        if viewer and reviewer.lower() == viewer.lower():
            return result("action_needed", "maintainer", "Re-review the updated changes", "New commits since you requested changes")
        return result("waiting_for_review", "reviewer", f"@{reviewer} to re-review the updated changes", "New commits since changes were requested")

    # 5–6. outstanding review requests
    if viewer and any(u.lower() == viewer.lower() for u in requested):
        evidence.append(f"Review requested from you (@{viewer})")
        return result("action_needed", "maintainer", "Review this pull request", "Your review was requested")
    if requested or teams:
        names = [f"@{u}" for u in requested] + [f"team {t}" for t in teams]
        evidence.append("Review requested from " + ", ".join(names))
        return result("waiting_for_review", "reviewer", "Waiting on " + ", ".join(names), "A review is requested from someone else")

    # 7. approved
    approvals = [r for r in latest.values() if r["state"] == "APPROVED"]
    decision = pr.get("review_decision")
    if approvals or decision == "APPROVED":
        if approvals:
            evidence.append("Approved by " + ", ".join(sorted(f"@{r['author']}" for r in approvals)))
        if checks == "PENDING":
            evidence.append("Checks are still running")
            return result("blocked", "ci", "Wait for checks to finish", "Approved, but checks are still running")
        if decision == "REVIEW_REQUIRED":
            blockers.append({"kind": "approvals_missing", "severity": "soft", "detail": "Branch protection requires more approvals"})
            evidence.append("GitHub reports more approvals are required")
            return result("blocked", "maintainer", "Get the remaining required approvals", "Approved, but more approvals are required")
        if mergeable == "MERGEABLE" and checks in ("SUCCESS", "NONE"):
            evidence.append("GitHub reports it can merge cleanly")
            evidence.append("All checks passed" if checks == "SUCCESS" else "No checks are configured")
            return result("ready_to_merge", "maintainer", "Merge when ready", "Approved, checks pass, no conflicts")
        evidence.append("Merge state or checks could not be confirmed")
        return result("action_needed", "maintainer", "Verify merge requirements before merging", "Approved, but merge readiness is unconfirmed")

    # 8. no review data: say so rather than guess
    if not reviews_known:
        evidence.append("Review data is unavailable for this pull request")
        return result("needs_triage", "unknown", "Open the pull request to check its review state", "Sieve could not load review data")

    # 9. nobody is reviewing yet
    evidence.append("No reviews and no review requests yet")
    return result("action_needed", "maintainer", "Triage: review it or request a reviewer", "Waiting for maintainer triage")


# ---------------------------------------------------------------- normalization

FAILED_CONCLUSIONS = {"FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"}


def normalize_graphql_pr(node):
    """Flatten one GraphQL pullRequest node into the classifier's input shape."""
    reviewers, teams = [], []
    for rr in (node.get("reviewRequests") or {}).get("nodes") or []:
        who = rr.get("requestedReviewer") or {}
        if who.get("login"):
            reviewers.append(who["login"])
        elif who.get("slug"):
            teams.append(who["slug"])
    reviews = [
        {"author": (r.get("author") or {}).get("login"), "state": r.get("state"), "submitted_at": r.get("submittedAt")}
        for r in (node.get("latestOpinionatedReviews") or {}).get("nodes") or []
    ]
    commit_nodes = (node.get("commits") or {}).get("nodes") or []
    commit = (commit_nodes[0] or {}).get("commit") if commit_nodes else None
    checks, failing = None, []
    if commit is not None:
        rollup = commit.get("statusCheckRollup")
        if rollup is None:
            checks = "NONE"  # the head commit has no checks or statuses at all
        else:
            checks = {"SUCCESS": "SUCCESS", "FAILURE": "FAILURE", "ERROR": "FAILURE", "PENDING": "PENDING", "EXPECTED": "PENDING"}.get(rollup.get("state"))
            for c in (rollup.get("contexts") or {}).get("nodes") or []:
                if c.get("conclusion") in FAILED_CONCLUSIONS or c.get("state") in ("FAILURE", "ERROR"):
                    failing.append(c.get("name") or c.get("context") or "check")
    return {
        "number": node.get("number"),
        "title": node.get("title"),
        "url": node.get("url"),
        "author": (node.get("author") or {}).get("login"),
        "draft": bool(node.get("isDraft")),
        "created_at": node.get("createdAt"),
        "labels": [l.get("name") for l in (node.get("labels") or {}).get("nodes") or [] if l.get("name")],
        "requested_reviewers": reviewers,
        "requested_teams": teams,
        "reviews": reviews,
        "review_decision": node.get("reviewDecision"),
        "mergeable": node.get("mergeable"),
        "checks": checks,
        "failing_checks": failing,
        "last_commit_at": (commit or {}).get("committedDate"),
    }


def normalize_rest_pr(pr):
    """Fallback from the REST pulls list: reviews, checks and merge state aren't available there."""
    return {
        "number": pr.get("number"),
        "title": pr.get("title"),
        "url": pr.get("html_url"),
        "author": (pr.get("user") or {}).get("login"),
        "draft": bool(pr.get("draft")),
        "created_at": pr.get("created_at"),
        "labels": [l.get("name") for l in pr.get("labels") or [] if l.get("name")],
        "requested_reviewers": [u.get("login") for u in pr.get("requested_reviewers") or [] if u.get("login")],
        "requested_teams": [t.get("slug") for t in pr.get("requested_teams") or [] if t.get("slug")],
        "reviews": None,
        "review_decision": None,
        "mergeable": None,
        "checks": None,
        "failing_checks": [],
        "last_commit_at": None,
    }


def summarize(classified):
    """Mutually exclusive counts per primary status, plus the independent stale flag."""
    counts = {s: 0 for s in STATUSES}
    for c in classified:
        counts[c["status"]] += 1
    counts["stale"] = sum(1 for c in classified if c["stale"])
    counts["total"] = len(classified)
    return counts
