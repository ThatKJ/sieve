# Contributing to Sieve

Thanks for helping. A few ground rules keep Sieve trustworthy:

1. **Read-only, always.** Sieve must never write to GitHub or execute contributor code. PRs that add either need an issue and discussion first.
2. **Standard library only** for the backend, and no front-end dependencies or CDNs. If you think a dependency is worth it, open an issue explaining why.
3. **Every check needs a test.** Add it to `tests/test_core.py` or `tests/test_atlas.py`, using synthetic data and no network.
4. **Label evidence honestly.** A new finding must set its source (`repository`, `github` or `model`) correctly, and anything inferred must say so in its text.
5. **Untrusted text stays text.** In `web/`, build DOM with `el()`/`textContent`; never `innerHTML` with API data.

## Development

```bash
python3 -m unittest discover -s tests     # fast, offline
python3 -m sieve --serve                  # http://127.0.0.1:8787
SIEVE_OFFLINE=1 python3 -m sieve --serve  # replay from cache, no network
```

Link the issue your PR fixes (`Fixes #123`) and describe how you tested it. Yes, Sieve will check.
