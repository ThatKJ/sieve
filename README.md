# Sieve

**See what a pull request really changes, and whether it does what it claims.**

Sieve is an open-source, read-only review workbench for maintainers. It maps a repository's import graph (the **Repository Atlas**), overlays a pull request's reach on it, and verifies what the PR *claims* against what it *contains*: the linked issue, the tests it says it adds, the files and modules it references, and your CONTRIBUTING rules. A local open-weight model (qwen3.5:9b via Ollama) answers the one question rules can't: does this diff actually do what the issue asks? Every finding is labelled with where its evidence came from.

Built at the DevF8rge × Hacktoberfest 2026 Hack Day, Bengaluru (theme: AI for Open Source).

---

## The problem

Maintainers receive a growing share of low-effort and AI-generated pull requests. Maintainers in a [Linux Foundation survey (Oct 2026)](https://www.linuxfoundation.org/press/new-lf-research-survey-shows-generative-ai-cuts-open-source-coding-time-in-half-but-25-of-incoming-pull-requests-are-considered-ai-slop) estimate about 25% of incoming PRs are "slop"; curl ended its bug bounty; tldraw stopped accepting outside PRs. Today's defences either close the door on everyone, or auto-close on metadata rules that never read the change. Each PR still costs a full read before a maintainer can tell whether it's real, and whether it breaks something elsewhere. Sources and caveats: [`research/customer-pain.md`](research/customer-pain.md).

## What Sieve does

| Capability | What it actually checks | Evidence source |
|---|---|---|
| **Claim verification** | Linked issue exists and is open; claimed tests are in the diff; files named in the description exist; new imports resolve to real repo modules; PR template sections present; new files placed where similar code lives | GitHub API + repository tree |
| **Repository Atlas** | File-level import graph parsed from a snapshot of the repo (Python via `ast`, JS/TS via import statements). Clustered by directory; height = number of files importing a file | Repository files |
| **PR impact** | Changed files → files that import them (direct) → files importing those (indirect), plus related tests. Every highlighted file shows the import line that connects it | Import graph |
| **Regression radar** | A symbol removed from a module that is still imported elsewhere; deleted files still imported; deleted tests; config, CI and migration changes; edits to shared modules | Diff + import graph |
| **Verification plan** | Concrete next steps: which broken reference to fix, the exact `pytest` command for related tests, which callers to inspect, where a regression test is missing | Derived from the above |
| **Relevance judgment** | Does the diff implement the linked issue? Does it conflict with CONTRIBUTING.md? | Local model, labelled "model opinion" |
| **Confidence ledger** | Findings grouped by source (repository / GitHub data / model), plus an explicit list of what was *not* verified | All of the above |
| **Reviewer brief + contributor reply** | Copyable hand-off summary and a polite fix-it checklist. Never posted automatically | All of the above |
| **Review queue** | Ranks a repository's open PRs with the fast deterministic checks | GitHub API |

Sieve **never writes to GitHub** (every request is a GET) and **never executes contributor code**.

## Quick start

Requirements: Python 3.10+ (standard library only, no `pip install`), and optionally [Ollama](https://ollama.com) for the relevance judgment.

```bash
git clone https://github.com/ThatKJ/sieve && cd sieve

# optional but recommended: the local model
ollama pull qwen3.5:9b

# A GitHub token raises the API rate limit from 60 to 5,000 requests/hour.
# If the gh CLI is logged in, Sieve uses `gh auth token` automatically.
export GITHUB_TOKEN=...   # optional

python3 -m sieve --serve          # http://127.0.0.1:8787
```

Open http://127.0.0.1:8787. The home page loads the Atlas of the demo repository; pick one of its three pull requests.

### Command line

```bash
python3 -m sieve ThatKJ/sieve-demo-target#4              # full check, prints findings + draft reply
python3 -m sieve https://github.com/owner/repo/pull/123 --no-model
python3 -m sieve --queue pallets/click                   # rank open PRs
python3 -m sieve ThatKJ/sieve-demo-target#4 --json       # machine-readable
```

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | `gh auth token` if available | GitHub API authentication (read-only use) |
| `SIEVE_MODEL` | `qwen3.5:9b` | Any Ollama model that supports JSON output |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `SIEVE_OFFLINE` | unset | `1` = serve only from the on-disk cache (no network) |
| `SIEVE_CACHE` | `.cache/github` | Cache directory |
| `SIEVE_CACHE_TTL` | `900` | Seconds before cached API responses are refetched |
| `SIEVE_HOST` | `127.0.0.1` | Bind address for the web server |

## The demo repository

[`ThatKJ/sieve-demo-target`](https://github.com/ThatKJ/sieve-demo-target) is a tiny Python library written for this demo, with two real bugs filed as issues and three pull requests written on purpose:

| PR | What it is | Sieve's result |
|---|---|---|
| [#3](https://github.com/ThatKJ/sieve-demo-target/pull/3) | Focused fix for issue #1 with a regression test | 100, Ready for review; related tests listed |
| [#4](https://github.com/ThatKJ/sieve-demo-target/pull/4) | Polished description claiming tests and a fix for #2 | 0, Low-effort signals: no test files, imports a module that doesn't exist, names two missing files, model says it doesn't fix #2, and the Atlas finds `category_totals` renamed while `report.py:3` still imports it |
| [#5](https://github.com/ThatKJ/sieve-demo-target/pull/5) | One-word README edit, empty description | 43, Low-effort signals |

These scores come from the current code. The model's wording varies between runs; the deterministic findings don't.

## How it works

```
browser (web/)  ──GET /api/*──▶  sieve/server.py  (stdlib http.server, localhost only)
                                   ├─ core.py   claim checks, scoring, ledger, contributor reply
                                   ├─ atlas.py  tarball → ast/regex import graph → impact, radar, plan
                                   ├─ llm.py    one bounded, schema-validated Ollama call
                                   └─ github.py read-only REST client + on-disk cache
```

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Security model: [`docs/SECURITY.md`](docs/SECURITY.md). Limitations: [`docs/known-limitations.md`](docs/known-limitations.md). Demo walkthrough: [`docs/demo-script.md`](docs/demo-script.md).

## Tests

```bash
python3 -m unittest discover -s tests
```

29 tests cover the claim checks, import resolution (Python, `src/` layouts, JS/TS), impact propagation, the regression radar and model-output validation. They use synthetic data and no network.

## Roadmap

- GitHub Action wrapper that runs Sieve against a self-hosted model and posts the brief as a check summary (opt-in, maintainer-controlled).
- Go, Rust and Java import parsing.
- Co-change history from `git log` ("these files usually change together").
- Before/after Atlas replay using the PR head snapshot.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: no dependencies outside the standard library without discussion, add a test for any new check, and keep Sieve read-only.

## AI tools used

This project was built with AI assistance, as the event rules require us to disclose:

- **Claude Code** (Anthropic, model Claude Opus 5.5): research, backend, Atlas renderer, front end, tests and documentation.
- **opencode / Gemini**: generated an intermediate front-end iteration (commit `794aae9`) from [`docs/ui-master-prompt.md`](docs/ui-master-prompt.md); it was later replaced.
- **qwen3.5:9b via Ollama**: the open-weight model Sieve uses at runtime.

Every team member can explain the code.

## Credits

- [Ollama](https://ollama.com) and the Qwen model family (see the model card for its licence).
- Design guidance from [dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill) (Apple Human Interface Guidelines references); no code from it is included.
- MIT licence text from the [SPDX licence list](https://github.com/spdx/license-list-data).

## Licence

[MIT](LICENSE)
