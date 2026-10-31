# Stage 2: Security Hardening + PR Control Center

Date: 2026-10-31. Nothing was committed, pushed or deployed by this session.

## 1. Initial Git state
Branch `fix/github-native-integration`, HEAD `0ce56dc`, 35 status entries (25 modified, untracked dirs). The snapshot was saved to the session scratchpad (status, full diff, untracked checksums).

## 2. Preserved work, and a concurrency warning
- No existing file was lost: every path in the initial snapshot still exists. The only edits to existing tests were deliberate (see 3).
- **During this stage, a different session committed four times on this branch** (`dc722c5`, `1b05cbe`, `0389f50`, `111345e`, authored "Kirtan"). Those commits include files this session wrote (`sieve/actions.py`, `tests/test_pr_actions.py`, `background.js`, `github.py` changes), and that session staged others (`pr-controls.js`, `manifest.json`, etc.). This session ran no git write commands. Stage 4 must reconcile what was committed against this report.

## 3. Security issues and fixes (`sieve/server.py`)
| Issue | Fix | Tests |
|---|---|---|
| Any `chrome-extension://` origin was trusted | Exact match against the pinned ID `nffobfkdjlmdldapfdajnignlciihlab` (from a public `key` added to `manifest.json`; the private key was discarded) plus `SIEVE_EXTENSION_IDS`. Localhost is now only the engine's own port; other ports need `SIEVE_DEV_ORIGINS`. `null`, trailing-slash, case-variant, `https`, look-alike and padded origins are refused. | `ServerBoundaries.test_origin_validation`, `test_manifest_key_produces_pinned_id` |
| No `Host` validation (DNS rebinding) | Exactly one `Host` from the allow-list, checked on **every** request, static files included. Missing or duplicate Host → 403. No forwarded headers are trusted. | `test_host_validation`, `test_dns_rebinding_get_refused` |
| Writes need a stronger caller check | `/api/pr/action` also **requires** an Origin, so curl and rebinding pages are refused | `test_action_route_requires_trusted_origin` |

Existing tests changed on purpose: `test_engine_capabilities.py` used to assert that arbitrary extension IDs and `localhost:3000` were allowed, and now asserts they are refused. The Gemma server tests now send a `Host` header and a trusted extension origin.
Mutation-checked: disabling the stale-SHA, extension-ID or Host check makes the matching test fail.
Side effect: the extension ID changes once, so preferences saved in `chrome.storage` (enable/auto-open) reset after reloading the unpacked extension.

## 4. Authentication paths and effective permissions
| Source | Selection | Effective permission |
|---|---|---|
| `GITHUB_TOKEN` env (or `.env`) | Always wins, even if invalid; Sieve never silently falls back to `gh` | Classic/OAuth: from `X-OAuth-Scopes` (`repo`/`public_repo` → write). Fine-grained/App: **unknown** until GitHub answers |
| `gh auth token` | Only when no env token; disable with `SIEVE_GH_FALLBACK=0` | **Verified live (read-only call):** this machine's `gh` OAuth token has `repo, read:org, gist, admin:public_key`, so `write_capable: yes` |
| None | — | Read-only public access |

No other credential sources exist (the disk cache stores only responses). Diagnostics expose the source, kind, login, scopes and write capability, never the token; tests assert this. Writes additionally require `SIEVE_ENABLE_WRITES=1`. UI access states: `write`, `read_only`, `token_read_only`, `auth_expired`, `no_token`, `offline`. "Repository access missing" surfaces as the 404 load error.

## 5. Implemented PR actions (`sieve/actions.py`, `POST /api/pr/action`)
| Action | GitHub endpoint | Min. role |
|---|---|---|
| Merge (merge/squash/rebase, repo-allowed only, `sha` pinned) | `PUT /pulls/{n}/merge` | write |
| Close (optional comment, branch never deleted) / Reopen | `PATCH /pulls/{n}` (+ `POST /issues/{n}/comments`) | triage or author |
| Approve / Request changes / Review comment (`commit_id` pinned) | `POST /pulls/{n}/reviews` | read (not own PR) |
| General comment | `POST /issues/{n}/comments` | read |
| Inline line comment (line re-validated against the live diff at the reviewed SHA; `line`+`side`+`commit_id`, no positions guessed) | `POST /pulls/{n}/comments` | read |
| Labels add (existing labels only) / remove | `POST /issues/{n}/labels`, `DELETE …/labels/{name}` | triage |
| Assign / unassign (silently skipped users reported) | `POST/DELETE /issues/{n}/assignees` | triage |
| Request / remove reviewers | `POST/DELETE /pulls/{n}/requested_reviewers` | triage or author |
| Set / clear milestone (open milestones only) | `PATCH /issues/{n}` | triage |
| Ready for review / convert to draft | GraphQL `markPullRequestReadyForReview` / `convertPullRequestToDraft` | write or author |
| Update branch (only when `BEHIND`, `expected_head_sha` pinned) | `PUT /pulls/{n}/update-branch` | write or author |

Status of every row: **implemented · unit-tested with mocked GitHub · connected to the UI · NOT verified against a real repository** (no real write has been made).

Read state (`GET /api/pr/controls`, one GraphQL query plus the files list, uncached): state, draft, `mergeable`, `mergeStateStatus` explained, `reviewDecision`, latest review per reviewer, requested reviewers, checks with `isRequired`, merge-queue status, allowed merge methods, your role, labels, assignees, milestones, commentable line ranges. **The query was verified against GitHub's live schema** with a read-only call on `ThatKJ/sieve-demo-target#3`.

Safety lifecycle per write: shape validation → per-PR lock and one-time `request_id` → live re-read → head-SHA match → `availability()` rule (state + role + access mode) → one GitHub call → re-read → `verified` true/false/null plus an evidence URL. Failures keep the form text. Engine and extension caches are invalidated after a write so Mission Control refreshes from GitHub. The AI modules cannot import the write path (test-enforced).

## 6. Not implemented
- **Adding to the merge queue**: the status is shown, and merge is blocked with an explanation when a queue is required. Use GitHub to enqueue.
- **Team reviewers**: only user logins are accepted.
- **Multi-comment pending reviews**: each inline comment posts on its own.
- **Real-repository write verification: not done.** It needs your authorisation and a test repository.

## 7. API endpoints added
`GET /api/pr/controls?pr=owner/repo#n`, `POST /api/pr/action` with `{pr, action, params, expected_head_sha, request_id}`. Extension messages: `GET_PR_CONTROLS` and `PR_ACTION` (`background.js` checks the sender is this extension, validates the fields, and never caches).

## 8. UI integration
A "Pull request controls" block heads the PR Intelligence side column (`extension/ui/pr-controls.js`, mounted from `pr-intelligence.js`; styles in `workspace.css`). It shows a readiness panel, then Review/Merge/Close/Comment, then "More actions": reopen, draft toggle, update branch, labels, assignees, reviewers, milestone, line comment. Disabled buttons show the engine's reason. Every write opens an inline confirmation panel listing the repository, PR, title, action and its effects; for a merge, it also shows the method, pinned SHA, GitHub's merge state and checks. "Suggested response" no longer claims Sieve never posts. **Not browser-tested in this stage** (no screenshots, light/dark or narrow-layout check).

## 9. Tests (executed in this session on the final tree)
| Command | Result |
|---|---|
| `python3 -m unittest discover -s tests` | **155 run, OK** (94 before; +61 in `test_pr_actions.py`) |
| `node --test extension/test/*.test.mjs` | **19 tests, 19 pass, 0 fail** (+4 in `pr-controls.test.mjs`) |
| `node --check` on all extension and web JS; manifest JSON; `compileall` | all OK |
| Live read-only `actions.controls()` on `ThatKJ/sieve-demo-target#3` | OK; schema valid; read-only mode blocks every write |

Not run: `scripts/verify_web_showcase.py`, browser/extension end-to-end, SPA-navigation tests for the controls, and any real write.

## 10. Known limitations and risks
- Permission pre-checks use the user's repository role; a fine-grained token may still be refused by GitHub (its 403 reason is shown).
- Only the first 300 changed files are checked for inline comments, and only the first 100 checks are shown.
- `update_branch` completes asynchronously (`verified: null`).
- The request-ID memory and per-PR lock are per engine process (they reset on restart).
- The engine has no authentication of its own: localhost plus Host/Origin are the boundary.
- Docs still to update: README and a `docs/PR_CONTROLS.md` user guide (only `SECURITY.md` and the roadmap were updated).

## 11. Files changed by this session
`sieve/github.py`, `sieve/actions.py` (new), `sieve/server.py`, `extension/manifest.json`, `extension/background.js`, `extension/ui/pr-controls.js` (new), `extension/ui/pr-intelligence.js`, `extension/ui/workspace.css`, `tests/test_pr_actions.py` (new), `tests/test_engine_capabilities.py`, `tests/test_server_gemma.py`, `extension/test/pr-controls.test.mjs` (new), `SECURITY.md`, `presentation/IMPLEMENTATION_ROADMAP.md`, this report.

## 12. Next stage
Before Stage 3: (1) settle which session owns git on this branch; (2) authorise one real write test, e.g. with `SIEVE_ENABLE_WRITES=1` on a throwaway PR in `ThatKJ/sieve-demo-target`: comment → label → close → reopen. Then Stage 3 browser QA of the controls.
