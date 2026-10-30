# Sieve Workspace — UX & Design Specification

## 1. Design System & Aesthetics

Sieve Workspace adheres to Apple Design Human Interface Guidelines (HIG) combined with refined Liquid Glass aesthetics:
- **Base Canvas:** Warm tactile gray (`#f2f1ed`), avoiding harsh stark white or dark blue tints.
- **Content Cards:** Solid crisp white (`#ffffff`) with subtle `0.5px` border hairlines (`rgba(29, 29, 31, 0.1)`) and soft ambient shadows.
- **Liquid Glass Layer:** Restricted strictly to floating functional layers (sticky toolbars, inspector drawers, segmented view switchers) using `-webkit-backdrop-filter: blur(24px) saturate(1.4)`. Content is never placed over blurry glass.
- **Typography:** System fonts (`-apple-system`, `SF Pro Text`, `Segoe UI`, `monospace`), with high contrast (`15.4:1` contrast ratio on canvas for primary text).
- **Semantic Colors:**
  - **Cobalt (`#2f5bea`):** Connected architecture and topological impact.
  - **Emerald (`#1e7a4c`):** Verified claims, ready PRs, passing checks.
  - **Amber (`#8a5300`):** Needs attention, direct dependents, warnings.
  - **Crimson (`#b42318`):** Failed checks, deleted symbols, high risk.

---

## 2. Experience A: Maintainer Command Center (`/pulls`)

```
+----------------------------------------------------------------------------------------------------+
|  GitHub Header: ThatKJ / sieve-demo-target                                                        |
+----------------------------------------------------------------------------------------------------+
|  [ Code ]  [ Pull Requests (3) ]  [ Issues ]  [ Actions ]                                          |
+----------------------------------------------------------------------------------------------------+
|  View: ( ) Native GitHub     (*) Sieve Workspace                                                   |
+----------------------------------------------------------------------------------------------------+
|  REPOSITORY HEADER                                                                                 |
|  ThatKJ / sieve-demo-target  ·  default: main  ·  3 open PRs  ·  Intelligence Engine: Connected    |
+----------------------------------------------------------------------------------------------------+
|  OVERVIEW METRICS                                                                                  |
|  [ 3 Open PRs ]  [ 1 Needs Attention ]  [ 1 Ready for Review ]  [ 1 Risky ]  [ 0 Stale ]          |
+----------------------------------------------------------------------------------------------------+
|  INTELLIGENT PR INBOX                                                                              |
|  Tabs: [ All (3) ] [ Needs Attention (1) ] [ Ready (1) ] [ Risky (1) ] [ My Collections (0) ]      |
|  Filter: [ Search PRs, authors, files...           ]  Sort: [ Sieve Score v ]                     |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  |  95/100  READY FOR REVIEW                                                      #3 · ThatKJ   |  |
|  |  Show negative amounts as -$5.00 instead of $-5.00                             updated 2h ago|  |
|  |  +7 -1 · 2 files · Linked: Issue #1 · Blast Radius: 2 dependents, 1 test                     |  |
|  |  [ Inspect Topology ]  [ Open on GitHub ↗ ]                                                  |  |
|  +----------------------------------------------------------------------------------------------+  |
|  |  40/100  POTENTIALLY RISKY                                                     #4 · ThatKJ   |  |
|  |  Polished description, doesn't check out                                       updated 1d ago|  |
|  |  +14 -8 · 2 files · Claims tests but none added · Renames function still in use (:3)         |  |
|  |  [ Inspect Topology ]  [ Open on GitHub ↗ ]                                                  |  |
|  +----------------------------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
```

### Components:
1. **View Switcher:** Injected directly into GitHub's subnav tabs. Clicking "Native GitHub" instantly reveals GitHub's standard table; clicking "Sieve Workspace" displays the Command Center.
2. **Metrics Ribbon:** 5 actionable stat chips calculating real repository health.
3. **Category Tabs:**
   - **All PRs:** Complete list sorted by triage priority.
   - **Needs Attention:** PRs with unverified claims, template omissions, or competing issue claims.
   - **Ready for Review:** PRs that pass all deterministic checks with verified tests and clean blast radius.
   - **Potentially Risky:** PRs deleting imported symbols, modifying high-fan-in modules, or showing high commit churn.
   - **My Collections:** Custom user-defined folders (e.g. "Release 2.0", "Security").
4. **Structured PR Row:**
   - Score badge with verdict color.
   - Clear headline, author with avatar, age.
   - Blast radius summary badge (number of dependent modules affected).
   - Quick action to open embedded inspection or jump to native GitHub PR.

---

## 3. Experience B: Individual PR Intelligence (`/pull/:id`)

When viewing a single PR:
1. **Header Badge:** A verdict pill inserted next to GitHub's PR state badge (e.g. `[Open] [Sieve: 100/100 Ready]`).
2. **Intelligence Button & Drawer:** An expandable button in GitHub's action bar: `[ Sieve Intelligence ]`.
3. **Drawer Sections:**
   - **Claim Verification:** Exact audit of linked issue, test additions, and import resolutions.
   - **PR Blast Radius Topology:** Interactive SVG visualizer showing modified modules, internal dependents, and tests.
   - **Historical Hotspot Radar:** Commit churn over 90 days and candidate revert detection.
   - **Confidence Ledger:** Proof trail of deterministic AST vs Git tree vs local LLM.
   - **Contributor Reply Assistant:** Formatted, polite maintainer copy-paste response.

---

## 4. State Management & Accessibility

- **Loading States:** Subtle shimmering skeleton loaders mimicking content structure; never blocking the main thread.
- **Empty States:** Clear illustrations and messages (e.g. *"No open pull requests need attention right now."*).
- **Error States:** Informative banners with retry buttons; server connection issues prompt starting `python3 -m sieve --serve`.
- **Keyboard Navigation:** Full `Tab` order with `Enter`/`Space` activation and `Escape` drawer dismissal.

