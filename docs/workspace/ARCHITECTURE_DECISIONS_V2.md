# Sieve Workspace V2 — Architecture Decision Records (ADRs)

**Date:** October 31, 2026  
**Status:** Approved Architecture Decisions V2  
**Context:** Supersedes naive Milestone 1 assumptions and documents critical hardening choices.

---

## Index of V2 Architecture Decisions

- [ADR-007: Elimination of Wildcard CORS in Local Daemon (Supersedes V1)](#adr-007-elimination-of-wildcard-cors-in-local-daemon)
- [ADR-008: Host Header Validation for DNS Rebinding Defense](#adr-008-host-header-validation-for-dns-rebinding-defense)
- [ADR-009: Turn-Taking State Model over Arbitrary Aggregate Risk Scores](#adr-009-turn-taking-state-model-over-arbitrary-aggregate-risk-scores)
- [ADR-010: Cross-PR Collision & Duplicate Intent Indexing](#adr-010-cross-pr-collision-and-duplicate-intent-indexing)
- [ADR-011: Local SQLite Cache & Rate-Limit Governor](#adr-011-local-sqlite-cache-and-rate-limit-governor)
- [ADR-012: Hydration-Resilient DOM Mounting Lifecycle](#adr-012-hydration-resilient-dom-mounting-lifecycle)

---

### ADR-007: Elimination of Wildcard CORS in Local Daemon
- **Status:** **Accepted & Implemented** (Supersedes V1 ADR-005)
- **Context:** In Milestone 1, `sieve/server.py` added `Access-Control-Allow-Origin: *` to simplify browser extension fetch requests. This created a critical vulnerability: any website visited by the maintainer in any browser tab could query `http://127.0.0.1:8787`, read private repository pull request diffs, exfiltrate local GitHub tokens, or trigger denial-of-service LLM invocations.
- **Decision:**
  - Completely eliminate wildcard `*`.
  - Implement strict Origin verification in `_is_allowed_origin()`. Only `chrome-extension://<EXTENSION_ID>` and `http://127.0.0.1:8787` / `http://localhost:8787` origins are authorized.
  - Return `403 Forbidden` for any unauthorized web origin (e.g. `http://evil.com`).
  - Dynamically echo the authorized origin in `Access-Control-Allow-Origin` and append `Vary: Origin`.
- **Consequences:** Malicious websites can no longer probe or exfiltrate data from the local Sieve engine.

---

### ADR-008: Host Header Validation for DNS Rebinding Defense
- **Status:** **Accepted & Implemented**
- **Context:** DNS rebinding attacks allow external websites to trick browsers into treating `127.0.0.1` as same-origin by setting up an external domain whose DNS resolves to `127.0.0.1`.
- **Decision:** The local HTTP server inspects the HTTP `Host` header. It rejects any request whose `Host` header does not match `127.0.0.1`, `localhost`, or the explicitly configured `SIEVE_HOST` IP address.
- **Consequences:** DNS rebinding attacks cannot bypass origin checks.

---

### ADR-009: Turn-Taking State Model over Arbitrary Aggregate Risk Scores
- **Status:** **Accepted**
- **Context:** Milestone 1 categorized PRs using aggregate scores (0–100) and naive thresholds (score < 70 = "Needs Attention"). Maintainers reported that an abstract score does not help them decide what to do next. A 100-score PR could be a trivial typo fix, while a 65-score PR might be a critical security patch waiting on the maintainer.
- **Decision:** Sieve Workspace V2 shifts the primary inbox taxonomy to an operational **Turn-Taking State Model**:
  - `Action Needed: You`: Requested for review, or new commits pushed after previous review.
  - `Waiting on Contributor`: Maintainer submitted "Changes Requested" and no new commits exist.
  - `Review Blocked`: Merge conflict or failing CI.
  - `Merge Candidate`: Approved + CI passing.
- **Consequences:** Maintainers can instantly clear PRs waiting on them without opening every card.

---

### ADR-010: Cross-PR Collision and Duplicate Intent Indexing
- **Status:** **Accepted**
- **Context:** Competing tools (CodeRabbit, Copilot, Greptile) evaluate each pull request in isolation. In open source, multiple contributors frequently submit competing PRs for the same issue or modify the same files simultaneously, causing wasted review labor and merge conflicts.
- **Decision:** The Sieve queue engine builds an in-memory cross-PR index on every scan. It flags:
  1. **Duplicate Intent:** Multiple PRs referencing the same issue.
  2. **File Collisions:** Multiple open PRs touching the same source files.
- **Consequences:** Establishes a major competitive moat that single-PR review bots cannot match.

---

### ADR-011: Local SQLite Cache and Rate-Limit Governor
- **Status:** **Accepted**
- **Context:** In Milestone 1, per-file commit scraping for historical hotspots made up to 15 GitHub API calls per PR. Without a personal access token, GitHub's 60 req/hr rate limit was exhausted in under 5 PR analyses, causing silent failures.
- **Decision:** Introduce a lightweight SQLite database at `~/.sieve/workspace.db`. Cache repository snapshots, commit history, and AST blast radius graphs keyed by `commit_sha`. Implement a rate-limit governor that reads `x-ratelimit-remaining` and pauses background calls when quota drops below 10.
- **Consequences:** Eliminates rate limit crashes and enables instantaneous sub-5ms cached PR responses.

---

### ADR-012: Hydration-Resilient DOM Mounting Lifecycle
- **Status:** **Accepted & Implemented**
- **Context:** Modern GitHub uses client-side React hydration (`<react-app app-name="repo">`) on both `/pulls` and `/pull/:id`. Extension content scripts running at `document_end` frequently mounted before React finished hydrating; when React completed hydration, it replaced the DOM nodes and wiped out Sieve's injected buttons.
- **Decision:** Content scripts implement an active observation loop (`checkAndMount`, polling every 200–250ms for up to 30 attempts) and re-attach elements if React replaces them during hydration.
- **Consequences:** Sieve Workspace operates 100% reliably across modern GitHub React SPA transitions.

