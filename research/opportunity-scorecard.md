# Opportunity Scorecard

## 15 initial hypotheses

| # | Problem → solution | User / buyer | Current workaround | Biggest risk |
|---|---|---|---|---|
| H1 | Low-effort/AI PR flood → evidence-based PR intake gate | OSS maintainers / commercial-OSS companies | Manual review, auto-closers, disabling PRs | Weak WTP among volunteers |
| H2 | Slop security reports → report validator | Bug-bounty programs, maintainers | Manual triage; curl ended bounty | Hard to verify vuln claims in 5h |
| H3 | Issues missing repro → issue-intake assistant | Maintainers | Templates, stale bot | GitHub shipping native duplicate detection |
| H4 | Newcomers can't find a fitting issue → contributor-matching onboarding | First-time contributors | "good first issue" label (gets grabbed) | No buyer |
| H5 | Codebase is opaque to newcomers → repo tour generator | New contributors | READMEs, DeepWiki-style tools | Crowded; low differentiation |
| H6 | Red CI, unclear why → failure explainer + flaky verdict | Dev teams | Re-run until green | Copilot "Explain error" free & built-in |
| H7 | Flaky tests → history-based flaky detector | Platform teams | Trunk, BuildPulse | Needs CI history; paid incumbents |
| H8 | Major dependency bump → call-site breaking-change triage | Platform / AppSec | Ignore majors; manual changelog read | Changelog quality varies |
| H9 | Dependabot PR noise → grouping/prioritisation | Small teams | Renovate config | Solved by config |
| H10 | Changelog drudgery → release notes generator | Maintainers | release-please, git-cliff | Solved for free |
| H11 | Messy gov CSV/XLSX → typed API + cross-year schema map (PS-10) | Researchers, civic devs | Hand-written mapping scripts | Weak WTP |
| H12 | Public data feeds drift silently → drift guard (PS-10) | Data engineers | Hand contracts (datacontract-cli) | Drift unseen in a live demo |
| H13 | API docs ≠ behaviour → contract-drift tester (PS-10) | API consumers | Postman tests | Generic; Schemathesis/Dredd exist |
| H14 | Indian-language learners offline → local tutor (Education) | Students | YouTube, ChatGPT | Weak buyer; hard to demo quality |
| H15 | Docs examples rot → run-the-README checker | Maintainers | CI doctests | Language-specific, narrow |

## Five finalists — weighted scores (1–10)

Weights: Pain 20 · Evidence 15 · Commercial 15 · USP 15 · Feasibility 15 · Demo 10 · Fit 5 · Retention 5.

| Finalist | Pain | Evid. | Comm. | USP | Feas. | Demo | Fit | Ret. | **Total** |
|---|---|---|---|---|---|---|---|---|---|
| **H1 PR intake gate (Sieve)** | 9 | 9 | 4 | 7 | 8 | 9 | 10 | 7 | **7.75** |
| H6 CI failure explainer + flaky verdict | 8 | 8 | 8 | 5 | 6 | 7 | 9 | 8 | 7.20 |
| H8 Breaking-change call-site triage | 6 | 6 | 7 | 8 | 6 | 7 | 9 | 7 | 6.75 |
| H3 Issue-intake assistant | 7 | 6 | 4 | 4 | 8 | 6 | 10 | 7 | 6.15 |
| H11 Gov data → typed API (PS-10) | 6 | 5 | 4 | 6 | 7 | 6 | 7 | 5 | 5.70 |

Reasoning highlights:
- **H1**: strongest, most independent evidence (curl, Godot, GoCD, Genkit, tldraw, LF survey, GitHub product changes). Perfect fit with the Hacktoberfest "AI for Open Source" theme and the open-models criterion. Commercial scored low on purpose: volunteers rarely pay.
- **H6**: clearest existing spend (BuildPulse $99+/mo) but GitHub Copilot already explains failures for free; the demo depends on catching a live failing run.
- **H8**: most differentiated, but changelog quality varies and the buyer is a security/platform budget that's hard to reach.
- **H3**: GitHub is shipping native duplicate detection; less dramatic.
- **H11**: real but niche pain, weakest willingness to pay.

## Top 3 deeper look
- H1 vs H6: H1 wins on demo reproducibility (public PRs are permanent and fetchable; CI failures need logs that expire) and on differentiation versus a free built-in competitor.
- H8 is the best *business* if H1's WTP proves too weak. Noted as the pivot path.
