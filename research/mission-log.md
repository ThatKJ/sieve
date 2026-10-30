# Mission log

All times IST, 31 Oct 2026. Hacking began 30 Oct 22:00; code freeze 31 Oct 10:00.

| Time | Milestone | Status |
|---|---|---|
| 00:18 | Read official deck (27 slides); inspected workspace: empty repo, Python 3.14, Node 26, Ollama with qwen3.5:9b, gh authenticated, no API keys | Done |
| 00:20 | Launched 3 research agents (open data/PS-10, OSS maintainer pain, dev productivity). Asked the team about rule 06 ("Round 1 problem statement") | Done |
| 00:22 | Team confirmed organisers allow switching themes | Done |
| 00:35 | Research complete. Reddit was blocked for the research tools, so evidence is GitHub, press, LF survey and vendor pages (see customer-pain.md). Scored 5 finalists; winner: evidence-based PR intake checks (7.75/10) | Done |
| 00:40 | Public repo ThatKJ/sieve created with MIT licence (team approved) | Done |
| 00:45–01:00 | Engine: GitHub client, deterministic claim checks, local model judgment, CLI, JSON API. Verified on real PRs (TheAlgorithms/Python) | Done |
| 01:00 | Team built an intermediate UI with another AI tool from docs/ui-master-prompt.md (commit 794aae9) | Done (team) |
| 01:06 | New brief: repository intelligence workbench, Repository Atlas, Apple Design Skill. Installed dickwu/apple-design-skill via documented git clone; read SKILL.md, the lookup index, liquid-glass.md and best-practice rules of the always-load pages | Done |
| 01:10 | Stage 1 design audit: the UI read as the "warm cream + serif + feature cards" template; it claimed "AST imports" and "zero hallucinated findings", which weren't true | Done |
| 01:12 | Competitive check: blast-radius graphs already exist (CodeRabbit Security Blast Radius, focus, PR Autopilot). Decided not to claim novelty for the graph; differentiate on claim verification + evidence labelling + local/free/read-only | Done |
| 01:15 | atlas.py: tarball → ast/regex import graph, impact, regression radar, verification plan, confidence ledger. Verified on pallets/click (91 files, 168 edges) and TheAlgorithms/Python (truncated at 1,200) | Done |
| 01:17 | Demo repo ThatKJ/sieve-demo-target: ledgerly library, 2 real-bug issues, 3 PRs (good / sloppy / drive-by). Results 100 / 0 / 43 as intended | Done |
| 01:20–01:30 | Front end rebuilt: Atlas canvas renderer (2.5D, height = fan-in, impact ripple), review workspace, repo view; glass only on functional layer | Done |
| 01:30 | 28 tests added; one caught a real bug (whitespace-only detection), fixed | Done |
| 01:31–01:33 | Browser verification at 1440 and 390 px; fixed null rendering, legend overlap, focus offset, label collisions, mobile controls | Done |
| 01:35–01:45 | Docs: README, ARCHITECTURE, SECURITY, known-limitations, demo-script, CONTRIBUTING. Offline mode verified for the full demo. Plan now runs the PR's own tests first (test 29) | Done |

## What is verified (run, not assumed)
- 29 unit tests pass (`python3 -m unittest discover -s tests`).
- Full PR analysis with the local model on demo PRs #3, #4, #5 and real PRs (TheAlgorithms/Python#15669).
- Atlas + impact on the demo repo, pallets/click and TheAlgorithms/Python.
- Web UI: home, PR review, repo view, inspector, "Show in atlas", no console errors, no horizontal overflow at 390 px.
- Offline replay (`SIEVE_OFFLINE=1`) of every demo step.

## Not done / partial
- No GitHub Action or GitHub App: local web app and CLI only.
- No co-change history from git log; no before/after Atlas replay.
- Import graph covers Python and JS/TS only.
- Willingness to pay is a hypothesis; no customer interviews.
- README credits "opencode / Gemini" for the intermediate UI; the team should confirm which tool generated commit 794aae9.

## Risks
- Ollama latency on the demo machine (mitigated: deterministic results render first).
- Venue Wi-Fi (mitigated: offline cache).
- Model wording varies between runs (scores from deterministic checks don't).
