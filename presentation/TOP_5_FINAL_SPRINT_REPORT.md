# Sieve — Top 5 Final Sprint Report

## 1. What changed
- **Maintainer-only activation.** Sieve now mounts only when the signed-in GitHub account has `admin`, `maintain` or `write` on the repository being viewed.
  - Engine: `GET /api/permission?repo=owner/repo` (`sieve/server.py`), backed by `actions.repo_access()` (`sieve/actions.py`) and `github.repo_permission()` (`sieve/github.py`).
  - Extension: a new fail-closed gate, `extension/access-gate.js`, called from `reconcile()` in `extension/content.js`. The service worker gets a `GET_REPO_ACCESS` handler with a per-account, per-repo cache and in-flight dedupe (`extension/background.js`). The popup gets a "Maintainer access" row.
- **Halloween edition.** A token-level theme for the workspace, the popup and the in-page pill and switcher. Layout, navigation, data and interactions are unchanged.
- **Dev harness.** `extension/dev/harness.py` can now mock permissions (`?perms=`), the signed-in account (`?login=`) and the engine account (`?engineLogin=`).

## 2. How permissions are verified
1. The content script reads the signed-in account from GitHub's `meta[name="user-login"]`.
2. The engine calls `GET https://api.github.com/repos/{owner}/{repo}` live with its own token and reads that token's `permissions` object. This call skips the shared read cache, because that cache is keyed by URL rather than by account.
3. The extension grants access only when **all** of these hold:
   - Sieve is enabled.
   - The viewer is signed in.
   - The engine's token login equals the viewer's login (case-insensitive).
   - The role is admin, maintain or write.
4. Decisions are keyed `viewer|owner/repo`. Results are cached for 60 s, and only definite answers are cached; errors are never cached.
5. A stale answer, from a repository the user has already navigated away from, is discarded.
6. The backend still checks GitHub's live `viewerPermission` on every write (`actions.availability`). Hiding the UI is not the only protection.

## 3. Accepted permission levels
Accepted: `admin`, `maintain`, `write`.

Rejected: `triage`, `read`, `none`, any unknown role, signed out, engine without a token, engine signed in as a different account, and API errors.

## 4. Non-maintainer behaviour
- GitHub is left as it is: no workspace, no switcher, no PR pill, and the native list is restored.
- A small muted chip appears next to the title, e.g. "Sieve · maintainers only". Hovering it explains why.
- An API error shows "couldn't verify access" with a **Retry** button.
- Signed-out, no-token and account-mismatch states each get their own message.

## 5. Halloween styling
Covered: Maintainer Command Center (KPIs, chips, queue rows, attention list), PR Intelligence drawer, Repository Atlas and Regression Radar panels (through shared tokens), the activation overlay, the popup, the PR pill and the view switcher.
- Colours: background #101014, surfaces #19191F and #22222B, text #F4F0E8 and #AAA5B0, pumpkin #FF813A only for active and focus indicators, violet #8D72B8 for shadows and hover, border #34313B.
- Status colours are accessible on the dark surfaces: green #6CC08B, amber #E8B04B, red #F2706A.
- A small "Halloween edition" mark sits beside the title.
- `prefers-reduced-motion` is respected.
- **To revert:** delete the `data-edition` line in `ensureHost()` (content.js) and the Halloween blocks at the end of `ui/workspace.css` and `popup/popup.css`.

> ⚠️ A second session committed `2218cee` while this sprint was running. That commit contains this permission work **and its own separate Halloween layer**. The working tree currently has two Halloween layers stacked in `workspace.css`/`popup.css`; the later one wins. Keep one before demo (see §10).

## 6. Tests actually run
- `python3 -m unittest discover -s tests`: **170 run, OK.** That is the 155 existing tests plus 15 new ones in `tests/test_repo_permission.py`, all on mocked HTTP.
- `node --test extension/test/*.mjs`: **37 pass, 0 fail.** That is the 19 existing tests plus 18 new ones in `extension/test/access-gate.test.mjs`. They cover all 11 required cases, including the account change, the master switch reset and the stale-response case.
- Live, read-only check of the engine endpoint with the real token:

  | Repository | Role | Result |
  |---|---|---|
  | ThatKJ/sieve-demo-target | admin | granted |
  | ThatKJ/sieve | admin | granted |
  | pallets/click | read | denied |

- Browser lifecycle in the dev harness (Playwright, real content scripts, SPA `pushState` navigation):

  | Role | Workspace mounts | Native list | Chip |
  |---|---|---|---|
  | write | yes | hidden | none |
  | read | no | restored | "maintainers only" |
  | triage | no | restored | "maintainers only" |
  | maintain | yes | hidden | none |
  | API error | no | restored | "couldn't verify access · Retry" |

- **Not run:** the real Chrome extension on github.com, and the mobile layout. No visual screenshot review of the final theme was done.

## 7. Known limitations
- The engine's token decides permission, so the engine (`gh auth login` or `GITHUB_TOKEN`) must be signed in as the same account as the browser. Otherwise Sieve reports "account mismatch" and stays off.
- On a repository the user never leaves, access is re-checked only after navigation, **Clear Cache** in the popup, or a reload.
- With `SIEVE_OFFLINE=1`, the engine reuses a permission that the same token verified online within the last 24 hours. Otherwise it fails closed.
- Read endpoints (queue, analyze, atlas) are not permission-gated on the server. They return what the token can already read. Writes are gated server-side.

## 8. Launch the demo
```bash
cd ~/Hackathons/Dev
gh auth status                       # must be the same account you're signed in as on github.com
python3 -m sieve --serve             # http://127.0.0.1:8787
# chrome://extensions → Developer mode → Load unpacked → extension/  (or Reload if already loaded)
```

## 9. Browser demo steps
1. Signed in as ThatKJ, open https://github.com/ThatKJ/sieve-demo-target/pulls. You have admin access, so the Command Center mounts in the Halloween theme.
2. Click into a PR. The PR Intelligence pill is there.
3. Without reloading, open https://github.com/pallets/click/pulls. You have read access, so Sieve disappears, the native list returns, and the chip says "Sieve · maintainers only".
4. Go back to the demo repo. Sieve re-checks and mounts again.
5. Open the popup. "Maintainer access" shows `verified (admin)` or `not a maintainer (read)`. Toggle Sieve off and everything disappears; toggle it on and it re-verifies.

## 10. Remaining blockers
- **Duplicate Halloween layers** from two concurrent sessions: pick one and delete the other (see §5).
- Reload the unpacked extension in Chrome so `access-gate.js` loads.
- Restart any already-running engine on :8787. It predates `/api/permission`, so it will return 404 and the extension will fail closed.

## Judge-facing summary
Sieve now behaves like a maintainer tool should. It checks GitHub for your actual role on each repository you open, and it turns on only if you can act on what it shows you: write, maintain or admin. Contributors and visitors see plain GitHub. If Sieve can't confirm your role, it stays off instead of guessing. Every merge, close or label action is checked against GitHub again on the server, so hiding the UI is never the only safeguard.
