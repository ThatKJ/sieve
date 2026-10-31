# Sieve — Full Product Audit

Audit date: 2026-10-31. Stage 1 of 6 (audit only).

Legend: **[V]** verified by reading code or running a command in this audit · **[A]** assumption, not verified.

---

## 0. Disclosure: work in progress from this session

Before the staged plan arrived, this session began implementing PR write actions under the earlier single-prompt brief. That work is **uncommitted, unwired and untested**, and is listed here so the audit does not present it as pre-existing or complete:

| File | Change | State |
|---|---|---|
| `sieve/github.py` | Added `write()` (uncached POST/PUT/PATCH/DELETE with GitHub error mapping) and `graphql_mutation()`; module docstring updated | Not called by anything yet |
| `sieve/actions.py` (new) | `controls()` live PR state via GraphQL, `availability()` rules, `validate()`, `perform()` with stale-SHA check and per-PR in-flight lock | Not imported by `server.py`; no tests |

Everything below describes the product **excluding** those two changes unless stated.

---

## 1. Repository state [V]

| Item | Value |
|---|---|
| Branch | `fix/github-native-integration` (no upstream; **never pushed**) |
| HEAD | `0ce56dcac83305f8dbaa13736846608d38c295a6` |
| Remote | `origin` → `git@github.com:ThatKJ/sieve.git` |
| Remote branches | `main` and `workspace-monochrome-v2`, both at `0ea77cf` |
| Divergence vs `origin/main` | 13 commits ahead, 0 behind |
| Uncommitted | 25 modified tracked files (+2386 / −998 lines) and untracked `extension/test/`, `presentation/`, `scripts/`, `sieve/lifecycle.py`, `tests/test_lifecycle.py`, `web/assets/`, `web/demo-data.js`, plus this session's `sieve/actions.py` |
| Ignored, present locally | `.env` (holds `GEMMA_API_KEY`, `GEMINI_API_KEY`; values not printed), `.vercel/`, `.cache/`, `.venv/`, `.playwright-mcp/`, `.impeccable/`, an orientation PDF in the repo root |

Note: `.gitignore` has `.env*`, which would also ignore `.env.example`. It is already tracked, so edits still show up, but a fresh clone that deletes and re-adds it would lose it. **[V]**

---

## 2. Architecture as built [V]

```
GitHub page (content scripts, Shadow DOM UI)
  └─ chrome.runtime.sendMessage ─► background.js (MV3 service worker, 60 s in-memory cache)
        └─ fetch http://127.0.0.1:8787/api/* ─► sieve/server.py (stdlib ThreadingHTTPServer)
              ├─ core.py / atlas.py / lifecycle.py ─► github.py ─► api.github.com (GET + GraphQL queries)
              ├─ llm.py   ─► Ollama (local, optional)
              └─ gemma.py ─► generativelanguage.googleapis.com (cloud, optional)
web/ (static showcase) ─► same /api when served by the engine; bundled demo-data.js otherwise
```

Engine routes: `GET /api/health`, `GET /api/analyze?pr=`, `GET /api/atlas?pr=|repo=`, `GET /api/queue?repo=`, `POST /api/gemma/analyze`, `POST /api/gemma/chat`. There are no write routes.

Extension messages: `CHECK_HEALTH`, `GET_QUEUE`, `GET_ANALYZE`, `GET_ATLAS`, `CLEAR_CACHE`, `ANALYZE_GEMMA_VISUAL`, `CHAT_GEMMA_VISUAL`; tab broadcasts `SIEVE_HEALTH_UPDATED`, `SIEVE_CACHE_CLEARED`, `SIEVE_STATUS`.

---

## 3. Feature capability audit

| Area | Path traced | Status |
|---|---|---|
| A. GitHub integration | `github.py`: cached REST GETs, GraphQL `LIFECYCLE_QUERY` (reviews, review requests, mergeable, checks rollup), tarball snapshots. Token from `GITHUB_TOKEN` or `gh auth token` | **Working, read-only** [V] |
| B. Mission Control | `content.js` → `GET_QUEUE` → `/api/queue` → `core.queue()` (deep pass on 15 PRs, cross-PR collisions, duplicate fixes) → `attach_lifecycle()` (GraphQL, REST fallback) → `command-center.js` | **Working** [V]. Unit-tested: `test_core`, `test_lifecycle`, `command-center.test.mjs` |
| C. PR Intelligence | PR pill / row → `GET_ANALYZE` → `core.analyze()` → `pr-intelligence.js` overlay: overview, change summary, blast radius, claim-vs-reality, checklist, related work, suggested response (copy only) | **Working, read-only** [V] |
| D. AST / blast radius | `atlas.py`: Python `ast` imports + JS import regex, graph, `impact()`, regression radar, verification plan | **Working** [V]; `test_atlas` |
| E. Topology | `topology-svg.js` render + `exportPng` used by Gemma | **Working** [V]. No JS unit test |
| F. Gemma | `POST /api/gemma/analyze` sends PNG + structured evidence; `_ground_references` labels citations; chat is bound to repo/PR/head SHA | **Working when a key is set** [V]; `test_gemma`, `test_server_gemma` |
| F. Ollama | `llm.judge()` only when `/api/analyze?model=1`; the extension always sends `model=0` | **Backend works; not reachable from the extension UI** [V] |
| G. Extension lifecycle | MV3, `storage` permission only; master enable, auto-open, activation sequence, SPA navigation dedupe, invalidated-context recovery | **Working** [V per code]; manifest contract tested |
| H. Python engine | stdlib only, binds `127.0.0.1` by default (`SIEVE_HOST` overrides) | **Working** [V] |
| I. Public website `web/` | Static; `app.js` serves `demo-data.js` snapshots when not on the engine port; `scripts/verify_web_showcase.py` (Playwright) checks the static fallback | **Static-ready** [V]. Live deployment state unknown [A] |
| J. Presentation | `presentation/` (untracked): PPTX, PDF, `slides.html`, notes, script, verification report, 24 assets incl. GIF | **Exists**. Accuracy versus the final product is not verified (Stage 6) |

---

## 4. PR lifecycle capability matrix

For every row, these columns were empty in the original product: UI component, handler, extension message, backend route, GitHub write endpoint and tests. "Read" means Sieve only displays the information.

| Action | UI | Message | Route | GitHub endpoint (needed) | Tests | Status |
|---|---|---|---|---|---|---|
| Merge (merge/squash/rebase) | — | — | — | `PUT /pulls/{n}/merge` | — | **Missing** |
| Close | — | — | — | `PATCH /pulls/{n}` | — | **Missing** |
| Reopen | — | — | — | `PATCH /pulls/{n}` | — | **Missing** |
| Approve | — | — | — | `POST /pulls/{n}/reviews` | — | **Missing** |
| Request changes | — | — | — | same | — | **Missing** |
| Review comment | — | — | — | same | — | **Missing** |
| General comment | "Suggested response" textarea, **Copy** only | — | — | `POST /issues/{n}/comments` | — | **Missing** (draft-to-clipboard only) |
| Inline review comments | — | — | — | `POST /pulls/{n}/comments` or review `comments[]` | — | **Missing** |
| Assign users | — | — | — | `POST/DELETE /issues/{n}/assignees` | — | **Missing** |
| Request reviewers | — | — | — | `POST/DELETE /pulls/{n}/requested_reviewers` | — | **Missing** |
| Labels add/remove | — | — | — | `POST /issues/{n}/labels`, `DELETE …/labels/{name}` | — | **Missing** |
| Milestones | — | — | — | `PATCH /issues/{n}` `{milestone}` | — | **Missing** |
| Draft → ready | — | — | — | GraphQL `markPullRequestReadyForReview` | — | **Missing** |
| Ready → draft | — | — | — | GraphQL `convertPullRequestToDraft` | — | **Missing** |
| Update branch | — | — | — | `PUT /pulls/{n}/update-branch` | — | **Missing** |
| Mergeability | Mission Control lifecycle status | `GET_QUEUE` | `/api/queue` | GraphQL `mergeable` | `test_lifecycle` | **Read, list level only** (no `mergeStateStatus`, not shown in PR Intelligence) |
| Required status checks | Lifecycle "checks failing" | `GET_QUEUE` | `/api/queue` | GraphQL `statusCheckRollup` | `test_lifecycle` | **Partial read**: rollup state only, no `isRequired` |
| Review requirements | Lifecycle uses `reviewDecision` and latest reviews | `GET_QUEUE` | `/api/queue` | GraphQL | `test_lifecycle` | **Partial read** |
| Merge queue | — | — | — | GraphQL `mergeQueueEntry` | — | **Missing** |

Conclusion **[V]**: PR controls are not partly built or disconnected. They are entirely absent, and the product states this on purpose ("Sieve never posts to GitHub" in `pr-intelligence.js:525` and the `github.py` docstring). Readiness data exists only for Mission Control rows.

---

## 5. Architecture and security

| Topic | Finding |
|---|---|
| Auth model **[V]** | One token, resolved on the engine from `GITHUB_TOKEN` or `gh auth token`; sent only to `api.github.com`; never returned to the extension. |
| Token scope **[A]** | Not inspected (that would require handling the token). A `gh` CLI OAuth token normally carries the classic `repo` scope, so **Sieve's token can probably write already**. Sieve's read-only behaviour comes from its code, not from the token's permissions. |
| Credential storage **[V]** | Env / `.env` (git-ignored) / gh keychain. Nothing is stored in the extension; `chrome.storage` holds only the engine URL and preferences. |
| Content script / page access **[V]** | Content scripts never receive the token; the shadow DOM UI uses `textContent` for untrusted text. |
| Localhost binding **[V]** | `127.0.0.1` default; `SIEVE_HOST` can widen it (documented). |
| Origin validation **[V]** | Allows no `Origin`, any `chrome-extension://*`, and `localhost`/`127.0.0.1` at any port. **Any installed extension can call the engine.** Acceptable for reads; **a release blocker for writes**. |
| Host validation **[V]** | None (already disclosed in `SECURITY.md:47`, DNS rebinding). **Must be fixed before writes.** |
| Message validation **[V]** | `background.js` forwards message fields without validating them; `onMessage` does not check `sender`. Only content scripts can send these messages, so the exposure is low, but the engine must re-validate everything. |
| Request limits **[V]** | POST body capped at 10 MB. No rate limiting on the engine. |
| Session isolation **[V]** | Gemma chat sessions are keyed by repo/PR/head SHA (`make_session_key`). |
| GitHub errors **[V]** | Reads map 404/403/429/URLError to clean messages; an unexpected exception returns a generic 500 and no traceback. |
| Gemma boundary **[V]** | Sends PNG plus structured PR evidence; no GitHub token. The API key goes in the URL query (`?key=`); error text echoes up to 400 characters of Google's response body to the client. Low risk, but the `x-goog-api-key` header is preferable. |

**Safest write design** (recommended): keep the token on the engine. Writes are **off unless `SIEVE_ENABLE_WRITES=1`**. Write routes require (a) `Host` = `127.0.0.1:<port>`/`localhost:<port>`, (b) `Origin` = the pinned Sieve extension ID (`SIEVE_EXTENSION_ID`) or a localhost origin, and (c) a custom header that forces a CORS preflight. Each write re-reads live PR state, checks the head SHA the human reviewed, checks permission and state rules, holds a per-PR in-flight lock, and returns GitHub-confirmed state. Model code never imports the action module. Minimum fine-grained PAT permissions: Pull requests R/W, Issues R/W (comments, labels, assignees, milestones), Contents R/W (merge, update branch), Metadata R, plus Checks/Commit statuses R for readiness.

---

## 6. Product gap analysis (Discover → Prioritise → Understand → Review → Decide → Act → Verify)

| Stage | State |
|---|---|
| Discover / Prioritise | Strong: Mission Control, lifecycle status, collisions, duplicates |
| Understand | Strong: PR Intelligence, AST blast radius, topology, Gemma |
| Review | Partial: checklist and draft response exist, but nothing can be submitted |
| Decide | Partial: readiness is shown per row in Mission Control, not inside PR Intelligence, and required checks are not distinguished |
| **Act** | **Missing entirely** |
| Verify | Missing: no post-action refresh path; Mission Control caches for 60 s |

Other gaps: Ollama is not reachable from the extension; there is no in-product permission/access-mode indicator; onboarding has no write-enable step.

---

## 7. Deployment and release audit

| Item | Finding |
|---|---|
| Static readiness **[V]** | `web/` is fully static, uses relative script paths, and falls back to bundled demo data off the engine port. |
| Vercel config **[V]** | Root `vercel.json` rewrites `/(.*)` → `/web/$1`; `web/vercel.json` sets `cleanUrls` only. `.vercel/project.json` links project **`sieve-workspace`** (`prj_qjaZ…`). The two configs imply different root-directory choices; pick one (Stage 5). |
| Vercel CLI **[V]** | Not installed on this machine. Deployment history, production URL and dashboard Root Directory are **unknown [A]**. |
| `web/` dependency on untracked files **[V]** | `web/demo-data.js` and `web/assets/` are untracked. A Git-based Vercel deploy from the remote today would **lack the demo fallback and screenshots**. |
| Secrets **[V]** | `.env` is ignored and holds Gemma keys. No full scan of tracked or untracked content was run in this stage (Stage 4). |
| Tests **[V, run in this audit]** | `python3 -m unittest discover -s tests` → **94 passed**; `node --test extension/test/*.test.mjs` → **15 passed, 0 failed, 0 skipped**; `node --check` passes on all extension/web JS; `compileall` OK. Python 3.14.7, Node 26.5.0. Browser test `scripts/verify_web_showcase.py` exists (Playwright importable) but **was not run**. |
| CI **[V]** | Python 3.10/3.12/3.13 unit tests + extension JS tests/syntax/manifest. |
