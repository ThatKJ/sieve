# Sieve — Implementation Roadmap

Derived from `presentation/FULL_PRODUCT_AUDIT.md` (2026-10-31). Items are ordered by dependency within each section.

## 1. Release blockers

| # | Blocker | Files |
|---|---|---|
| B1 | Pin write callers: validate `Host`; allow write routes only from the Sieve extension ID (`SIEVE_EXTENSION_ID`) or localhost; require a custom write header | `sieve/server.py`, `tests/test_server_*.py` |
| B2 | Writes default to off (`SIEVE_ENABLE_WRITES=1` opt-in), exposed in `/api/health` and the UI | `sieve/actions.py`, `sieve/server.py` |
| B3 | Untracked runtime files must ship: `web/demo-data.js`, `web/assets/`, `sieve/lifecycle.py`, `tests/test_lifecycle.py`, `extension/test/` | git (Stage 4) |
| B4 | Branch `fix/github-native-integration` is unpushed and 13 commits ahead of `origin/main` | git (Stage 4) |
| B5 | Resolve the two Vercel configs (root rewrite vs `web/` root) and confirm the linked project `sieve-workspace` | `vercel.json`, `web/vercel.json` (Stage 5) |

## 2. Core missing product capability: the PR Control Center (Stage 2)

Dependency order:

1. **GitHub write client**: `write()`, `graphql_mutation()` with status mapping (401 expired, 403 denied, 404 inaccessible, 405/409 refused, 422 invalid, 429/secondary rate limit, network). *Drafted this session; needs tests.* → `sieve/github.py`
2. **Control state**: one uncached GraphQL query for state, draft, merged, `mergeable`, `mergeStateStatus`, `reviewDecision`, checks with `isRequired`, `viewerPermission`, allowed merge methods, labels, assignees, requested reviewers, head SHA, and to add: milestones and `mergeQueueEntry`. *Drafted, minus milestone and queue.* → `sieve/actions.py`
3. **Action engine**: `availability()` rules, `validate()`, `perform()` with stale head-SHA check, per-PR in-flight lock and post-write refresh. Add `set_milestone` / `clear_milestone`. → `sieve/actions.py`
4. **Routes**: `GET /api/pr/controls?pr=`, `POST /api/pr/action`, mapping `ActionError` and `GitHubError` statuses. → `sieve/server.py`
5. **Extension messages**: `GET_PR_CONTROLS` (never cached) and `PR_ACTION` (POST with the write header; on success clears cached `/api/analyze` and `/api/queue`). → `extension/background.js`
6. **UI**: a "Pull request controls" block in the PR Intelligence side column, rendered by a new `extension/ui/pr-controls.js`:
   - Readiness panel: state, mergeability, merge state explained, review decision, required checks, your permission, access mode.
   - Primary actions: Review (type selector + body), Merge (method select limited to allowed methods), Close (optional comment).
   - "More" menu: Comment, Reopen, Assign, Reviewers, Labels, Milestone, Draft/Ready, Update branch.
   - An inline confirmation panel for every write (repository, PR, title, action, and for merge: method plus live readiness). No `window.confirm`.
   - Disabled controls show the `availability()` reason. Controls stay disabled in flight. Success is shown only after GitHub confirms; then controls re-render from the returned state. A stale error offers "Reload state".
   - The suggested-response copy becomes "Draft only. Nothing is posted unless you submit it below", with a "Use as comment" button that only fills the textarea.
   → `extension/ui/pr-controls.js` (new), `extension/ui/pr-intelligence.js`, `extension/ui/workspace.css`, `extension/manifest.json`
7. **Mission Control refresh** after an action (`forceFresh` on the next queue load). → `extension/content.js`

Inline review comments: defer and document unless diff-position mapping is implemented against `pulls/{n}/files` patches with `line`/`side` and `commit_id` = the reviewed head SHA.

## 3. Secondary features

- Ollama toggle in the extension (`useModel` is currently hard-coded `false`) → `extension/content.js`
- Merge queue: show `mergeQueueEntry` state; enqueue only if the repository uses a queue → `sieve/actions.py`
- Auto-merge enablement: out of scope

## 4. Security requirements

- Token stays on the engine; never in messages, DOM, logs, Gemma payloads or `web/`.
- The model modules (`gemma.py`, `llm.py`) never import `actions.py`; add a test that asserts this.
- Server-side validation of repo, PR number, action, logins, labels (existing labels only, since GitHub would silently create new ones), body ≤ 65,536 chars, merge method allowed by the repository, and a 40-hex head SHA.
- Close never deletes branches.
- Optional: move the Gemma key from the URL query to the `x-goog-api-key` header; trim echoed error bodies.
- Fix `.gitignore` `.env*` so it does not match `.env.example`.

## 5. Testing requirements

Python `unittest` with `github.write` / `github.graphql` mocked (no network): merge success, conflict, failing required checks / blocked, permission denied, invalid and disallowed merge method, already merged, already closed, close (+comment, comment failure), reopen, approve, self-approve refused, request changes (body required), comment, duplicate in-flight, rate limit (429 and 403 + `X-RateLimit-Remaining: 0`), network error, stale head SHA, invalid repo/PR (404), writes disabled, no token, expired token (401), malformed input, label not in repository, assignee silently skipped, post-action refresh, server route Host/Origin/header enforcement, model modules not importing actions.
JS (`node:test`, vm-loaded like `command-center.test.mjs`): disabled reason rendering, confirmation required before send, button disabled while in flight, success shown only on an `ok` response.
Run the full suites after each area.

## 6. Deployment requirements (Stage 5)

Commit `web/demo-data.js` and `web/assets/`; choose one Vercel root (recommended: Root Directory `web`, no build, and drop the root rewrite); install or authenticate the Vercel CLI; preview deploy; run `scripts/verify_web_showcase.py` against the preview; then production.

## 7. Presentation requirements (Stage 6)

Re-check all 6 slides against the shipped product. Add the PR Control Center only after it has been demonstrated against a test repository (`ThatKJ/sieve-demo-target` is the natural candidate, if the user authorises writes there). Replace any claim like "Sieve never writes to GitHub" with the read-only-by-default and confirm-to-write model.

## Recommended sequence

Stage 2: steps 1 → 2 → 3, with Python tests → 4 (server security B1/B2 together) → 5 → 6 → 7 → docs (`docs/PR_CONTROLS.md`, README permissions, `SECURITY.md`) → `presentation/PR_CONTROL_IMPLEMENTATION.md`. Then Stage 3 QA, Stage 4 release (B3, B4), Stage 5 deploy (B5), Stage 6 presentation.
