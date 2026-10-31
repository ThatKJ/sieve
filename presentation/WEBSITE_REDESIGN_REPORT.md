# SIEVE — PUBLIC WEBSITE REDESIGN REPORT
## Pinterest Reference → Premium Sieve Website

**Date:** October 31, 2026  
**Repository:** `ThatKJ/sieve`  
**Target Directory:** `web/`  
**Scope:** Exclusively public-facing website redesign (`web/index.html`, `web/style.css`, and website-specific assets)

---

## 1. Pinterest Reference Analysis

The provided reference image showcased the modern developer tool website **Woblo** (a Chrome extension utility). A rigorous design decomposition revealed several foundational visual principles:

| Element | Reference Character (Woblo) | Sieve Implementation |
| :--- | :--- | :--- |
| **Canvas & Surfaces** | Pure luminous white (`#FFFFFF`) with subtle off-white recessed surfaces (`#F8FAFC`). | Replaced editorial warm-beige paper with pristine `#FFFFFF` canvas, cool slate neutral cards (`#FAFAFC`), and subtle `#E2E8F0` hairline borders. |
| **Typography** | Geometric modern sans-serif, tight tracking (`-0.035em`), bold headline hierarchy, relaxed subheaders. | Google Font `Inter` paired with `JetBrains Mono` for code tokens and AST symbols. |
| **Hero Highlight** | Custom organic capsule pill around key noun ("*design.*") with soft blue tint and slight rotation. | Custom pill badge `.hero-highlight` around key phrase ("*could affect.*") in royal sky blue (`#DBEAFE`), rotated `-1.5deg` with soft shadow. |
| **Hero Action Group** | Centered pill button cluster: primary gradient button + white frosted secondary button. | Dual pill CTAs (`Explore Live Demo PRs` in royal blue gradient + `Inspect Breaking PR #4` white frosted pill). |
| **Product Showcase Frame** | Floating rounded browser viewport (`border-radius: 20px`) with window dots, URL pill, and floating play badge. | Custom browser frame with macOS traffic light controls, live GitHub URL address pill, live in-situ indicator, and floating interactive AST badge. |
| **Feature Grid** | 3×2 card grid with miniature interactive-looking preview mockups on top of each card. | 6-card grid with custom micro-widgets (In-situ drawer toggle with cursor, AST ripple chips, breaking change alert, pytest coverage matrix, static `ast.parse` code window, and Gemma multimodal chip). |
| **Dual Split Cards** | Two wide horizontal cards with fan-out pill strips on top and soft blue containers below. | Exact replication: "Everything Sieve reads" and "Everywhere Sieve acts" with fan-out badge strips and rounded soft-blue info boxes. |
| **Enterprise Security** | Clean 4-column guarantee cards with minimalist iconography and high readability. | 4 clean cards detailing Local-first processing, Zero untrusted code execution, Read-only tokens, and Opt-in AI reasoning. |

---

## 2. Design Decisions & System Architecture

1. **Light-Mode Polish for Developer Tool Credibility:**
   - Instead of generic dark-mode AI gradients or floating purple nebulas, the site adopts a clean, high-clarity light canvas that emphasizes deterministic facts and verifiable engineering precision.
2. **Deterministic Evidence Front and Center:**
   - Maintainers are skeptical of unsupported claims. Every feature card and demo card provides concrete, verifiable evidence: line counts, AST blast radius numbers, and exact import paths (`ledgerly/reporting.py`).
3. **Preserving Full Interactive Functionality:**
   - Maintained complete compatibility with `web/app.js` and `web/atlas.js`.
   - The interactive 3D/2D HTML5 Canvas Repository Atlas is seamlessly mounted inside a modern Apple-style container with zoom, orbit, filter, mode switching, and full-screen controls.
   - Demo PR cards for PR #3 (Verified Pass), PR #4 (Needs Work), and PR #5 (Low-Effort Docs) allow single-click inspection into the full PR Review view.
4. **Zero Server Dependency for Static Public Demonstration:**
   - The website functions completely standalone on Vercel without requiring the local macOS Python daemon or Chrome extension to be active.

---

## 3. Website Sections Implemented

1. **Floating Minimalist Navbar (`.toolbar.glass`):**
   - Sieve mesh brand icon & wordmark.
   - Main navigation anchors (`Overview`, `Features`, `Demo PRs`, `Showcase`, `Architecture`, `Security`).
   - Integrated quick search input for `owner/repo#123` with inspect trigger.
   - Live daemon/demo mode health badge.
   - Verified GitHub repository pill link.
2. **Hero Section (`#overview`):**
   - Centered hackathon release pill badge with amber star.
   - Display headline: *"GitHub tells you what changed. Sieve reveals what it could affect."* with iconic styled highlight pill.
   - Subtitle explaining the maintainer value proposition with zero fluff.
   - Pill CTA button cluster: `Explore Live Demo PRs`, `Inspect Breaking PR #4`, and `Demo Target Repo`.
   - High-resolution browser window mockup with live GitHub URL pill, in-situ mode pulse dot, and interactive AST inspection overlay pill.
   - Judge experience disclaimer note explaining static Vercel demonstration vs in-situ macOS daemon.
3. **6-Card Feature Matrix ("Everything a change could affect"):**
   - **In-Situ GitHub Injection:** Shows simulated PR tab with interactive cursor clicking Sieve review toggle.
   - **Deterministic Blast Radius:** Visual ripple chain connecting modified modules, downstream dependents, and test files.
   - **Breaking Change Radar:** Risk summary chip flagging renamed functions still imported downstream.
   - **Verified Test Consumers:** Dual test assertions distinguishing tested paths from untested branches.
   - **Zero Untrusted Execution:** Clean code snippet showcasing static `ast.parse` and zero evaluation guarantees.
   - **Gemma 4 Visual Reasoning:** Multimodal prompt pill illustrating architecture diagram PNG + AST payload ingestion.
4. **Dual Horizontal Split Cards:**
   - **Everything Sieve reads:** Fan-out pill strip (Python AST, Symbol Exports, Import Graph, Pytest Assertions, Git Diffs) + soft-blue info container.
   - **Everywhere Sieve acts:** Fan-out pill strip (`github.com/pulls`, In-Situ Drawer, Topology Canvas, Blast Badges, Risk Reports) + soft-blue info container.
5. **Interactive Demo PRs & Repository Atlas (`#demo`):**
   - 3 live demonstration cards: PR #3 (Verified Pass), PR #4 (Needs Work), PR #5 (Low-Effort Docs).
   - Embedded HTML5 Canvas Repository Atlas with full orbit, pan, zoom, search, isolate, and mode switching.
6. **Real In-Situ Screenshots Showcase (`#screenshots`):**
   - 4 unedited captures in refined macOS window containers:
     - Maintainer Command Center (`assets/command-center.png`)
     - In-Situ PR Intelligence Drawer (`assets/pr-intelligence-drawer.png`)
     - Gemma 4 Visual Intelligence (`assets/gemma-visual-intelligence.png`)
     - Chrome Extension Daemon Connection (`assets/extension-popup.png`)
7. **Deterministic Architecture Flow (`#architecture`):**
   - 3-step setup guide: Local Python daemon startup, Chrome unpacked extension loading, and in-situ PR review.
8. **Enterprise Security & Privacy (`#security`):**
   - 4 guarantee cards: Local-first processing, zero untrusted execution, read-only GitHub permissions, and opt-in AI reasoning.
9. **Final Call to Action Banner & Modern Multi-Column Footer:**
   - Clean high-impact closing card with primary actions.
   - 4-column footer with brand, navigation, technical specs, and repository links.

---

## 4. Files Modified

| File | Changes Made |
| :--- | :--- |
| `web/index.html` | Complete restructuring matching the Pinterest Woblo visual language: modern navbar, badge, headline with styled highlight pill, browser mockup frame, 6-card feature matrix with preview micro-widgets, dual horizontal split cards, demo PR cards, interactive atlas mount, screenshot showcase, architecture steps, security cards, final CTA, and multi-column footer. |
| `web/style.css` | Complete CSS redesign: modern light-first color tokens (`--surface: #ffffff`, `--ink: #0f172a`, `--signal: #2563eb`), geometric Inter/JetBrains Mono typography, pill geometry, soft-blue containers, browser mockup styling, micro-widget components, and responsive breakpoints. |
| `web/assets/hero-showcase.png` | Created high-resolution retina 2x capture of GitHub with the Sieve PR Intelligence Drawer inspecting PR #4 for the hero browser frame. |
| `presentation/WEBSITE_REDESIGN_REPORT.md` | Comprehensive redesign report documenting reference analysis, architectural decisions, test results, and verified screenshots. |

*Note: No Chrome extension, Python engine, or application interface files were touched.*

---

## 5. Assets Reused and Created

- `web/assets/hero-showcase.png` — Reused and copied retina 2x capture from `presentation/assets/real_pr4_drawer_open_2x.png`.
- `web/assets/command-center.png` — Unedited real screenshot of Maintainer Command Center.
- `web/assets/pr-intelligence-drawer.png` — Unedited real screenshot of PR Intelligence Drawer.
- `web/assets/gemma-visual-intelligence.png` — Real multimodal reasoning screenshot with Google Gemma.
- `web/assets/extension-popup.png` — Real screenshot of Chrome Extension popup and daemon connection.
- `presentation/assets/redesign_desktop_hero_1440.png` — Verification screenshot of hero section.
- `presentation/assets/redesign_desktop_1440.png` — Verification screenshot of full desktop landing page.
- `presentation/assets/redesign_laptop_1280.png` — Verification screenshot at laptop resolution.
- `presentation/assets/redesign_mobile_390.png` — Verification screenshot at mobile resolution.
- `presentation/assets/review_pr4_interaction_1440.png` — Verification screenshot of PR review interaction.

---

## 6. Interactions Verified

All interactive capabilities were verified using headless automated browser tests:

1. **Hero Direct Action (`Inspect Breaking PR #4`):**
   - Clicking immediately routes to PR #4 review view.
   - Full AST blast radius (2 modified, 5 dependents, 2 tests, 2 risks) and 25/100 verdict render properly.
2. **Demo PR Card Buttons (`Inspect Interactive Topology`):**
   - Tested PR #3, PR #4, and PR #5 single-click inspection.
   - Verified verdict computation, breakdown chips, and evidence lists.
3. **Navigation & Breadcrumbs:**
   - Clicking `← Back to Overview` cleanly restores the landing page without full page reload.
4. **Search / Inspect Input Form:**
   - Submitting `ThatKJ/sieve-demo-target#3` in `#target` immediately triggers inspection and renders verified findings.
5. **Interactive Repository Atlas (HTML5 Canvas):**
   - Successfully verified mouse drag/orbit, zoom, and node selection within the Atlas stage.
6. **Console Health & Network:**
   - Verified zero JavaScript console errors and zero broken asset links.

---

## 7. Responsive Verification Results

| Viewport | Dimensions | Verification Status | Notes |
| :--- | :--- | :--- | :--- |
| **Desktop** | 1440 × 900 | ✅ Passed | 3-column feature grid, dual horizontal cards, centered hero with browser window mockup, full navigation. |
| **Laptop** | 1280 × 800 | ✅ Passed | Seamless layout scaling, proper padding, crisp canvas atlas rendering. |
| **Mobile** | 390 × 844 | ✅ Passed | Single-column responsive card flow, stacked header with search bar, full-width touch buttons, optimized typography. |

---

## 8. Remaining Issues & Non-Goals

- **None.** All functional hooks, demo data fallbacks, static Vercel compatibility, and responsive views are 100% operational.
