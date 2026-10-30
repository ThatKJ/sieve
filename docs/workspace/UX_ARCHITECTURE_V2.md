# Sieve Workspace V2 — User Experience & Information Architecture

**Date:** October 31, 2026  
**Auditor:** Principal Product Designer & Senior Frontend Engineer  
**Design Standard:** Apple Human Interface Guidelines + GitHub Native Primer Harmony + Liquid Glass Tokens

---

## 1. Information Architecture & Hierarchy

The core user experience is structured around a single golden rule:  
**"Do not make the maintainer leave GitHub, and do not make the maintainer click through 50 PR tabs to make triage decisions."**

```
github.com/:owner/:repo/pulls
├── GitHub Global Navigation (Preserved)
├── Repository Header & Tab Navigation (Code, Issues, Pull requests, Actions...)
├── Subnavigation Toolbar
│   ├── Native GitHub Filter & Search (Preserved)
│   └── [.sieve-native-switcher] (Native GitHub | Sieve Workspace)
└── [#sieve-workspace-host] (Shadow DOM Isolation)
    ├── Repository Cockpit Header
    │   ├── Repository Brand & Sync Indicator
    │   └── Maintainer Triage KPI Strip (4 Live Gauges)
    ├── Triage Filter & Turn-Taking Tabs
    │   ├── 📥 Action Needed: You (count)
    │   ├── ⏳ Waiting on Contributor (count)
    │   ├── ⚠️ Blocked / Conflicting (count)
    │   ├── 🔀 Overlapping & Duplicates (count)
    │   ├── 🤖 Bot Stream (count)
    │   └── ✅ Merge Candidates (count)
    ├── Search, Facet & Multi-Criteria Sort Bar
    ├── Structured PR Cards Stream
    │   ├── PR Status Gate & Turn-Taking Indicator
    │   ├── PR Title, Number, Author Provenance
    │   ├── Signal Chips (Blast Radius, CI Status, Test Presence)
    │   └── Fast Triage Action Buttons
    └── Slide-Over Intelligence Drawer (ESC to close)
        ├── PR Header & Confidence Score Breakdown
        ├── Interactive SVG Blast Radius Topology DAG
        ├── Claim vs. Reality Evidence Ledger
        └── Suggested Contributor Response Composer
```

---

## 2. Screen Layout & Wireframes

### Screen 1: The Maintainer Command Center (`/pulls`)

```text
+----------------------------------------------------------------------------------------------------+
|  GitHub Header (Native)                                                     [ Search ] [ Profile ] |
+----------------------------------------------------------------------------------------------------+
|  ThatKJ / sieve-demo-target              [★ Star 142]  [Fork 28]                                   |
|  [Code]  [Pull requests (8)]  [Issues (12)]  [Actions]  [Security]                                 |
+----------------------------------------------------------------------------------------------------+
|  All pull requests                      [ Sieve Workspace | Native GitHub ]  [ New Pull Request ]  |
+----------------------------------------------------------------------------------------------------+
|  #sieve-workspace-host (Shadow DOM)                                                                |
|  +----------------------------------------------------------------------------------------------+  |
|  |  SIEVE COMMAND CENTER · ThatKJ/sieve-demo-target        ● Engine Connected (qwen3.5:9b)      |  |
|  |                                                                                              |  |
|  |  +-------------------+  +-------------------+  +-------------------+  +-------------------+  |  |
|  |  | ACTION NEEDED: YOU|  | WAITING ON AUTHOR |  | OVERLAPPING / DUP |  | BOT STREAM        |  |  |
|  |  |        3          |  |        2          |  |        2          |  |        1          |  |  |
|  |  | Needs initial rev |  | Feedback pending  |  | File collisions   |  | Dependabot/Renovat|  |  |
|  |  +-------------------+  +-------------------+  +-------------------+  +-------------------+  |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                                                                                    |
|  [ 📥 Action Needed: You (3) ] [ ⏳ Waiting on Author (2) ] [ 🔀 Overlapping (2) ] [ 🤖 Bots (1) ]  |
|  [ Filter by author, issue, or symbol...               ]  [ Sort: Urgency / Blast Radius ▼ ]      |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | [!] ACTION NEEDED: YOU                                                 Waiting 2 days · +24/-8|  |
|  |                                                                                              |  |
|  | #3 Show negative amounts as -$5.00 instead of $-5.00                                         |  |
|  | Opened by @contributor-1 (First-time contributor) · Claims fixes #2                          |  |
|  |                                                                                              |  |
|  | [ CI Passing ✓ ]  [ +3 Dependents Affected ]  [ Tests Added (2 assertions) ]  [ Clean Diff ] |  |
|  |                                                                                              |  |
|  | [⚡ Inspect Topology]   [📋 Copy Response]   [✓ Approve & Merge]   [✕ Request Changes]        |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | [!] OVERLAPPING INTENT WARNING                                         Waiting 4 hrs · +110/-12| |
|  |                                                                                              |  |
|  | #5 Refactor currency formatting into shared module                                            |  |
|  | Opened by @contributor-2 · Collides with PR #3 on sieve/calc.py                              |  |
|  |                                                                                              |  |
|  | [ ⚠️ File Collision: PR #3 ]  [ CI Failing ✗ ]  [ No Tests Added ]  [ High Churn Hotspot ]   |  |
|  |                                                                                              |  |
|  | [⚡ Inspect Topology]   [Compare with PR #3]   [📋 Suggest Coordination]   [✕ Close Duplicate]|  |
|  +----------------------------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
```

---

### Screen 2: Slide-Over PR Intelligence Drawer

Triggered by clicking **"⚡ Inspect Topology"** on a card or **"⚡ Sieve Intelligence"** on `/pull/:id`.

```text
+--------------------------------------------------------------------+
|  PR INTELLIGENCE DRAWER                                      [ × ] |
|  #3 Show negative amounts as -$5.00 instead of $-5.00              |
|  By @contributor-1 · Branch: fix-neg-currency -> main              |
+--------------------------------------------------------------------+
|  TRIAGE GATE STATUS: MERGE CANDIDATE                               |
|  CI: Passing (2/2 suites) · Mergeable: Clean (No conflicts)        |
+--------------------------------------------------------------------+
|  1. DETERMINISTIC BLAST RADIUS (Import DAG)                        |
|                                                                    |
|     [ sieve/calc.py ] (MODIFIED: +24 / -8)                         |
|           │                                                        |
|           ├──► [ sieve/service.py ] (Direct Dependent)             |
|           ├──► [ sieve/cli.py ]     (Direct Dependent)             |
|           └──► [ tests/test_calc.py](Verified Unit Test)           |
|                                                                    |
|     Summary: 1 modified file · 2 downstream dependents · 1 test    |
+--------------------------------------------------------------------+
|  2. CLAIM VS. REALITY EVIDENCE LEDGER                              |
|                                                                    |
|  [✓] Linked Issue Grounding: Fixes #2 (Issue is open & relevant)   |
|  [✓] Test Claim Verification: Claimed tests exist and assert values|
|  [✓] Convention Adherence: Follows PR template & semantic commits  |
|  [✓] Architectural Safety: Zero cyclic imports, clean scope        |
+--------------------------------------------------------------------+
|  3. SUGGESTED MAINTAINER RESPONSE COMPOSER                         |
|                                                                    |
|  +--------------------------------------------------------------+  |
|  | Thanks @contributor-1! This looks clean, addresses #2, and   |  |
|  | all downstream dependents in sieve/service.py pass tests.    |  |
|  | Merging now.                                                 |  |
|  +--------------------------------------------------------------+  |
|                                                                    |
|  [📋 Copy to Clipboard]     [💬 Post directly as Review]            |
+--------------------------------------------------------------------+
```

---

## 3. Interaction Design & Keyboard Shortcuts

Maintainers triage high volumes of code using keyboard shortcuts. Sieve implements a standard Gmail/Linear-style command set:

| Key Binding | Scope | Action |
| :--- | :--- | :--- |
| `j` / `Down` | Command Center | Move focus to the next PR card |
| `k` / `Up` | Command Center | Move focus to the previous PR card |
| `x` | Command Center | Toggle selection of the currently focused PR card |
| `r` | Command Center | Open the Slide-Over Intelligence Drawer for the focused PR |
| `Enter` | Command Center | Navigate directly to the GitHub PR URL |
| `Esc` | Intelligence Drawer | Close drawer and restore focus to Command Center |
| `1` – `5` | Command Center | Switch active inbox tabs (`Action Needed: You`, `Waiting`, etc.) |
| `/` | Command Center | Focus the search & filter input bar |

---

## 4. Accessibility & Visual Design System (Apple HIG + Liquid Glass)

- **Color Contrast:** All text tokens meet WCAG 2.1 AA requirements (minimum 4.5:1 contrast against backdrops).
- **Reduced Motion:** Respects `prefers-reduced-motion: reduce` by disabling drawer sliding animations and SVG zoom transitions.
- **Screen Reader Semantics:**
  - The switcher uses `role="tablist"` with `role="tab"` and `aria-selected="true|false"`.
  - The PR cards use semantic `<article>` tags with `aria-labelledby` referencing the PR title.
  - The drawer is an `<aside>` element with `aria-modal="true"`.
- **Focus Management:** When the drawer opens, focus is trapped inside the drawer. When closed via `Esc`, focus returns to the triggering card button.

