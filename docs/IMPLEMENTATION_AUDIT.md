# Sieve Workspace — Implementation & Technical Debt Audit

**Date:** October 31, 2026  
**Auditor:** Principal Software Architect, Senior Extension Engineer & QA Lead  
**Branch:** `workspace-monochrome-v2`

---

## 1. Executive Summary

This audit assesses the state of the Sieve codebase prior to the visual and functional transformation into the **Monochromatic Sieve Workspace**.

The project currently consists of:
1. **The Python Engine (`sieve/`):** Pure standard-library Python backend providing REST endpoints, AST parsing, GitHub API querying, and local Ollama model integration.
2. **The Chrome Manifest V3 Extension (`extension/`):** Background service worker, content scripts, and Shadow DOM components injected into `github.com`.
3. **The Standalone Web Interface (`web/`):** Static web dashboard originally used for testing and workbench demonstration.
4. **Automated Test Suites (`tests/` and `scratch/`):** 46 unit tests in pytest and Playwright automated browser tests.

---

## 2. Component-by-Component Implementation Audit

| Component | Files | Current Status | Findings & Technical Debt |
| :--- | :--- | :--- | :--- |
| **Manifest V3 Extension** | `extension/manifest.json`<br/>`extension/background.js` | **Functional & Verified** | Centralizes API requests in background worker with 60s TTL cache. Properly declares host permissions. |
| **GitHub SPA Adapter** | `extension/github-adapter.js` | **Functional** | Hooks `turbo:load`, `turbo:render`, `pjax:end`, and `pushState`. Modern React PageHeader selectors added in previous audit. |
| **Shadow DOM Mounting** | `extension/content.js` | **Functional** | Attaches open Shadow Root to avoid CSS collision with GitHub Primer. Implements hydration observation loop. |
| **Maintainer Command Center** | `extension/ui/command-center.js` | **Functional (Needs V2 Redesign)** | Renders PR cards, category tabs, and search. Currently uses generic styling rather than the target monochrome luxury aesthetic. |
| **PR Intelligence Drawer** | `extension/ui/pr-intelligence.js` | **Functional** | Slide-over drawer with SVG DAG and evidence ledger. Functional, but needs typography and surface treatment matching the reference. |
| **SVG Blast Radius Topology** | `extension/ui/topology-svg.js` | **Functional** | Pure SVG DAG rendering nodes and directed edges for modified files, direct dependents, and tests. |
| **Extension Popup** | `extension/popup/*` | **Functional** | Displays engine health and view preference toggles. Needs visual unification with the main workspace design system. |
| **Local Daemon Server** | `sieve/server.py` | **Hardened (Secure)** | Origin validation rejecting unauthorized origins (`403 Forbidden`) and echoing extension origin. Wildcard CORS removed. |
| **Core Triage & Analysis** | `sieve/core.py` | **Functional (Heuristic)** | Computes Sieve score (0-100), template matching, and categorized queue. Needs cross-PR duplicate detection and CI status integration. |
| **AST Topology Engine** | `sieve/atlas.py` | **Functional (Python Only)** | Deterministic AST import extraction for Python. Polyglot fallback needed for TypeScript/JavaScript. |
| **GitHub API Client** | `sieve/github.py` | **Functional (Cached)** | Standard library client with file-based caching. Requires token configuration to prevent unauthenticated 60 req/hr rate limits. |

---

## 3. Existing Technical Debt & Architectural Limitations

1. **Visual Language Gap:** The existing UI used generic blues (`#2f5bea`) and basic borders, completely missing the sophisticated monochromatic, glass-layered, sculptural aesthetic of the design reference.
2. **Collections Stubs:** Custom collections were partially stubbed in storage, but lacked a complete CRUD user interface (create, rename, delete, add PRs to collection).
3. **Cross-PR Blindness:** PRs are analyzed individually. Sieve did not cross-index open PRs to surface duplicate fixes or file collisions.
4. **Turn-Taking Representation:** Categories relied on static score thresholds rather than operational maintainer turn-taking (`Action Needed: You`, `Waiting on Contributor`, `Blocked`, `Merge Candidates`, `Bot Stream`).
5. **Rate-Limit Vulnerability:** Running historical commit scrapes across multiple PRs without an authenticated GitHub token can burn API quota.

---

## 4. Preservation Strategy

We will **preserve**:
- The pure Python standard library zero-pip backend architecture (`sieve/atlas.py`, `sieve/core.py`, `sieve/server.py`).
- The secure origin validation and Host header checks in `sieve/server.py`.
- The pure SVG DAG layout engine in `extension/ui/topology-svg.js`.
- The Manifest V3 background service worker proxy model in `extension/background.js`.
- The resilient hydration observer loop in `extension/content.js`.

We will **transform**:
- `extension/ui/workspace.css`: Complete implementation of the reference design system (monochromatic palette, frosted glass, diffuse shadows, deep black contrast surfaces, pill badges).
- `extension/ui/command-center.js`: Full redesign into the multi-pane maintainer workspace (Sidebar, Attention Strip, High-Contrast Selected PR Spotlight Card, Queue Cards, Floating Action Bar).
- `extension/ui/pr-intelligence.js`: Deep inspection drawer with monochromatic tokens and 1-click review action templates.
- `extension/popup/*`: Complete visual synchronization with the workspace design system.

