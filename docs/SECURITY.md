# Security model

Sieve reads untrusted input: pull request titles, bodies, diffs, issue text and whole repository snapshots written by strangers. The design assumes all of it is hostile.

| Risk | Mitigation |
|---|---|
| Writing to other people's repositories | The GitHub client only issues GET requests. There is no code path that comments, labels, closes or approves. The contributor reply is a draft for a human to send |
| Executing contributor code | Never. Python is parsed with `ast.parse` (no import, no exec); JS/TS with regular expressions. Tarballs are read in memory with `tarfile` and never extracted to disk |
| XSS from PR content | The front end builds the DOM with `textContent`; no API string reaches `innerHTML`. Links render only for `https://github.com/` URLs |
| Prompt injection through PR text | The model answers one bounded question under a JSON schema; its output is validated and labelled "model opinion". It can't trigger actions, because there are none |
| Oversized repositories | Tarball cap 80 MB, per-file parse cap 300 KB, graph cap 1,200 files |
| Token leakage | The token comes from the environment or `gh auth token`, is only sent to api.github.com, and is never logged, cached or returned by the API. `.env` and `.cache/` are gitignored |
| Gemma 4 requests | Engine-side only; PNG signature, IHDR and size validated (4 MB raw / 5 MB base64); strict base64; model output grounded and labelled, never acted on |
| Chat context leaking across PRs | Sessions keyed by repository and head commit, history capped at 6 turns |
| Network exposure | The server binds to 127.0.0.1 by default. It has no authentication, so don't expose it publicly |

Reporting process and known gaps: see the root [SECURITY.md](../SECURITY.md).
