# Roadmap

Status as of the `fix/github-native-integration` branch. "Done" means implemented, committed and covered by tests or a recorded manual check; it does not mean released, as there are no tagged releases yet.

## Done

- **PR claim verification:** linked issue, claimed tests, referenced files, unresolved imports, PR template and checklist, file placement.
- **Repository Atlas:** Python (`ast`) and JS/TS import graph from a repository snapshot; PR impact; regression radar; verification plan.
- **Evidence labelling:** every finding tagged repository / GitHub data / model; confidence ledger lists what was not verified.
- **Review queue:** open PRs ranked and classified, with cross-PR and commit-history signals.
- **Local relevance check:** bounded, schema-validated Ollama call; optional.
- **Gemma 4 visual intelligence:** graph PNG plus structured evidence in one `gemma-4-26b-a4b-it` request; citations grounded against evidence; PR-bound chat keyed by head commit.
- **Chrome extension (Manifest V3):** command center on `/pulls`, Native/Sieve view switcher, centered PR intelligence workspace, activation sequence driven by real initialization state, popup with connection status.
- **Web app** served by the engine.
- **Contributor tooling:** CI workflow, issue forms, PR template, security policy, code of conduct.

## In progress

- Three-tier evidence classification for Gemma output (`direct_pr_evidence`, `repo_symbol`, `unverified_hypothesis`), with session keys including the PR number. Implemented in the working tree, not yet committed.

## Next

1. **Security hardening:** validate the `Host` header against DNS rebinding; send the Gemma key in the `x-goog-api-key` header and redact upstream error text; restrict `chrome-extension://` origins to Sieve's own extension ID.
2. **Release hygiene:** first tagged release with a changelog; enable GitHub private vulnerability reporting.
3. **Extension verification in real Chrome:** a documented manual test pass covering the popup, service worker, PR-page button and real GitHub layouts.

## Later

- Import graphs for Go, Rust and Java; TypeScript path aliases.
- Co-change analysis from commit history ("these files usually change together").
- Before/after Atlas replay from the PR head snapshot.
- Optional GitHub Action that posts the review brief as a check summary, opt-in and maintainer-controlled.

## Not planned

- Automatic comments, approvals, merges or closures.
- Executing contributor code outside a sandbox.
