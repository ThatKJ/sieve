# Sieve Workspace — Competitive & Market Analysis

## 1. Competitive Landscape Matrix

| Competitor | Primary User | Core Function | Form Factor | Pricing Model | Blast Radius / Impact? | Claim Verification? | Triage Inbox? | Trust Model |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CodeRabbit** | Dev Teams / OSS | Line-by-line automated code review comments | GitHub App / Bot comments | Free for OSS; $24–$72/seat/mo | Basic module list | ❌ No | ❌ No | Automated bot comments on PR |
| **Greptile** | Dev Teams | Codebase search & PR Q&A bot | Web App & GitHub Bot | $30–$50/seat/mo | Cloud embeddings | ❌ No | ❌ No | Hosted LLM comments |
| **Qodo (PR-Agent)** | Devs / Teams | PR summarization, test generation, reviews | GitHub Action / CLI | Free OSS; $19–$39/user/mo | ❌ No | ❌ No | ❌ No | Automated PR comments |
| **GitHub Copilot Review** | Enterprise Teams | In-line AI review suggestions | Native GitHub | Part of Copilot Enterprise / Actions minutes | ❌ No | ❌ No | ❌ Native PR list only | Cloud LLM suggestions |
| **Graphite** | Dev Teams | Stacked PR management and fast review UI | Standalone Web App | $20–$40/user/mo | ❌ No | ❌ No | ✅ Inbox (author-centric) | Replaces GitHub with custom web app |
| **Sourcegraph (Cody)** | Enterprise | Multi-repo code search and context Q&A | IDE & Web App | Enterprise tiers ($9–$19+/seat) | Code search graph | ❌ No | ❌ No | Read-only enterprise index |
| **Mergify / Reviewpad** | Maintainers | Rule-based CI merge queues & PR labeling | GitHub App / Config file | Free tier; $15–$50/repo/mo | ❌ No | ❌ No | ❌ No | Automated merge/label actions |
| **Renovate / Dependabot** | Repositories | Automated dependency bump PR generation | GitHub App / Native | Free | Dep tree | ❌ No | ❌ No | Automated PR creation |
| **Sieve Workspace** | **OSS Maintainers** | **Repository intelligence, intake triage & impact verification** | **Chrome Extension + Local Engine** | **Free OSS; $20/org/mo hosted** | **✅ Deterministic AST DAG** | **✅ Diff vs Claim check** | **✅ Maintainer Inbox on `/pulls`** | **Strictly read-only; Human in the loop** |

---

## 2. In-Depth Competitor Analysis

### 2.1 CodeRabbit & Qodo (PR-Agent)
- **What they do:** Inject automated AI comments onto pull requests analyzing code syntax, bug risks, and test ideas.
- **Why maintainers complain:** They generate substantial PR comment noise. On open-source repos, contributor PRs often get 10-paragraph AI comments that maintainers still have to read and verify. They act as **reviewers for the author**, not **triage gates for the maintainer**.
- **Sieve Differentiation:** Sieve never spams public pull requests with automated comments. It operates privately inside the maintainer's browser extension, summarizing whether the PR is worth the maintainer's time before they review it.

### 2.2 Graphite
- **What they do:** Replaces GitHub's PR UI with a lightning-fast standalone web application focused on stacked diffs.
- **Product limitation:** Maintainers of public open-source repositories cannot force external open-source contributors to use Graphite stacks. Outside contributors submit standard single PRs on GitHub. Maintainers want to stay inside GitHub.
- **Sieve Differentiation:** Chrome Extension operates *in situ* directly on `github.com`. No external dashboard or workflow migration needed.

### 2.3 Mergify & Reviewpad
- **What they do:** Deterministic merge queues and metadata-based conditional automation (e.g. `if label: ready and checks: passed then merge`).
- **Where they stop:** They do not inspect code semantics or verify claims. If a spam PR passes basic CI (or has no CI), Mergify cannot tell if the PR claims to fix issue #12 while actually touching unrelated files.
- **Sieve Synergy:** Sieve provides the semantic claim verification and impact intelligence that rule-based engines lack.

---

## 3. Core Strategy: What Sieve Must and Must NOT Build

### Must Match (Table Stakes)
1. **Instant Response Times:** Triage view must load within 500ms; cached PR analysis must appear immediately without freezing the page.
2. **Deep GitHub Context:** Show author avatar, commit counts, CI check badges, labels, and issue links.
3. **Flawless Client-Side SPA Navigation:** GitHub uses Turbo / PJAX; extension must adapt seamlessly across page transitions.

### Must NOT Build (Competitor Traps)
1. **Do NOT build an automated public comment bot:** Spamming public PRs with AI summaries alienates maintainers and contributors.
2. **Do NOT build a standalone SaaS dashboard that requires leaving GitHub:** Maintainers live in GitHub. Forcing them to visit another URL creates adoption friction.
3. **Do NOT attempt whole-codebase full LLM re-indexing on every PR:** Too slow, high token cost, and unnecessary when deterministic AST + Git trees solve the problem reliably.

---

## 4. Strategic Differentiation Hypotheses

1. **Hypothesis 1 (In-Situ Superiority):** A browser extension that augments GitHub's native `/pulls` interface will see 5x higher daily active usage than a standalone review dashboard.
2. **Hypothesis 2 (Evidence Trust):** Maintainers will trust deterministic AST import graphs and exact code statement citations far more than black-box AI risk scores.
3. **Hypothesis 3 (Zero Marginal Cost):** Utilizing local open-weight models (Ollama `qwen3.5:9b`) provides zero-cost inference per PR, making high-volume open-source triage economically viable.

