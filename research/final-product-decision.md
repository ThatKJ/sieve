# Final Product Decision — Sieve

1. **Winning idea:** an evidence-based intake gate for open-source pull requests.
2. **Name:** Sieve.
3. **One sentence:** Sieve checks what an incoming PR *claims* against what the diff and repo *actually contain* (and whether it addresses the linked issue, judged by a local open-weight model), then gives the maintainer a ranked review queue and the contributor a concrete fix-it checklist. It never auto-closes.
4. **Target customer:** maintainers of popular GitHub repos receiving outside PRs; paying customer = companies running commercial open source (open-core startups, dev-tool vendors) whose engineers are paid to review community PRs.
5. **Exact problem:** a growing share of outside PRs are low-effort or AI-generated. Each one costs a maintainer a full read before they can tell. Current defences either close the door on everyone (disable PRs, vouch allowlists) or auto-close on blunt metadata rules that punish genuine newcomers.
6. **Evidence:** see `customer-pain.md` Area 1 (10 items; 6+ named projects, LF survey of 234 maintainers estimating ~25% slop, GitHub's PR-restriction features).
7. **Current alternatives:** manual review; CodeRabbit / Copilot review; anti-slop rule gates; vouch; disabling PRs.
8. **Competitor weaknesses:** AI reviewers review *code quality*, not *whether the PR is what it says*, and bill per review on hosted LLMs. Rule gates never read the diff. Allowlists exclude newcomers.
9. **USP:** **claim verification.** Sieve extracts verifiable claims from the PR (linked issue, "adds tests", files/modules referenced, imports added) and checks each one deterministically against the diff and the repo tree, with every finding linked to evidence. The local model is used only for the judgment rules cannot make (does this diff address this issue?), and its output is validated and labelled as model opinion.
   Positioning: *For maintainers of busy open-source repos, Sieve is the PR intake gate that tells you in seconds which contributions are real and exactly what's missing from the rest, unlike auto-closers and AI code reviewers, because it verifies each PR's claims against the actual repository instead of guessing from metadata or reviewing style.*
10. **Why now:** 2026: LF survey (Oct), Godot/curl/tldraw public statements, GitHub's PR kill-switch, Hacktoberfest dropping PR counting. Local 9B models are now good enough to run per PR at zero marginal cost.
11. **Why this product:** it protects the newcomer path that closing the door destroys, and costs nothing per PR because inference is local.
12. **Pricing hypothesis (ours, untested):** free and open source for self-hosting (CLI / GitHub Action with a self-hosted model). Hosted "Sieve for Orgs": $20/repo/month (queue across repos, policy config, managed inference). Reference prices: CodeRabbit $24–$72/user/mo, Dosu Pro $16/mo, BuildPulse $99+/mo.
13. **$20 → $200 test (conservative, all assumptions stated):**
   - Repo receives 60 outside PRs/month (assumption; Coolify cited at 120 slop/month, so 60 total is conservative).
   - 25% are low-effort (LF survey estimate) → 15 PRs.
   - Sieve saves 10 min of maintainer triage per low-effort PR (first read + writing the "please fix" comment) and 3 min per legitimate PR (pre-checked claims) → 15×10 + 45×3 = 285 min ≈ 4.75 h.
   - Fully loaded cost of a paid maintainer engineer: $50/h (assumption; lower for India-based teams).
   - Value ≈ $237/month vs $20 price. **Passes for paid maintainers at company-backed projects; fails for volunteers, who don't pay for their own time.** That is why the buyer is commercial OSS, not volunteers.
14. **Recurring use:** every incoming PR, every day; queue view for weekly backlog sweeps. Retention driver: it's in the PR workflow. Churn risk: false positives annoying contributors, or GitHub shipping a native equivalent.
15. **Eligibility:** Theme 01 AI for Open Source (primary) and 03 Developer Productivity. Uses an open-weight model locally (encouraged). Read-only against public repos, so it never posts to others' repos (spam rule).
16. **MVP scope:** analyse any public PR by URL → findings with evidence + verdict + drafted contributor comment. Queue mode: analyse a repo's open PRs and rank them. CLI with the same engine. Offline replay of cached GitHub data for a reliable demo.
17. **Feasibility:** GitHub REST API (PR, files, issue, tree, author), deterministic checks in Python, Ollama qwen3.5:9b (verified working locally, ~6 s for a short JSON reply). Plain FastAPI + single static page.
18. **Main risks:** 9B model misjudging relevance (mitigated: model only gives one bounded judgment, with deterministic fallback); GitHub rate limits (token from env + on-disk cache); fairness (never auto-close, show evidence, contributor-facing wording).
19. **Why the others lost:** CI explainer competes with a free built-in Copilot feature and has an unreliable live demo; breaking-change triage depends on inconsistent changelogs; issue intake overlaps with GitHub's native preview; PS-10 open data has the weakest willingness to pay.

---

## Update, 01:10 IST: scope expanded to a review workbench

New material input from the team: the product should understand the repository, not only score the PR. Kept the winning problem and buyer; expanded the solution:

- **Repository Atlas + PR impact:** a file-level import graph from a repo snapshot, with each PR's changed, direct and indirect files highlighted and every link backed by an import line.
- **Regression radar:** for example "symbol removed but still imported at file:line".
- **Verification plan + reviewer brief:** concrete next steps, never executed by Sieve.
- **Confidence ledger:** every finding labelled repository / GitHub data / model, plus what was not verified.

Competitive reality check: blast-radius graphs already exist (CodeRabbit's Security Blast Radius in Change Stack, open-source "focus", PR Autopilot), and the method (BFS over an import graph) is standard. Sieve does not claim the graph is novel. Its differentiation is the combination: verifying the PR's own claims, evidence-source labelling, a local open-weight model, zero per-PR cost, and strictly read-only operation, aimed at OSS maintainers rather than enterprise security teams.
