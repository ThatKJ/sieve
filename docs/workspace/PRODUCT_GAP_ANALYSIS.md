# Sieve Workspace — Product Gap Analysis & Implementation Audit

**Date:** October 31, 2026  
**Auditor:** Principal Product Architect & Staff Security Engineer  
**Status:** Complete Critical Audit (Milestone 1 Retrospective)

---

## 1. Grounded Verification of What Actually Exists

We audited every file, network request, DOM mutation, and background task in the repository against the previous Milestone 1 implementation claims. We did not accept prior documentation as proof.

### Feature Classification Matrix

| Feature / Capability | Classification | Verification Evidence & Technical Reality |
| :--- | :--- | :--- |
| **Manifest V3 Setup (`extension/manifest.json`)** | **Implemented and verified** | Passes schema validation. Correct permissions (`storage`, `host_permissions` for GitHub and `127.0.0.1:8787`). Loads cleanly into Chromium. |
| **Extension Popup (`extension/popup/`)** | **Implemented and verified** | Displays engine health (`Connected (qwen3.5:9b)`), allows setting default view preferences (`native` vs `sieve`), persists state in `chrome.storage.local`. Verified via Playwright. |
| **Shadow DOM Encapsulation (`#sieve-workspace-host`)** | **Implemented and verified** | Mounts an open Shadow Root on GitHub. Encapsulates `ui/workspace.css`. Prevents GitHub Primer CSS from leaking into Sieve and vice versa. Verified via Playwright. |
| **Native View Switcher (`.sieve-native-switcher`)** | **Implemented and verified** | Injected adjacent to GitHub's `h1[data-testid="header-title"]` on `/pulls`. Toggles between native GitHub list and Sieve Command Center. Survives React hydration. |
| **Maintainer Command Center on `/pulls`** | **Implemented and verified** | Injects header with repository branding, 4 metric cards, category filter tabs, search input, sort dropdown, and structured PR cards. Verified on live `github.com/ThatKJ/sieve-demo-target/pulls`. |
| **PR Detail Page Pill (`.sieve-pr-pill`)** | **Partially implemented (Fixed in Audit)** | Originally **broken** due to legacy 2022 GitHub selectors (`#partial-discussion-header`). Fixed during audit to target modern React PageHeader (`[class*="PageHeader-TitleArea"]`) with hydration retry. Now verified and functional. |
| **PR Intelligence Drawer (Topology & Findings)** | **Implemented and verified** | Opens sliding drawer from either Command Center or PR pill. Renders SVG DAG, confidence score badges, signal tags, and suggested response template. Verified via Playwright. |
| **Deterministic AST Graph Engine (`sieve/atlas.py`)** | **Partially implemented** | Deterministic Python AST parsing correctly extracts direct imports and test relationships for Python files. **Fails silently on polyglot code** (TypeScript, Go, Rust, YAML, Markdown). Non-Python files produce zero topology nodes. |
| **Historical Hotspot Radar (`sieve/core.py`)** | **Broken in production** | In theory, checks recent git commits via GitHub API. In practice, returns `hotspots: 0` because it makes up to 15 unauthenticated GitHub API calls per PR, instantly exhausting GitHub's 60 req/hr rate limit and swallowing the 403 error. |
| **Queue Categorization (`sieve/core.py`)** | **Partially implemented** | Divides PRs into 4 buckets (`ready_for_review`, `needs_attention`, `potentially_risky`, `drafts`). However, the categorization is based on naive heuristics (e.g. score < 70) rather than true maintainer state (CI status, review turn-taking, merge conflicts). |
| **Local Private Engine (`sieve/server.py`)** | **Broken Security (Fixed in Audit)** | Originally shipped with dangerous `Access-Control-Allow-Origin: *` wildcard CORS. Fixed during audit with strict origin verification (`chrome-extension://` and `127.0.0.1` only) and Host header validation. |
| **Turn-Taking Tracking ("Who has the ball?")** | **Not implemented** | Neither backend nor extension inspects GitHub review threads, requested changes, or contributor response timestamps. Cannot distinguish PRs waiting on maintainer from PRs waiting on contributor. |
| **Duplicate / Overlapping PR Detection** | **Not implemented** | PRs are analyzed in complete isolation. The engine cannot detect when multiple contributors submit competing PRs for the same issue or modify overlapping lines of code. |
| **GitHub Actions CI Status Integration** | **Not implemented** | Sieve does not inspect GitHub check runs, check suites, or commit statuses. A PR with failing unit tests or broken builds can still receive a high Sieve score if its diff structure looks clean. |
| **Interactive Action Execution (Merge/Close/Comment)** | **Not implemented** | Sieve is currently read-only. Suggested contributor responses can only be manually copied to the clipboard. There is no in-situ approval, label assignment, or review submission. |
| **Custom Collections Persistence** | **Partially implemented** | UI contains tabs for collections, and local storage read/write stubs exist, but there is no UX interface to create, rename, or assign PRs into custom collections. |

---

## 2. The Hard Question: Maintainer Workspace vs. Redesigned PR List

> **"Is this genuinely a maintainer workspace, or is it currently just a redesigned PR list with AI scores?"**

**Brutal Assessment:**  
In its current Milestone 1 form, **Sieve Workspace is predominantly a cosmetic redesign of GitHub's PR list with an embedded AST graph viewer and heuristic confidence scores.**

It fails to function as a true **daily maintainer workspace** because it answers questions a static code analyzer cares about, while failing to answer the operational questions a maintainer faces every single morning.

### Answering the 10 Critical Maintainer Questions

| # | Maintainer Question | Can Current Sieve Answer This? | Why or Why Not? |
| :--- | :--- | :--- | :--- |
| **1** | **What needs attention immediately?** | **No** | It categorizes PRs with scores < 70 into "Needs Attention", but cannot identify *why* (e.g., security vulnerability, merge conflict, broken CI, or contributor pinging the maintainer). |
| **2** | **Which PRs should I review next?** | **No** | Sorting is strictly by score descending or PR number. A trivial 2-line README fix gets score 100 and floats to the top, while a critical core patch with a missing test gets buried. |
| **3** | **Which PRs are blocked, and why?** | **No** | Sieve does not fetch GitHub CI check suites (`gh check runs`) or mergeable status (`mergeable: CONFLICTING`). Blocked PRs look identical to ready PRs. |
| **4** | **Which PRs are waiting on me?** | **No** | Zero turn-taking logic. Sieve does not know if a PR is brand new, if the maintainer was requested for review, or if the author just pushed new commits addressing feedback. |
| **5** | **Which PRs are waiting on contributors?** | **No** | Sieve cannot see if a maintainer already submitted "Changes Requested" and is waiting for the author to update code. |
| **6** | **Which contributions overlap?** | **No** | Every PR is evaluated in total isolation. If 3 contributors submit PRs modifying `auth.py` for Issue #42, Sieve evaluates all 3 independently without flagging the conflict. |
| **7** | **Which PRs relate to existing issues?** | **Weak / Partial** | Only parses simple regex `fixes #123` in the PR body. Does not check issue status, issue description alignment, or orphan PRs lacking linked issues. |
| **8** | **Which changes deserve deeper investigation?** | **Yes (Python only)** | The AST blast radius correctly flags when a change impacts dozens of downstream modules, but only if the repository is Python. |
| **9** | **What has been happening in this repository?** | **No** | No repository activity stream, no velocity tracking, no contributor churn metrics. |
| **10** | **What action would save me the most time?** | **No** | Sieve provides no high-leverage batch actions (e.g., "Batch close 10 bot PRs", "Batch merge 5 clean typo fixes", "Flag duplicate submissions"). |

---

## 3. Information Architecture Flaws in the Current Design

### Flaw 1: Superficial Score Hierarchy
The current design anchors heavily on a single 0–100 numerical score.
- **Problem:** Maintainers do not trust arbitrary numerical scores from AI or static linters. A score of "85" tells the maintainer nothing actionable. Does it mean 15% risk of regression? Does it mean documentation is missing?
- **Correction:** Replace arbitrary aggregate scores with **deterministic status gates**:
  - `Merge Ready` (CI green + clean diff + tests verified + no conflicts)
  - `Review Blocked` (Merge conflict OR failing CI OR duplicate PR detected)
  - `Action Required: Author` (Unresolved maintainer feedback)
  - `Action Required: Maintainer` (New commits waiting on review)
  - `Triage: Low Effort / Suspicious` (Unlinked issue + generic commit + claimed tests missing)

### Flaw 2: Information Partitioning (List vs. Drawer)
- **Problem:** Currently, the maintainer must click "Inspect Topology" on every card to see whether the PR has tests or affected dependents. This induces click fatigue across 50 pull requests.
- **Correction:** Surface high-signal badges directly on the card:
  - Exact blast radius count (`+3 downstream modules affected`)
  - CI status badge (`CI Passing`, `CI Failing: test_auth`)
  - Contributor provenance (`First-time contributor`, `Repeat contributor (14 PRs merged)`)
  - Turn indicator (`Waiting on Author (4 days)`)

### Flaw 3: Mutually Exclusive vs. Orthogonal Categories
Currently, the categories are: `All`, `Ready for Review`, `Needs Attention`, `High Blast Radius`, `Drafts`, `Collections`.
- **Problem:** These categories are not orthogonal. A PR can be a "Draft", have "High Blast Radius", and "Need Attention" simultaneously. Forcing them into separate tabs hides critical work.
- **Correction:** Transition to a **two-dimensional triage grid**:
  - **Primary Status Views:** `Action Needed: You`, `Waiting on Contributor`, `Blocked`, `Merge Candidates`.
  - **Facet Filters:** `High Blast Radius`, `First-Time Contributor`, `Overlapping / Duplicate`, `Bot PRs`.

---

## 4. Key Takeaways for V2
1. Sieve must evolve from a **code analysis viewer** into an **inbox triage operating system**.
2. GitHub API rate limits make client-side per-file commit scraping unusable without a structured local SQLite cache and GitHub token authorization.
3. Multi-PR awareness (detecting duplicates and collisions) is Sieve's single strongest potential moat against single-PR bots like CodeRabbit and Copilot.

