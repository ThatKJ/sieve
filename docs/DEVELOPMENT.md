# Development guide

How to run, debug and test Sieve locally. For architecture see [ARCHITECTURE.md](ARCHITECTURE.md); for contribution rules see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Prerequisites

| Tool | Needed for | Notes |
|---|---|---|
| Python 3.10+ | Engine, tests | Standard library only; the suite also passes on 3.9 |
| Git | Everything | |
| Node.js (any LTS) | `node --check` syntax checks | Optional locally, used in CI |
| Chrome | The extension | Load unpacked from `extension/` |
| Ollama + `qwen3.5:9b` | Local relevance check | Optional; Sieve degrades gracefully without it |
| GitHub token | Rate limit 5,000/h instead of 60/h | Optional; `gh auth token` is used automatically if the GitHub CLI is logged in |
| Gemma API key | Visual intelligence | Optional; get one from Google AI Studio |

## Configuration

```bash
cp .env.example .env     # .env is git-ignored; never commit it
```

| Variable | Default | Purpose |
|---|---|---|
| `GEMMA_API_KEY` | unset | Gemini API key for `gemma-4-26b-a4b-it` |
| `GEMINI_API_KEY` | unset | Used if `GEMMA_API_KEY` is not set |
| `GITHUB_TOKEN` | `gh auth token` if available | GitHub API authentication (read-only use) |
| `SIEVE_MODEL` | `qwen3.5:9b` | Ollama model for the local relevance check |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `SIEVE_OFFLINE` | unset | `1` serves only from the on-disk cache |
| `SIEVE_CACHE` | `.cache/github` | Cache directory |
| `SIEVE_CACHE_TTL` | `900` | Seconds before cached API responses are refetched |
| `SIEVE_HOST` | `127.0.0.1` | Bind address. Keep it on localhost: the engine has no authentication |

## Running

```bash
python3 -m sieve --serve                         # engine + web app on http://127.0.0.1:8787
python3 -m sieve ThatKJ/sieve-demo-target#4      # one PR in the terminal
python3 -m sieve --queue pallets/click           # rank a repository's open PRs
python3 -m sieve ThatKJ/sieve-demo-target#4 --json --no-model
```

### The Chrome extension

1. Start the engine.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select the repository's `extension/` folder (not the repository root).
3. Open a repository's `/pulls` page on GitHub and choose **Sieve Workspace** in the view switcher.
4. After editing extension files, click the reload arrow on the Sieve card and refresh the GitHub tab.

Debugging:

- **Content scripts:** DevTools console on the GitHub tab; filter by `[Sieve Workspace]`.
- **Service worker:** `chrome://extensions` → Sieve → the **service worker** link.
- **Popup:** right-click the toolbar icon → **Inspect popup**.

### Extension UI without installing it

`extension/dev/harness.py` serves the real extension scripts on a GitHub-shaped URL with a small `chrome.*` stub that forwards messages to the engine:

```bash
python3 extension/dev/harness.py
# http://localhost:8790/ThatKJ/sieve-demo-target/pulls
# http://localhost:8790/ThatKJ/sieve-demo-target/pulls?engine=http://127.0.0.1:9   (engine offline)
```

It exercises the content script, activation sequence, command center and PR workspace against live engine data. It does **not** cover the popup, the service worker's own logic, or real GitHub page layouts.

### Offline demos

Warm the cache while online, then serve from it:

```bash
for n in 3 4 5; do python3 -m sieve ThatKJ/sieve-demo-target#$n > /dev/null; done
SIEVE_OFFLINE=1 python3 -m sieve --serve
```

## Testing

```bash
python3 -m compileall -q sieve tests              # syntax of every module
python3 -m unittest discover -s tests             # full suite
python3 -m unittest tests.test_atlas -v           # one module
for f in extension/*.js extension/ui/*.js extension/popup/*.js web/*.js; do node --check "$f"; done
python3 -m json.tool extension/manifest.json > /dev/null
```

The same checks run in CI (`.github/workflows/ci.yml`) on Python 3.10, 3.12 and 3.13. Tests use synthetic data and mocked HTTP, so they need no network, GitHub token or Gemma key.

| Suite | Covers |
|---|---|
| `test_core.py` | Claim checks, import resolution, scoring, ledger, model-output validation |
| `test_atlas.py` | Import graph, impact propagation, regression radar, verification plan |
| `test_engine_capabilities.py` | Impact-graph imports, commit-history hotspot radar, API integration, server origin policy |
| `test_gemma.py`, `test_server_gemma.py` | PNG validation, structured evidence, grounding, multimodal requests and chat (mocked) |
| `test_extension_manifest.py` | Manifest V3 validity, referenced files, reserved names, permission surface |

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `GitHub rate limit hit` | No token: set `GITHUB_TOKEN` or run `gh auth login` |
| `CERTIFICATE_VERIFY_FAILED` | Handled automatically on python.org macOS builds via `/etc/ssl/cert.pem`; otherwise run Python's `Install Certificates.command` |
| Relevance check skipped | Ollama not running, or the model isn't pulled (`ollama pull qwen3.5:9b`) |
| Gemma error about the key | `GEMMA_API_KEY` missing from `.env`; restart the engine after editing |
| Extension shows the engine offline | Engine not running on 127.0.0.1:8787 |
| "Manifest file is missing or unreadable" | You selected the repository root instead of `extension/` |
