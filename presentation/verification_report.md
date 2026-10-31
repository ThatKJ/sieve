# Sieve Hackathon Presentation — Verification & Evidence Report
**Date:** October 31, 2026 (09:40 IST)  
**Hackathon:** DevF8rge Finals Orientation · Halloween Hack BLR (Hacktoberfest 2026)  
**Repository:** ThatKJ/sieve  
**Demo Target:** ThatKJ/sieve-demo-target  

---

## 1. Existing Presentation Search Audit
As mandated by Step 1 of the master brief, a thorough search of the workspace, parent directories, and common system folders was executed:
- **Search Command:** Searched for `.pptx`, `.ppt`, `.pdf`, `presentation`, `pitch`, and `slide` files across `/Users/kirtan/Hackathons/Dev`, parent directories, Downloads, Documents, and Desktop.
- **Findings:**
  - `Devf8rge Finals Orientation · Halloween Hack BLR.pdf` (Hackathon orientation handbook, 27 pages).
  - `../DevForge/presentation/official_template.pptx` (DevForge hackathon template).
  - `../DevForge/presentation/openpipe_official_prelims_final.pptx` (Previous preliminary hackathon project for OpenPipe).
  - `~/Downloads/SENTRIX.pptx` (Unrelated project).
  - **Result:** No previous PowerPoint, PPTX, or PDF presentation existed for **Sieve**. This final presentation was designed and built from scratch according to the master task brief, adhering strictly to the maximum 6-slide limit.

---

## 2. Live Application & Architecture Verification
All claims, numbers, and features in the deck are strictly grounded in the verified codebase:

| Component | Verified State | Proof / Verification Method |
| :--- | :--- | :--- |
| **Python Sieve Engine** | Online & Healthy | Verified at `http://127.0.0.1:8787/api/health`. Standard-library Python 3.10+ (zero `pip install` dependencies). |
| **Local Model (Ollama)** | Ready & Configured | Ollama running locally with `qwen3.5:9b`. Confirmed via health endpoint: `{"model": "qwen3.5:9b", "ollama": true, "model_installed": true}`. |
| **Gemma 4 Visual Intelligence** | Configured & Active | `gemma-4-26b-a4b-it` configured via Google Gemini Interactions API (`GEMMA_API_KEY` in `.env`). Pure Python standard-library multimodal pipeline. |
| **Chrome Extension (MV3)** | Loaded & Injected | Manifest V3 extension loaded unpacked in Chromium via Playwright. Successfully verified injection of `.sieve-native-switcher`, Shadow DOM container (`div#sieve-workspace-host`), and live popup communication. |
| **GitHub Source Repository** | Public on GitHub | `https://github.com/ThatKJ/sieve` (MIT Licensed). Verified via `gh repo view ThatKJ/sieve`. |
| **Live Demo Target Repository** | 3 Active PRs | `https://github.com/ThatKJ/sieve-demo-target` containing PRs #3 (Ready, 100/100), #4 (Low-Effort, 25/100), and #5 (Low-Effort Docs, 43/100). |
| **Web Showcase Application** | Running & Exportable | Served by engine on `http://127.0.0.1:8787` and built for static hosting on Vercel. Static demo snapshot fallback logic verified in `web/app.js`. |
| **Automated Test Suites** | 100% Passing | **94 Python unit and lifecycle tests** passed in 0.095s (`python3 -m unittest discover -s tests`). **15 extension component tests** passed in Node.js (`extension/test/*.test.mjs`). |

---

## 3. Product Visuals & Screenshot Provenance
Every screenshot in the presentation was captured live from the running application environment:
1. **`presentation/assets/harness_command_center_2x.png`:**
   - Captured from Sieve Command Center running at 2x retina resolution (`3200x2000`).
   - Shows active triage KPI lanes (3 Action Needed, 0 Waiting, 0 Blocked, 0 Ready to Merge), PR list, and selected spotlight card.
2. **`presentation/assets/real_pr4_drawer_open_2x.png`:**
   - Captured from PR Intelligence drawer open on PR #4 (`3200x2000`).
   - Displays real score (25/100), Claim vs Reality breakdown (missing tests, non-existent `ledgerly.validators`), regression radar, and SVG topology DAG.
3. **`presentation/assets/extension_popup_live.png`:**
   - Captured from unpacked Chrome extension running live in Chromium (`chrome-extension://hlddfekemfnlffmgohhoggokgcahmecb/popup/popup.html`).
   - Proves real 4ms ping latency, Ollama model readiness, Gemma 4 active model status, and GitHub token quota (5000 req/h).
4. **`presentation/assets/web_app_home_2x.png` & `web_app_repo_queue_2x.png`:**
   - Captured from the live web application on `127.0.0.1:8787` (`3200x2000`).
   - Displays the Repository Atlas with interactive 3D import topology.
5. **`presentation/assets/sieve_activation_screen_2x.png`:**
   - Captured from real activation lifecycle in `extension/ui/activation.js`.
6. **`presentation/assets/sieve_workflow_loop.gif`:**
   - Generated from sequential captured frames showing the activation sequence -> Command Center -> PR intelligence drawer transition.
7. **`presentation/assets/sieve_conceptual_illustration.jpg`:**
   - Minimal 16:9 editorial visual generated via subagent to communicate ripple effect across repository dependencies without fake UI.

---

## 4. Disclosed Limitations & Unverified Items
In strict compliance with hackathon transparency guidelines:
- **No Remote Deployment URL Claimed:** The web app is served locally on `http://127.0.0.1:8787` and designed for static Vercel deployment; no external custom domain was fabricated.
- **No Fabricated Metrics:** No fake user counts, commercial revenue, or benchmark percentages were invented. The 25% AI slop statistic is explicitly cited from the published October 2026 Linux Foundation Research Report.
- **Read-Only Operation:** Sieve never runs contributor code locally or remotely, and never writes comments automatically to GitHub without explicit maintainer copy/paste action.
