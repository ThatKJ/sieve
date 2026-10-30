# Demo script (3:00 live + 2:00 Q&A)

## Before going on stage (5 minutes before)

```bash
cd sieve
ollama list | grep qwen3.5:9b                 # model present
python3 -m unittest discover -s tests         # 29 tests OK
# warm the cache while Wi-Fi works (each call is cached on disk)
for n in 3 4 5; do python3 -m sieve ThatKJ/sieve-demo-target#$n > /dev/null; done
python3 -m sieve --queue ThatKJ/sieve-demo-target
python3 -m sieve --serve                      # http://127.0.0.1:8787
```

- Open http://127.0.0.1:8787 once, and once with `?pr=ThatKJ%2Fsieve-demo-target%234`, so Ollama has the model loaded (the first model call takes longer).
- Browser zoom 110%, window about 1440 wide, close other tabs.
- **If Wi-Fi is down:** stop the server, restart with `SIEVE_OFFLINE=1 python3 -m sieve --serve`. Everything in this script then runs from the cache, and the model is local anyway. The toolbar shows a "cached" pill; say so honestly if asked.

## The script

**0:00–0:20 · The problem** (home page visible)
> "Maintainers now spend their evenings reading pull requests that look polished and do nothing, or break something two files away. A Linux Foundation survey this month: maintainers estimate a quarter of incoming PRs are slop. curl shut its bug bounty over it. The tools today either close the door on everyone, or score PRs on metadata without reading the code."

**0:20–0:35 · What Sieve is**
> "Sieve reads the repository itself. This is the Repository Atlas of a real Python library, parsed live: every dot is a file, every arc is an import statement, and height is how many files depend on it. `money.py` is the tallest, so everything leans on it."

Drag to orbit once. Click `money.py`: the inspector shows the exact import lines.

**0:35–1:25 · The polished PR** (click "Polished description, doesn't check out", #4)
> "Here's a PR that says it adds comprehensive tests and fixes issue #2. Watch the atlas: the change lights up, then everything that imports it."

Point at, in order:
1. Score **25 → 0** once the model finishes; "Low-effort signals".
2. **Regression radar:** "`category_totals` was renamed, but `report.py` line 3 still imports it. This PR breaks the report, and nothing in its description says so." Click **Show in atlas** on the Fix step: the camera flies to `report.py`, and the inspector shows the import line.
3. **Doesn't check out:** "Claims tests, ships none. Imports `ledgerly.validators`, which doesn't exist anywhere. Names two files that don't exist."
4. **Model opinion** (dashed tag): "A local open-weight model, qwen 9B on this laptop, read issue #2 and the diff and says the crash isn't actually handled. That's labelled as opinion, because it is."

**1:25–1:50 · The result**
> "What the maintainer gets: a verification plan with the exact pytest command for the two affected test files, a reviewer brief to hand off, and a polite checklist for the contributor. Nothing is posted; Sieve is read-only."

Scroll to the **Confidence ledger**: "Every finding says how we know it: repository, GitHub data or model. And what we didn't verify: we never run contributor code."

**1:50–2:15 · The good PR** (paste or click `ThatKJ/sieve-demo-target#3`)
> "A real fix: 100, ready. It touches `money.py`, so the atlas shows the blast radius across the codebase, and the plan starts with the test the PR adds, then the existing tests that exercise money.py. Good newcomers aren't punished; the work is judged, not the username."

**2:15–2:40 · Real-world** (type `pallets/click`, press Enter)
> "This is a real project: Click, 91 files, 168 import edges, parsed in seconds, with its open PRs ranked. One flagged PR claims tests and has none."

**2:40–3:00 · Why it matters**
> "Free, open source, standard-library Python, open-weight model, no per-PR cost, nothing leaves your machine. For maintainers drowning in PRs, Sieve answers: what does this really change, and does it do what it says?"

## Expected outputs (verified 31 Oct, 01:40 IST)

| Input | Score | Key findings |
|---|---|---|
| `ThatKJ/sieve-demo-target#3` | 100 Ready | Resolves #1; test file included; model: addresses; impact 2 changed, 9 direct, 3 tests |
| `ThatKJ/sieve-demo-target#4` | 25 → 0 Low-effort | Claims tests (none); `ledgerly.validators` doesn't exist; 2 phantom files; radar: `category_totals` still imported at `report.py:3`; model: unrelated |
| `ThatKJ/sieve-demo-target#5` | 43 Low-effort | Empty description; no linked issue; cosmetic docs edit |
| `pallets/click` (repo) | n/a | 91 parsed files, 168 edges; queue of open PRs (live data, so it changes over time) |

Model wording varies between runs; deterministic findings and counts don't.

## Fallbacks

| Failure | Do this |
|---|---|
| Ollama slow or down | Keep talking through the deterministic findings (they render in about 2 s). The model card says "skipped" instead of failing |
| GitHub rate limit / no Wi-Fi | `SIEVE_OFFLINE=1` restart (cache warmed above). Skip `pallets/click` unless it was opened once before the demo |
| Browser trouble | CLI: `python3 -m sieve ThatKJ/sieve-demo-target#4` prints the same findings and the draft reply |

## Likely judge questions

- **"Isn't this just CodeRabbit / Copilot review?"** Those review code quality with hosted models and bill per review. Sieve checks whether the PR's *claims* hold against the repository, maps impact through the import graph, labels the source of every finding, runs on an open-weight model locally, and is free and read-only. CodeRabbit also has a blast-radius view, so we don't claim the graph is new; the combination and the evidence labelling are the point.
- **"How do you avoid punishing genuine first-timers?"** Author signals are informational and capped; nothing auto-closes; every failure links to evidence, and the contributor gets a specific checklist instead of a rejection.
- **"What if the model is wrong?"** It makes one bounded judgment, constrained to a schema, validated, labelled as opinion, worth at most 30 points. The radar, import checks and claim checks are deterministic.
- **"Does it run the tests?"** No, deliberately: running stranger code needs a sandbox. The plan gives the exact command; the ledger says tests weren't executed.
- **"Who pays?"** Companies running open-source projects as products (open-core startups, dev-tool vendors) whose engineers review community PRs. Hypothesis: free self-hosted, about $20 per repo per month hosted. See `research/final-product-decision.md`. This hasn't been validated with customers yet.
- **"What languages?"** Python and JS/TS import graphs today; every other check is language-agnostic.
- **"Why build the demo repo yourselves?"** So we never label a real stranger's PR as low-effort on stage. Click shows it works on real code.
