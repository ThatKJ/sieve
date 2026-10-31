# Contributing to Sieve

Thanks for helping make maintainers' lives easier. This guide covers setup, how the code is organised, and what a good pull request looks like. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

1. **Read-only on GitHub.** Sieve must never comment, approve, merge, close or otherwise write to GitHub on its own. A future write action needs an issue, discussion and explicit user confirmation in the UI.
2. **Never execute contributor code.** Analysis is static: Python via `ast`, JS/TS via import statements. No `exec`, no `import` of analysed code, no extracting tarballs to disk.
3. **Standard library only for the engine**, and no front-end build step, frameworks or CDNs. If a dependency is genuinely worth it, open an issue first explaining why.
4. **Label evidence honestly.** Every finding sets its `source` (`repository`, `github` or `model`). Anything inferred says so in its text. Model output is never presented as verified fact.
5. **Untrusted text stays text.** In `web/` and `extension/`, build DOM with `textContent` (the `el()` helpers); never assign API or PR data to `innerHTML`.
6. **Secrets stay out of Git and out of the extension.** Keys live in the environment or a git-ignored `.env`. The extension never receives them.

## Development setup

Requirements: Python 3.10+ and Git. Optional: [Ollama](https://ollama.com) with `qwen3.5:9b` for the local relevance check, a GitHub token for higher rate limits, a Gemma API key for visual intelligence, Node.js for JavaScript syntax checks, and Chrome for the extension.

```bash
git clone https://github.com/ThatKJ/sieve && cd sieve
cp .env.example .env          # optional: add GITHUB_TOKEN / GEMMA_API_KEY; never commit .env
python3 -m unittest discover -s tests
python3 -m sieve --serve      # http://127.0.0.1:8787
```

There is nothing to `pip install`. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the debugging workflow, offline mode and the extension dev harness.

## Where things live

| Path | Responsibility |
|---|---|
| `sieve/github.py` | Read-only GitHub REST client and on-disk cache |
| `sieve/core.py` | PR claim checks, scoring, confidence ledger, review queue, cross-PR signals |
| `sieve/atlas.py` | Import graph from a repository snapshot, PR impact, regression radar, verification plan |
| `sieve/llm.py` | Bounded local-model (Ollama) judgment with schema validation |
| `sieve/gemma.py` | Gemma 4 multimodal analysis (graph PNG + structured evidence) and PR-bound chat |
| `sieve/server.py` | Localhost HTTP server, origin checks, JSON API |
| `extension/` | Chrome Manifest V3 extension (content scripts in Shadow DOM, popup, service worker) |
| `web/` | Standalone web app served by the engine |
| `tests/` | `unittest` suites; synthetic data and mocked HTTP only |

The full picture is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Making a change

1. **Open or find an issue** for anything beyond a small fix, so the approach can be agreed first.
2. **Branch from `main`** with a descriptive name: `fix/queue-pagination`, `feat/go-imports`, `docs/setup-windows`.
3. **Write a test** for every new or changed check. Tests must not touch the network or need credentials.
4. **Run the checks** CI runs:
   ```bash
   python3 -m compileall -q sieve tests
   python3 -m unittest discover -s tests
   for f in extension/*.js extension/ui/*.js extension/popup/*.js web/*.js; do node --check "$f"; done
   ```
5. **Commit with [Conventional Commits](https://www.conventionalcommits.org/)**, matching the existing history: `feat(atlas): resolve TypeScript path aliases`, `fix(extension): …`, `docs: …`, `test: …`, `ci: …`. Keep commits small and focused.
6. **Open a pull request** using the template: link the issue (`Fixes #123`), say how you tested it, and include screenshots for UI changes.

## Reporting bugs and proposing features

Use the issue forms. Bug reports need the component, steps to reproduce, and the commit you ran (`git rev-parse --short HEAD`). Feature requests should start from a real maintainer problem and say where the feature's evidence would come from.

## Security-sensitive changes

Changes to `sieve/server.py` (origin and host checks, request limits), `sieve/github.py` (tokens), `sieve/gemma.py` (API keys, image validation, prompts) or `extension/manifest.json` (permissions) get extra review. Do not widen extension permissions or relax origin checks to make something work; explain the need in the PR instead. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), never in a public issue.
