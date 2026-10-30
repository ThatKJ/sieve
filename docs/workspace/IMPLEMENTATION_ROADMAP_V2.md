# Sieve Workspace V2 — Implementation Roadmap & Execution Plan

**Date:** October 31, 2026  
**Status:** Approved Master Roadmap (Supersedes V1)  
**Guiding Principle:** *Build what removes the most maintainer labor first; do not over-index on AST academic complexity before inbox triage works flawlessly.*

---

## 1. Prioritized Feature Matrix

| Feature | Maintainer Value | Differentiation | Complexity | Priority | Validation Needed |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Origin Security & Host Validation** | High (8/10) | Low (Sanity) | Low (2/10) | **P0 (Completed)** | Zero CORS leakage to malicious web origins |
| **Turn-Taking Inbox (`You` vs `Contributor`)** | Critical (10/10) | High (9/10) | Medium (5/10) | **P0** | Accurately identifies who owes the next action |
| **Cross-PR Duplicate & Collision Detector** | Critical (10/10) | Very High (10/10) | Medium (6/10) | **P0** | Flags competing fixes for same issue / files |
| **GitHub CI Status & Merge Conflict Gates** | High (9/10) | Medium (6/10) | Low (3/10) | **P0** | Flags red CI and merge conflicts on cards |
| **Bot PR Stream Isolation (Renovate/Dependabot)** | High (8/10) | Medium (6/10) | Low (2/10) | **P0** | Declutters main human review inbox |
| **SQLite Cache & Rate-Limit Governor** | High (9/10) | Low (Infrastructure) | Medium (4/10) | **P0** | Zero GitHub API 403 rate-limit failures |
| **Keyboard Shortcuts (`j`/`k`/`r`/`x`)** | High (8/10) | Medium (6/10) | Low (2/10) | **P1** | Linear-speed triage without trackpad fatigue |
| **Interactive 1-Click Contributor Responses** | High (8/10) | High (8/10) | Medium (4/10) | **P1** | Reduces comment drafting time from 3 min to 5 sec |
| **Polyglot AST (TypeScript/JavaScript)** | High (9/10) | High (8/10) | High (8/10) | **P1** | Resolves imports in frontend and node repos |
| **Interactive In-Situ Batch Actions (Merge/Close)** | High (9/10) | High (8/10) | Medium (5/10) | **P1** | 1-click batch actions across selected cards |
| **Historical Hotspot Radar (Cached SQLite)** | Medium (7/10) | Medium (6/10) | Medium (5/10) | **P2** | Flags high-churn regression prone files |
| **Agent Fix & Review Handoff** | Medium (6/10) | High (8/10) | Medium (5/10) | **P2** | Clean prompt export to Claude Code / Aider |
| **Repository Memory & Stored Conventions** | Medium (7/10) | High (8/10) | High (7/10) | **P2** | Auto-enforces maintainer's custom guidelines |

---

## 2. Nine Implementation Milestones

### Milestone 1: Critical Security, Resilience & Origin Hardening (Completed & Verified)
- **User Problem:** Local engine was vulnerable to cross-site request forgery and data exfiltration from malicious web pages via wildcard CORS. Extension was fragile to React DOM hydration.
- **Scope:**
  - Eliminate wildcard CORS (`*`).
  - Add strict origin validation (`chrome-extension://` and `127.0.0.1` only).
  - Implement Host header validation to prevent DNS rebinding.
  - Implement resilient DOM hydration loops for both Command Center and PR Detail pill.
- **Affected Files:** `sieve/server.py`, `extension/content.js`, `extension/github-adapter.js`, `tests/test_engine_capabilities.py`.
- **Definition of Done:** All 46 pytest tests pass; automated curl tests reject unauthorized origins with 403; in-situ GitHub tests pass on both `/pulls` and `/pull/:id`.

---

### Milestone 2: Turn-Taking Inbox & State Triage Engine (P0)
- **User Problem:** Maintainers open `/pulls` and cannot tell which PRs need their attention versus which PRs are waiting on the contributor to fix feedback.
- **Scope:**
  - Query PR review status and commit timeline (`/repos/:owner/:repo/pulls/:id/reviews`).
  - Compute turn status:
    - `Action Needed: You`: Requested for review, or new commits pushed after previous review.
    - `Waiting on Contributor`: Maintainer submitted "Changes Requested" and no new commits exist.
    - `Review Blocked`: Merge conflict or failing CI.
    - `Merge Candidate`: Approved + CI passing.
  - Update Command Center tabs to reflect these 4 actionable buckets.
- **Affected Files:** `sieve/core.py`, `sieve/github.py`, `extension/ui/command-center.js`.
- **Definition of Done:** Every PR card displays an explicit turn badge; clicking tabs instantly filters the queue.

---

### Milestone 3: Cross-PR Contribution Intelligence (Duplicates & Collisions) (P0)
- **User Problem:** Multiple contributors open competing PRs for the same issue or modify overlapping files, wasting maintainer review time.
- **Scope:**
  - In `core.queue()`, build a cross-PR index of modified files and linked issue numbers.
  - Flag duplicates: When 2+ PRs cite the same issue, mark the earlier one as primary and subsequent ones with `⚠️ Duplicate Fix: Collides with PR #X`.
  - Flag file collisions: When 2+ PRs touch the same file paths, highlight potential merge conflicts.
- **Affected Files:** `sieve/core.py`, `extension/ui/command-center.js`.
- **Definition of Done:** Command Center renders a dedicated "Overlapping & Duplicates" tab with collision warnings.

---

### Milestone 4: CI Status & Mergeability Integration (P0)
- **User Problem:** Maintainers spend minutes reviewing a PR only to discover that unit tests are red or git cannot merge the branch cleanly.
- **Scope:**
  - Fetch check runs (`/repos/:owner/:repo/commits/:sha/check-runs`) and mergeable status.
  - Surface status chips on PR cards (`CI Passing ✓`, `CI Failing: test_auth ✗`, `Merge Conflict`).
- **Affected Files:** `sieve/github.py`, `sieve/core.py`, `extension/ui/command-center.js`.
- **Definition of Done:** PR cards immediately communicate CI and mergeable health.

---

### Milestone 5: SQLite Caching & Rate-Limit Governor (P0)
- **User Problem:** Unauthenticated GitHub API calls quickly hit the 60 req/hr rate limit, causing the engine to fail.
- **Scope:**
  - Replace flat-file cache with SQLite (`~/.sieve/workspace.db`).
  - Cache AST graphs, PR diffs, and commit history indexed by commit SHA.
  - Implement a rate-limit governor that reads `x-ratelimit-remaining` and pauses background calls when quota drops below 10.
- **Affected Files:** `sieve/github.py`, `sieve/server.py`.
- **Definition of Done:** Running repeated analyses across 30 PRs consumes zero incremental GitHub API calls when commit SHAs are unchanged.

---

### Milestone 6: Keyboard-Driven Command Center & Fast Triage (P1)
- **User Problem:** Navigating PRs via trackpad/mouse is slow and causes review fatigue.
- **Scope:**
  - Add standard shortcuts (`j`/`k` navigation, `x` selection, `r` open drawer, `Enter` open PR, `Esc` close drawer).
  - Add visual keyboard focus ring matching Liquid Glass tokens.
- **Affected Files:** `extension/ui/command-center.js`, `extension/ui/workspace.css`.
- **Definition of Done:** Maintainer can triage, inspect, and filter 20 PRs entirely from the keyboard.

---

### Milestone 7: Polyglot AST Engine (TypeScript & JavaScript) (P1)
- **User Problem:** Sieve's AST blast radius currently only analyzes Python repositories, providing zero topology on frontend or Node repos.
- **Scope:**
  - Implement static JS/TS import resolution (`import ... from '...'`, `require('...')`).
  - Resolve internal module paths, package `index.ts` files, and relative paths.
  - Map related test files (`*.test.ts`, `*.spec.js`).
- **Affected Files:** `sieve/atlas.py`, `tests/test_atlas.py`.
- **Definition of Done:** TypeScript repositories render complete Blast Radius DAGs with direct dependents and test files.

---

### Milestone 8: Resolution Workspace & 1-Click Review Actions (P1)
- **User Problem:** Maintainer must copy response text and navigate into GitHub's native review form to post comments or close PRs.
- **Scope:**
  - Support authenticated in-situ review submissions (Approve, Request Changes, Close with Comment).
  - Provide one-click templates: "Request Missing Test", "Close Duplicate", "Acknowledge First-Time Contributor".
- **Affected Files:** `extension/ui/pr-intelligence.js`, `sieve/server.py`.
- **Definition of Done:** Maintainer can submit a structured review comment directly from the Sieve Intelligence Drawer.

---

### Milestone 9: Repository Memory & Agent Task Handoff (P2)
- **User Problem:** Maintainers repeatedly enforce the same undocumented repository rules, and have no easy way to dispatch fixes to coding agents.
- **Scope:**
  - Store repository decisions and convention rules in SQLite.
  - Export structured PR triage bundles (diff + blast radius + missing tests) into markdown task prompts ready for Claude Code, Gemini, or Aider.
- **Affected Files:** `sieve/core.py`, `extension/ui/pr-intelligence.js`.
- **Definition of Done:** Maintainer can click "Export Agent Task" to generate a complete prompt for fixing a PR.

---

## 3. THE NEXT 10 THINGS WE SHOULD BUILD

Here are the 10 highest-value tasks, strictly ranked by the amount of real maintainer labor they eliminate:

### 1. Turn-Taking State Engine (`Action Needed: You` vs `Waiting on Author`)
- **Why it matters:** The single biggest maintainer pain is opening GitHub and not knowing which PRs have unreviewed changes waiting on them.
- **Measurable improvement:** Eliminates 80% of maintainer click-hunting across notification threads.

### 2. Multi-PR Duplicate Fix & Collision Detector
- **Why it matters:** Open-source maintainers frequently waste 20 minutes reviewing a PR only to realize another contributor solved the same issue 3 hours earlier.
- **Measurable improvement:** Flags duplicate intent and file collisions across open PRs in 0 milliseconds.

### 3. GitHub Actions CI Status & Merge Conflict Badges
- **Why it matters:** Reviewing code on a PR with failing CI or merge conflicts is wasted effort.
- **Measurable improvement:** Prevents maintainers from reviewing broken or unmergeable PRs.

### 4. Bot Stream Quarantine (Isolating Renovate & Dependabot)
- **Why it matters:** Automated dependency bumps drown out human community contributions in the PR list.
- **Measurable improvement:** Cleans 50%+ of PR list visual noise into a dedicated, batchable tab.

### 5. SQLite Cache & Rate-Limit Governor
- **Why it matters:** Unauthenticated GitHub API calls die after 60 requests. Maintainers cannot use a tool that crashes on active repositories.
- **Measurable improvement:** Reduces GitHub REST API consumption by 90%+ and eliminates 403 errors.

### 6. Keyboard Triage Navigation (`j`/`k`/`r`/`x`)
- **Why it matters:** Power maintainers triage dozens of PRs daily; mouse-clicking induces severe workflow friction.
- **Measurable improvement:** Increases PR triage throughput by 3x–5x.

### 7. 1-Click Contextual Maintainer Review Responses
- **Why it matters:** Drafting repetitive feedback ("Please add a unit test for this edge case") takes minutes per PR.
- **Measurable improvement:** Cuts maintainer response drafting time from 3 minutes to 5 seconds.

### 8. TypeScript & JavaScript AST Import Topology
- **Why it matters:** 70% of open-source web and developer tool repositories use TypeScript/JavaScript, where Sieve currently produces zero topology nodes.
- **Measurable improvement:** Expands Sieve's deterministic blast radius capability to the entire JavaScript/TypeScript ecosystem.

### 9. First-Time Contributor & Low-Effort Slop Screener
- **Why it matters:** Influx of low-quality LLM-generated PRs wastes maintainer time evaluating code that lacks understanding.
- **Measurable improvement:** Surfaces provenance badges (`First-time contributor`, `No linked issue`, `Zero tests`) to instantly identify PRs requiring strict verification.

### 10. Direct In-Situ Review Submission (Merge / Request Changes / Close)
- **Why it matters:** Having to open a new tab just to click GitHub's green "Merge" or "Close" button breaks the workspace flow.
- **Measurable improvement:** Allows complete end-to-end contribution resolution without leaving the Sieve Command Center.

