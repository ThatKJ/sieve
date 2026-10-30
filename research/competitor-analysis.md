# Competitor Analysis

Pricing marked VERIFIED was read on the vendor page by a research agent on 31 Oct 2026; otherwise UNVERIFIED.

## Winner space: OSS PR intake / triage

| Product | Customer | Core function | Pricing | Strength | Weakness | Gap for us |
|---|---|---|---|---|---|---|
| [CodeRabbit](https://coderabbit.ai/pricing) | Teams, OSS | AI line-by-line code review | $24/$48/$72 per user/mo; free for public repos (VERIFIED) | Polished, free for OSS | Reviews code *quality*; doesn't decide whether a PR deserves human time or whether it does what it claims. Cloud LLM | Intake verdict + claim verification, local |
| GitHub Copilot code review | GitHub users | Native AI review | Billed via Actions minutes + request multiplier from Jun 2026 (snippet) | Built in | Costs per review, which scales badly with spam floods; cloud | Zero marginal cost per PR |
| GitHub Agentic Workflows triage | GitHub orgs | Agent labels/flags issues | Engines are hosted (Copilot/Claude/Codex/Gemini) (VERIFIED) | Good design | Hosted models only, issues-focused | PR-focused, open weights |
| [peakoss/anti-slop](https://github.com/peakoss/anti-slop) | OSS maintainers | Auto-close PRs on 34 rule checks | Free, ~850★ (VERIFIED) | Cheap, fast | Metadata heuristics (e.g. digits in username); never reads the diff; auto-closes, so biased against newcomers | Reads diff + issue; explains; never closes |
| Slopper / slopcheck / SlopGuard | OSS | 0–10 slop score | Free (snippet) | Quarantine idea | Tiny adoption, unknown accuracy, no evidence trail | Evidence-linked findings |
| [mitchellh/vouch](https://github.com/mitchellh/vouch) | Ghostty etc. | Contributor allowlist | Free, MIT (VERIFIED) | Simple, effective | Locks out newcomers by design | Lets newcomers in, judged on their work |
| [Dosu](https://dosu.dev/pricing) | OSS + companies | Docs/Q&A agent | Free 200 credits; Pro $16/mo; Maintainers Pro custom (VERIFIED) | Strong OSS presence | Moved away from hosted triage | Spend signal for corporate OSS |
| Qodo PR-Agent | Teams | PR review/describe, self-hostable | MIT; hosted ~$30/user (UNVERIFIED) | Can use own model | Review tool, not an intake gate | |
| GitHub PR restrictions | All | Disable PRs / collaborator-only | Free | Stops the flood | Stops all outside contribution | |

**Where they stop:** rule-based gates never read the change; AI reviewers review code style/bugs but never check whether the PR *does what it says* or *references things that exist*, and they bill per review on hosted models. **What maintainers still do manually:** open each PR, read the linked issue, check if the diff relates to it, check claimed tests exist, check imports resolve, write the same "please fill the template / add tests" comment.

## Runner-up spaces (summary)

| Space | Key competitors | Why not chosen |
|---|---|---|
| CI failure/flaky | Trunk, [BuildPulse](https://buildpulse.io/pricing) ($99–$499/mo), Datadog, Copilot "Explain error" (free, built-in), redherring, ci-doctor (OSS) | Copilot's built-in explainer + free OSS tools make differentiation thin; demo depends on finding a live failing run |
| Dependency breaking-change triage | Dependabot compat score, Renovate/Mend Merge Confidence (crowd-based), Socket.dev ($25–$50/seat) | Most teams solve noise by config; changelog quality varies too much for a reliable 5-hour build |
| Open data → API | Datasette (OSS; Cloud price not listed), ROAPI, SheetDB ($29.99+/mo), Sheety ($9.99+), Supabase ($25+), data.gov.in MCP servers | Weak willingness to pay; demo less dramatic |
| Release notes | release-please, changesets, git-cliff | Solved for free |
