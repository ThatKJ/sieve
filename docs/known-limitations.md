# Known limitations

Stated plainly so nobody has to discover them in a demo.

**Analysis**
- Import graphs cover Python and JS/TS only. Go, Rust, Java and other files appear in the fingerprint but not as nodes.
- The graph is file-level. It doesn't resolve calls, dynamic imports built from strings, `importlib`, path aliases (`@/…` in tsconfig), or re-exports through `__init__.py` beyond the import statement itself.
- "Removed symbol still in use" only detects top-level `def`/`class`/`export` lines removed in the diff and imported *by name* elsewhere. `import module` followed by `module.func()` isn't traced.
- Impact is computed against the base branch. Files added by the PR are shown, but their own imports aren't added to the graph.
- Test discovery relies on paths (`tests/`, `test_*.py`, `*.test.ts`…) and import edges; tests matched only by name are labelled as inferred.
- Tests are never executed. The verification plan recommends commands; it doesn't run them.
- Scoring weights are hand-set heuristics, not trained or validated on a labelled dataset.

**Model**
- qwen3.5:9b can be wrong. Its verdict and CONTRIBUTING reading are labelled "model opinion" and it carries at most 30 of 100 penalty points. Its confidence is its own estimate, not a calibrated probability.
- The model sees at most 6,000 characters of diff, so on large PRs its judgment rests on a truncated view.
- Runs take about 5–15 s on an Apple M5 with 16 GB; slower machines will wait longer.

**Product**
- Runs locally (engine, web app and Chrome extension): no accounts, no GitHub App, no scheduled scanning.
- Without a token, GitHub allows 60 requests/hour; one full PR review uses about 8–12.
- Very large repositories (tarball over 80 MB) are refused rather than partially mapped.
- Evidence of market demand comes from public discussions and press, not from customer interviews. See `research/`.

**Gemma 4 visual intelligence**
- Requires a Gemini API key (`GEMMA_API_KEY` or `GEMINI_API_KEY`) and network access; without it the feature reports an error and everything else keeps working.
- Grounding checks citations against the evidence Sieve sent; it cannot prove the model's architectural reasoning is right. Unmatched claims are shown as hypotheses.
- The graph image is rendered by the extension, so visual analysis is only available from the extension workspace.

**Security**
- The engine validates `Origin` but not `Host`, and allows any `chrome-extension://` origin. See [SECURITY.md](../SECURITY.md#known-gaps).

