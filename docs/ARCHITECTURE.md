# Architecture

Sieve is a Python standard-library backend and a dependency-free static front end. No build step, no database.

```
sieve/
  github.py   Read-only GitHub REST client. GET only. On-disk JSON cache (.cache/github, TTL 15 min),
              tarball cache keyed by commit SHA (immutable). Token from GITHUB_TOKEN or `gh auth token`.
  core.py     PR intake analysis: deterministic checks, scoring, confidence ledger, contributor reply.
  atlas.py    Repository Atlas: snapshot → import graph → PR impact, regression radar, verification plan.
  llm.py      One bounded call to a local Ollama model, constrained by a JSON schema, then validated.
  server.py   http.server on 127.0.0.1: static files from web/ plus a JSON API.
  __main__.py CLI (single PR, queue, JSON output, --serve).
web/
  index.html  Shell: glass toolbar, three views (home, review, repo).
  app.js      Routing, API calls, all views. DOM built with textContent only (PR data is untrusted).
  atlas.js    Canvas renderer for the Atlas: layout, projection, interaction. No libraries.
tests/        unittest suites for core.py and atlas.py (synthetic data, no network).
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/health` | Model name, whether Ollama and the model are available, offline mode, whether a GitHub token is present |
| `GET /api/analyze?pr=<ref>&model=0\|1` | PR summary, score, verdict, findings (each with `source`), model judgment, confidence ledger, contributor reply |
| `GET /api/atlas?pr=<ref>` or `?repo=<owner/repo>` | Graph (`nodes`, `edges`, `fingerprint`, `truncated`) and, for a PR, `impact` (`marks`, `counts`, `tests`, `risks`, `plan`) |
| `GET /api/queue?repo=<owner/repo>` | Up to 15 open PRs ranked by the fast deterministic pass |

Errors return `{"error": "…"}` with 400 (bad input), 404, 413 (repo too large), 429 (rate limit), 502/503 (GitHub unreachable) or 500.

## Request flow: reviewing a PR

The browser makes three requests in parallel so the page fills in progressively:

1. `GET /api/analyze?pr=…&model=0` returns in about 1–3 s: PR, files, linked issues and repo tree from GitHub, then every deterministic check.
2. `GET /api/atlas?pr=…` downloads the base-branch tarball once per SHA, parses it, and computes impact against the PR's files.
3. `GET /api/analyze?pr=…&model=1` reuses the cached GitHub data and adds the model's judgment (5–15 s on an M-series laptop).

## Deterministic checks (`core.py`)

| Check | Logic | Source label |
|---|---|---|
| description | Body (minus HTML comments) shorter than 20 chars | GitHub |
| linked_issue | `fixes/closes/resolves #N` or same-repo issue URL; issue fetched to confirm it exists, is an issue, and is open | GitHub |
| substance | Whitespace-only diff (all whitespace ignored); tiny docs-only edits | GitHub |
| tests | Description claims tests (regex) but no test-path files changed; or code without tests | GitHub |
| imports | Repo-local imports on added lines (Python absolute/relative, JS/TS relative) must resolve in base tree ∪ PR files | Repository |
| references | File paths named in the description must exist in the repo or the PR | Repository |
| template / checklist | PR template headings present; checklist not left unticked | Repository / GitHub |
| layout | New source file placed in a directory with no files of that type | Repository |
| author / competing | First-time contributor (informational only), account age, 7-day cross-GitHub PR volume, other open PRs on the same issue | GitHub |

Penalties sum from 100: ≥ 75 ready, 45–74 needs work, < 45 low-effort. Author signals are capped and never fail a PR on their own.

## Repository Atlas (`atlas.py`)

- **Snapshot:** `GET /repos/{o}/{r}/tarball/{sha}`, parsed in memory with `tarfile`. Vendored and build directories are skipped. Files over 300 KB aren't parsed.
- **Python:** `ast.parse` → `Import` / `ImportFrom` (with level and names) → resolved against repo files from the root and `src/`. Third-party imports resolve to nothing, so they create no edge. Top-level functions and classes are recorded as symbols. Files that fail to parse are listed, not guessed.
- **JS/TS:** relative `import … from`, `export … from`, `require()`, dynamic `import()`; resolved with the usual extensions and `index.*`.
- **Edges** keep the first import statement and line number as evidence: `{source, target, line, names, stmt}`.
- **Large repos:** above 1,200 source files the graph keeps the most-connected files and sets `truncated: true`, which the UI states.

### Impact

`impact(graph, pr_files)` walks reverse edges from the changed files:

- `added | modified | removed | renamed` comes from the PR file list.
- `direct`: imports a changed file (the reason quotes the import line).
- `indirect`: imports a direct dependent.
- `dependency`: imported by a changed file.
- `test-inferred`: a test named after a changed module with no import edge. Labelled as an inference.

### Regression radar

- `removed-symbol-in-use`: a top-level `def`/`class`/`export` removed in the diff whose name another file still imports by name (the evidence is that file and line).
- `deleted-but-imported`, `deleted-test`, `config` (manifests, lockfiles, CI workflows, Dockerfiles), `migration`, `shared-module` (fan-in ≥ 5).

The verification plan turns these into ordered steps (fix → run → add test → inspect). These are recommendations only; Sieve executes nothing.

## Model use (`llm.py`)

One prompt per PR with the stated intent (linked issue, or the PR text if none), the diff (≤ 6,000 chars, source before tests), and the rule-like lines of CONTRIBUTING.md (≤ 3,000 chars). Ollama's `format` parameter constrains output to a JSON schema; `validate()` then rejects unknown verdicts, clamps confidence to 0–1, and trims lists to three items. Malformed output is discarded and reported, never repaired by guessing. Temperature is 0.

## Front end

- `atlas.js` lays files out per directory (sunflower inside, clusters on a non-overlapping spiral), projects a tilted plane with perspective, and draws depth-sorted nodes. Height = fan-in. Interaction: orbit, pan, zoom, click to inspect, search, isolate, keyboard stepping. The impact "ripple" reveals changed → direct → indirect files in about 1.1 s and is skipped under `prefers-reduced-motion`.
- `app.js` never assigns API data to `innerHTML`; links are only rendered for `https://github.com/` URLs.
- Liquid Glass (backdrop blur) is limited to the functional layer: toolbar, Atlas controls and inspector. Content stays on solid surfaces, with opaque fallbacks for `prefers-reduced-transparency` and `prefers-contrast: more`.
