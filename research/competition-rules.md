# Competition Rules — DevF8rge × Hacktoberfest 2026 Hack Day (Bengaluru)

Source: `Devf8rge Finals Orientation · Halloween Hack BLR.pdf` (27 slides, official organiser deck). Slide numbers cited.

## VERIFIED (from official deck)

| Rule | Detail | Slide |
|---|---|---|
| Hacking window | Starts 30 Oct 10:00 PM, **code freeze 31 Oct 10:00 AM** (12h). Later commits do not count. | 6, 7, 17 |
| Themes | 01 AI for Open Source · 02 Open Source for Education · 03 Developer Productivity | 8–11 |
| Public repo | On GitHub, **public from the very first commit** | 6, 13 |
| Licence | OSI-approved (e.g. MIT, Apache-2.0), in the repo | 6, 13, 17 |
| Built here | All code written during the event; commits must show it. Pre-written code = DQ | 6, 13, 14, 18 |
| README | What it does, setup, how to contribute, **AI tools used** | 13, 17 |
| Credit | Libraries, datasets, templates, others' code. Uncredited copied code = DQ | 13, 18 |
| AI coding assistants | Allowed "if every member can explain it. Name it in your README." | 14 |
| Open models | Running Gemma/Llama locally "encouraged". "Open models" counts toward open-source quality score | 9, 14, 15 |
| Secrets | No real API keys/secrets in repo = DQ | 13, 14, 18 |
| No spam | No spam issues/PRs/comments on public repos = DQ | 13, 14, 18 |
| No publishing | Publishing to npm or PyPI = DQ | 18 |
| Team | 2–4 members, all on MLH + Consent Form | 13, 14, 18 |
| Judging (100) | Technical execution 30 · Working demo 25 · Impact & usefulness 20 · Open-source quality 15 (README, licence, clean commits, open models) · Presentation 10 | 15 |
| Demo | 3:00 live demo + 2:00 Q&A. PS difficulty taken into account. Judges' decision final | 16 |
| Submission | Public repo link, OSI licence, README (setup + AI tools), working demo, final submission form — before 10:00 AM | 17 |
| Side challenge | MLH "Best Open-Source AI Project": original project using open-source/open-weight AI | 25 |

## CLARIFIED BY TEAM (not in deck)
- Rule 06 says "Round 1 problem statement" (team's was PS-10 Open Data → Open API). **Team confirmed organisers allow switching to any of the 3 themes** (user answer, 31 Oct 00:2x IST). Residual risk: confirmation is verbal/second-hand.

## UNKNOWN
- Exact final submission form URL/fields (not in deck).
- Whether hosted (closed) LLM APIs are penalised — deck only says open models are *encouraged*; no ban stated.
- Whether a deployed URL is required (deck says "a working demo"; local demo appears sufficient).
- Model parameter limits: none stated.

## ASSUMPTIONS
- Local demo on the presenter's laptop is acceptable.
- Using an open-weight model via Ollama maximises the "open models" component of the open-source quality score.

## DISQUALIFICATION RISKS & MITIGATIONS
| Risk | Mitigation |
|---|---|
| Repo not public from first commit | Create public GitHub repo before first push |
| Secrets committed | `.env` gitignored; only `.env.example`; no keys needed (local model) |
| Product opens issues/PRs/comments on real repos during demo | Product must run read-only against public repos; any write action only to our own repo |
| Publishing to npm/PyPI | Do not publish |
| Missing submission before 10:00 AM | Target feature freeze 08:30, push + form by 09:30 |
| AI-assisted code not explainable | README names Claude Code; keep code small and readable |
