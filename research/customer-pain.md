# Customer Pain — Evidence

Collected 31 Oct 2026, 00:20–00:35 IST by three parallel research agents. **Coverage limit:** reddit.com was blocked for the research tools, so there are **no direct Reddit quotes**. Evidence comes from GitHub issues, maintainer statements reported in the press, surveys, vendor pages and developer blogs. "Snippet" = seen only in a search result, page not opened.

Labels: **FACT** observed · **PAIN** user-reported · **INF** inference · **UNV** unverified.

---

## Area 1 — OSS maintainers drowning in low-quality / AI-generated PRs (WINNER)

| # | Source | Who | What they report | Workaround / consequence | Label |
|---|---|---|---|---|---|
| 1 | [The Register, 3 Feb 2026](https://www.theregister.com/2026/02/03/github_kill_switch_pull_requests_ai/) (opened) | Maintainers of Genkit, GoCD, Runwasi | Genkit: "1 out of 10 PRs created with AI is legitimate." GoCD: spent heavy review time on a docs PR that was "plausible nonsense"; "a huge erosion of social trust". | Reviewers can no longer assume authors understand their own code | PAIN |
| 2 | [Linux Foundation survey, 20 Oct 2026](https://www.linuxfoundation.org/press/new-lf-research-survey-shows-generative-ai-cuts-open-source-coding-time-in-half-but-25-of-incoming-pull-requests-are-considered-ai-slop) | 234 maintainers | ~25% of incoming PRs judged slop (31% on projects with >50 contributors). 64% of large-project maintainers say review time rose (secondary). | Only ~35% of projects have an AI policy | FACT (self-reported estimates, Red Hat-sponsored) |
| 3 | [PCGamesN](https://www.pcgamesn.com/ai/godot-ai-generated-submissions) / [GamingOnLinux](https://www.gamingonlinux.com/2026/02/godot-engine-suffering-from-lots-of-ai-slop-code-submissions), Feb 2026 | Godot maintainer | "AI slop PRs are becoming increasingly draining and demoralizing"; second-guessing new contributors' PRs "multiple times per day"; ~4.7k open PRs | AI-disclosure rule, widely ignored. Asked for funding to hire maintainers | PAIN (secondary) |
| 4 | [The Register, 21 Jan 2026](https://www.theregister.com/2026/01/21/curl_ends_bug_bounty/), [LWN](https://lwn.net/Articles/1055443/) | curl lead maintainer | Flood of AI-hallucinated vulnerability reports (~20% slop by mid-2025) | **Ended the bug bounty**, losing a channel that found ~80 real bugs | PAIN (snippet) |
| 5 | [AlternativeTo, Jan 2026](https://alternativeto.net/news/2026/1/tldraw-pauses-external-contributions-citing-rise-in-low-quality-ai-code-and-pull-requests) | tldraw, Ghostty | tldraw auto-closes all external PRs; Ghostty bans AI code and uses [vouch](https://github.com/mitchellh/vouch) (5.1k★) allowlist | **Outside contribution shut off entirely** | PAIN (secondary) |
| 6 | GitHub community discussion on PR "kill switch" (via #1) | GitHub product team | GitHub floated disabling PRs, collaborator-only PRs, AI triage | Shipped settings to disable/restrict PRs: the platform answer is closing the door | FACT (secondary) |
| 7 | [makeplane/plane#9061](https://github.com/makeplane/plane/issues/9061), [TheAlgorithms/Python#14675](https://github.com/TheAlgorithms/Python/issues/14675), 13 May 2026 (opened) | Tool author | Claims 10/35 and 7/61 recent PRs would be auto-closed by rules; cites Coolify at "120 slop PRs/month" | Both issues closed without maintainer engagement: **maintainers distrust blunt auto-closers** | FACT / INF |
| 8 | [DEV: Hacktoberfest 2026 changes](https://dev.to/0shuvo0/hacktoberfest-2026-what-changed-1g3g) | Hacktoberfest / maintainers | Burnout from "low-effort, box-checking" PRs; ~621k PRs in Oct 2020 | Hacktoberfest reportedly dropped PR counting | UNV (not verified on hacktoberfest.com) |
| 9 | [OSM rails-dev, Apr 2026](https://lists.openstreetmap.org/pipermail/rails-dev/2026-April/049116.html) | iD maintainers | "Good first issue" grabbed by drive-by takers within hours | Renamed the label | PAIN (snippet) |
| 10 | [Issue mirror: triage bot closes valid bugs](https://claudeissues.com/issue/35923-ai-driven-issue-triage-is-systematically-destroying-valid-bug-reports) | Bug reporters | Similarity bot auto-closes and locks careful reports | **Backlash against automation that acts without evidence** | PAIN (snippet) |

**Pattern (INF):** independent maintainers at 6+ projects, a 234-person survey and GitHub's own product changes describe the same problem. Existing responses either **close the door** (tldraw, vouch, PR disabling) or **auto-close on blunt rules**, both of which hurt genuine newcomers (#5, #7, #10). Missing piece: *evidence-based* triage that helps the maintainer decide fast and tells the contributor exactly what to fix.

**Willingness to pay (honest):** weak among volunteer maintainers. Spend signals exist only at companies running commercial OSS ([Dosu "Maintainers Pro"](https://dosu.dev/pricing) for VC/corporate-backed OSS), foundations, and bug-bounty platforms (INF).

---

## Area 2 — CI failure diagnosis / flaky tests (runner-up)

| # | Source | What | Label |
|---|---|---|---|
| 1 | [golang/go#62244](https://github.com/golang/go/issues/62244), Aug 2023 | "click 'rerun job' in CI multiple times (and wait hours to get a green run)" (115 reactions) | PAIN |
| 2 | [redherring on PyPI](https://pypi.org/project/redherring/), Sep 2026 | On astral-sh/uv, 94 of 280 red runs (34%) went green on plain re-run | FACT (tool author's data) |
| 3 | [TUM 5-year case study](https://mediatum.ub.tum.de/doc/1730194) | Flaky tests cost ≥2.5% of productive dev time | FACT (snippet) |
| 4 | [actions/runner#3236](https://github.com/actions/runner/issues/3236) | Finding the failure in 20k-line logs is hard | PAIN (weak, 1 reaction) |

Spend exists: [BuildPulse](https://buildpulse.io/pricing) $99–$499/mo; Trunk, Datadog.

## Area 3 — Dependency upgrade noise / breaking-change triage

| # | Source | What | Label |
|---|---|---|---|
| 1 | [Filippo Valsorda, 20 Feb 2026](https://words.filippo.io/dependabot) | "Dependabot is a noise machine" | PAIN |
| 2 | [community/discussions/10441](https://github.com/orgs/community/discussions/10441) | Major bumps (node-fetch 3 ESM-only) break projects | PAIN |
| 3 | Reddit mirror snapshot (snippet) | ~40 Dependabot PRs/week for a small team | PAIN (snippet) |

## Area 4 — Open Data → API (original PS-10)

| # | Source | What | Label |
|---|---|---|---|
| 1 | [themineworks.com, Jun 2026](https://themineworks.com/blog/india-government-data-api/) | data.gov.in: "Field names are not standardized", case-sensitive filters, pagination off-by-one | PAIN |
| 2 | [datagovindia R pkg NEWS](https://github.com/econabhishek/datagovindia/blob/HEAD/NEWS.md) | Added server-down checks; fixes for "changed variable names" | FACT |
| 3 | [ckan/ckan#4415](https://github.com/ckan/ckan/issues/4415) | Type guessing drops leading zeros, mangles dates | PAIN |
| 4 | [PSLmodels#43](https://github.com/PSLmodels/tax-microdata-benchmarking/issues/43) | Yearly files: same variables, different positions | PAIN |

Willingness to pay weak (researchers, students, civic tech); one paid Apify scraper is the only commercial signal.

## Area 5 — Release notes
Weak: mature free tools (release-please, changesets, git-cliff); an Ask HN on the topic drew 0 comments.
