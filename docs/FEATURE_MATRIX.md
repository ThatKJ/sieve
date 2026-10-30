# Sieve Workspace — Complete Feature & Capability Matrix

**Product:** Sieve Workspace V2  
**Status:** Canonical Implementation Scope

---

## Complete Feature Matrix

| Feature Domain | Capability | Description | Data Source | Implementation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Command Center** | **Frosted Sidebar Navigation** | Multi-view navigation (Overview, Queue, Attention, Waiting, Blocked, Bots, Collections) with active black pill indicator | Extension UI | **Core (Implemented)** |
| **Command Center** | **Maintainer Triage KPI Strip** | 4 live metric gauges (`Needs Attention`, `Waiting on Author`, `Overlapping`, `Merge Ready`) | `core.queue()` | **Core (Implemented)** |
| **Command Center** | **High-Contrast PR Spotlight Card** | Pitch black showcase card highlighting selected PR blast radius, impact score, and author | `core.analyze()` | **Core (Implemented)** |
| **Command Center** | **Custom Collections Management** | Create, view, and delete custom PR collections | `chrome.storage.local` | **Core (Implemented)** |
| **Command Center** | **Live Search & Fast Sort** | Real-time client-side search by title/author and sort by blast radius, score, and PR number | Client Memory | **Core (Implemented)** |
| **Command Center** | **Floating Action Pill Bar** | Floating action bar at bottom of workspace for batch actions and engine status | Extension UI | **Core (Implemented)** |
| **Command Center** | **Non-Destructive View Switcher** | Injected tablist in GitHub subnav allowing instant toggle between Native GitHub and Sieve | Content Script | **Core (Implemented)** |
| **Contribution Intelligence** | **Turn-Taking State Classification** | Categorizes PRs into `Action Needed: You`, `Waiting on Author`, `Blocked`, and `Merge Candidate` | Reviews & Commits | **Core (Implemented)** |
| **Contribution Intelligence** | **Cross-PR Collision Detector** | Flags when multiple open PRs modify the same files in the repository | File Diffs Index | **Core (Implemented)** |
| **Contribution Intelligence** | **Duplicate Fix Identifier** | Detects when 2+ PRs reference the same issue number | Issue Links Index | **Core (Implemented)** |
| **Contribution Intelligence** | **Bot PR Stream Isolation** | Isolates Renovate, Dependabot, and automated bot bumps from human queues | Author Metadata | **Core (Implemented)** |
| **Repository Intelligence** | **Blast Radius Topology DAG** | Interactive pure SVG directed acyclic graph showing modified files, dependents, and tests | `atlas.py` | **Core (Implemented)** |
| **Repository Intelligence** | **Internal Import Resolver** | Static AST parser mapping Python imports across the repo directory tree | Python `ast` | **Core (Implemented)** |
| **Repository Intelligence** | **Test File Relationship Mapper** | Confirms whether modified modules have matching test files in the patch | `atlas.py` | **Core (Implemented)** |
| **PR Intelligence** | **Slide-Over Inspection Drawer** | Full-height glass drawer opening on "Inspect Topology" or PR detail page | Shadow DOM | **Core (Implemented)** |
| **PR Intelligence** | **Claim vs. Reality Evidence Ledger** | Line-item verification of claimed tests, issue grounding, and convention safety | `core.py` | **Core (Implemented)** |
| **Resolution Workspace** | **1-Click Contextual Response Composer** | Pre-fills friendly, professional maintainer feedback based on verified findings | Client Templates | **Core (Implemented)** |
| **Resolution Workspace** | **Copy to Clipboard & Markdown Format** | One-click copy formatted for GitHub review comments | Client Clipboard | **Core (Implemented)** |
| **Security & Architecture** | **Origin-Restricted Local Daemon** | Only authorized extension IDs and localhost can access `http://127.0.0.1:8787` | `server.py` | **Core (Implemented)** |
| **Security & Architecture** | **DNS Rebinding Host Validation** | Drops requests whose HTTP Host header does not match localhost / 127.0.0.1 | `server.py` | **Core (Implemented)** |
| **Security & Architecture** | **Hydration-Resilient Observer** | Polling loop guaranteeing persistent attachment across GitHub React SPA hydration | Content Script | **Core (Implemented)** |
