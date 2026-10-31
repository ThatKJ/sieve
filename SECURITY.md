# Security policy

Sieve reads untrusted input (pull request text, diffs and whole repository snapshots written by strangers) and runs a local HTTP engine on your machine, so security reports are taken seriously.

## Supported versions

Sieve has no tagged releases yet. Security fixes land on `main`; please test against the latest `main` before reporting.

## Reporting a vulnerability

**Please do not open a public issue, pull request or discussion for a security problem.**

- **Preferred, once enabled:** GitHub private vulnerability reporting (the repository's **Security → Report a vulnerability** button). The maintainer has not enabled it yet, so the button may not appear.
- **Until then:** contact the maintainer privately through the contact options on their GitHub profile, https://github.com/ThatKJ, and ask for a private channel before sending details.

Include:

- what is affected (engine endpoint, extension component, Gemma integration) and the commit you tested;
- steps to reproduce, or a minimal proof of concept;
- the impact you believe it has;
- any suggested fix.

**Never include in any report:** real API keys, GitHub tokens, the contents of your `.env`, or private repository data. Redact them; we will never ask for them.

## What to expect

This is a small, volunteer-maintained project, so these are goals, not guarantees:

1. Acknowledgement of your report within a few days.
2. An assessment and, if confirmed, a fix on `main`, developed privately where possible.
3. Credit in the fix commit or release notes if you want it.

## Security model in brief

- **Read-only on GitHub.** The engine only issues GET requests to GitHub. Nothing comments, approves, merges or closes on its own.
- **No execution of contributor code.** Python is parsed with `ast`; JS/TS imports are matched textually. Repository tarballs are read in memory and never extracted.
- **Local engine.** The server binds to `127.0.0.1:8787` by default and rejects browser requests whose `Origin` is not localhost or a Chrome extension. Note that *any* installed extension is allowed, not only Sieve's ID.
- **Secrets stay server-side.** `GITHUB_TOKEN` and `GEMMA_API_KEY` / `GEMINI_API_KEY` are read from the environment or a git-ignored `.env`. The extension never receives them, and the engine does not log them.
- **Model output is advisory.** Gemma 4 responses are labelled as model output, classified against deterministic evidence, and cannot trigger any action.

The full threat model is in [`docs/SECURITY.md`](docs/SECURITY.md).

## Known gaps

Disclosed openly so users can judge their own exposure:

- **Fixed: Host and Origin validation.** Every request must carry exactly one `Host` naming the engine (`127.0.0.1`, `localhost` or `[::1]` on its port; extra hosts only via `SIEVE_ALLOWED_HOSTS`), which defeats DNS rebinding. `Origin`, when present, must exactly match the pinned Sieve extension ID (`nffobfkdjlmdldapfdajnignlciihlab`, fixed by the public `key` in the manifest; extra IDs via `SIEVE_EXTENSION_IDS`), the engine's own origin, or `SIEVE_DEV_ORIGINS`. Other extensions, other localhost ports, `null` and malformed origins are refused. The write route `/api/pr/action` additionally requires an `Origin`. Tests: `tests/test_pr_actions.py::ServerBoundaries`.
- **GitHub writes are possible but off by default.** Sieve can merge, close, review, comment and edit PR metadata, but only when the engine runs with `SIEVE_ENABLE_WRITES=1`, only after the maintainer confirms each action, and only if the PR head is unchanged since it was reviewed. The token (`GITHUB_TOKEN`, else `gh auth token`; disable the fallback with `SIEVE_GH_FALLBACK=0`) never leaves the engine. A `gh` login usually has the `repo` scope, so it *can* write: Sieve's gate, not the token, keeps it read-only. The AI modules cannot reach the write path (enforced by a test). Details: `presentation/STAGE_2_IMPLEMENTATION_REPORT.md`.
- **Gemma API key travels in the request URL.** Calls to the Gemini API pass the key as a `?key=` query parameter rather than the `x-goog-api-key` header Google recommends. Query strings are more likely to appear in proxy logs or exception text, and Gemma error messages are relayed to the extension. No leak has been observed, but the planned fix is to move the key to the header and redact upstream error text.
- **The engine has no authentication.** Do not expose it beyond localhost (`SIEVE_HOST` should stay `127.0.0.1`).
