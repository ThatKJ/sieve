# Sieve Workspace — Architectural Decision Records (ADRs)

## ADR 001: Chrome Manifest V3 Architecture
- **Status:** Accepted
- **Context:** Chrome requires Manifest V3 for all modern extension submissions. MV3 replaces background pages with short-lived Service Workers and restricts remote code execution.
- **Decision:** Build Sieve Workspace strictly on Manifest V3. Use `background.js` as an ES module service worker for proxying network requests and managing extension storage.
- **Consequences:** All extension code is bundled locally; network requests are handled asynchronously through standard message passing.

---

## ADR 002: Shadow DOM Encapsulation for UI Isolation
- **Status:** Accepted
- **Context:** GitHub's native stylesheet (Primer CSS) applies aggressive global CSS rules across standard HTML tags (`h1`, `table`, `input`, `button`). Injected CSS frequently collides with native GitHub styles.
- **Decision:** All Sieve Workspace interfaces injected into GitHub pages are hosted inside an open `ShadowRoot` (`#sieve-workspace-host`).
- **Consequences:**
  - Sieve's Liquid Glass styles are 100% isolated and cannot be overridden by GitHub updates.
  - Sieve CSS will never alter GitHub's native typography or layout.

---

## ADR 003: In-Situ Browser Extension over Standalone Web SaaS
- **Status:** Accepted
- **Context:** Competitors like Graphite and Greptile require maintainers to leave GitHub and use external dashboards. Maintainers consistently express frustration with tool-switching friction.
- **Decision:** Position the browser extension as the primary product surface operating directly on `github.com`.
- **Consequences:** Zero adoption barrier for maintainers. GitHub remains the authoritative source of truth.

---

## ADR 004: Preservation of Python Standard Library Engine
- **Status:** Accepted
- **Context:** The existing Sieve backend is implemented purely in Python's standard library (`http.server`, `ast`, `urllib`, `tarfile`), requiring no virtual environment or pip dependencies.
- **Decision:** Maintain the Python standard library architecture for the local engine. Add CORS and clean JSON routing directly to `sieve/server.py`.
- **Consequences:** Instant startup, zero supply-chain vulnerabilities, trivial distribution, and negligible memory footprint.

---

## ADR 005: Read-Only by Default (Zero Autonomous Bot Comments)
- **Status:** Accepted
- **Context:** AI review bots (e.g. CodeRabbit, Qodo) spam pull requests with automated public comments that often annoy contributors and clutter PR discussion threads.
- **Decision:** Sieve Workspace is strictly read-only by default. Contributor replies and review summaries are drafted as copyable artifacts for the maintainer to review and post manually.
- **Consequences:** Maximizes maintainer trust, prevents AI hallucination blowouts in public discussions, and respects contributor goodwill.

---

## ADR 006: Local Open-Weight Model Inference
- **Status:** Accepted
- **Context:** Paid commercial LLM APIs cost cents per review. In open-source repositories receiving hundreds of low-effort PRs, cloud LLM costs scale negatively with spam volume.
- **Decision:** Use local open-weight inference (`qwen3.5:9b` via Ollama) for semantic intent judgment. Bounded by strict temperature-0 JSON schema enforcement.
- **Consequences:** Zero marginal cost per analyzed PR, complete privacy of unmerged source code, and full offline resilience.

