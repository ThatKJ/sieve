# Master prompt: Sieve web UI

Paste everything below the line into opencode / Gemini, run from the repo root.

---

You are a senior product designer and front-end engineer. Build the web interface for **Sieve**, an open-source tool for maintainers of open-source GitHub repositories. The backend already exists and works. **Do not modify anything in `sieve/`.** Only create or replace files in `web/`.

## What Sieve is (so the UI tells the right story)

Maintainers are flooded with low-effort and AI-generated pull requests (the Linux Foundation's Oct 2026 survey: maintainers estimate ~25% of incoming PRs are "slop"; curl ended its bug bounty, tldraw closed outside PRs). Existing defences either close the door on everyone or auto-close on blunt rules that punish genuine newcomers.

Sieve checks **what a PR claims against what it actually contains**: does the linked issue exist and is it open, does it really add the tests it says it adds, do the files it mentions and the modules it imports exist in the repo, does it follow the PR template and CONTRIBUTING rules. Every finding has evidence. A **local open-weight model (qwen3.5:9b via Ollama)** makes one judgment rules can't: does this diff actually implement what the linked issue asks? Sieve is **read-only**: it never comments, labels or closes on GitHub. It drafts a polite fix-it checklist the maintainer can copy and send.

Tagline: **"Know which pull requests deserve your time."**

The value must be obvious within 10 seconds of opening the page.

## Hard technical constraints

1. **Plain static files only:** `web/index.html`, `web/style.css`, `web/app.js`. No build step, no npm, no framework, no bundler. The Python stdlib server serves `web/` as the site root (`python3 -m sieve --serve` → http://127.0.0.1:8787).
2. **No CDNs, no web fonts, no external requests from the page** (except avatar images from avatars.githubusercontent.com and links to github.com). The live demo must work on flaky venue Wi-Fi. Use system font stacks.
3. **Security:** all PR titles, bodies, findings, evidence, usernames and comments are attacker-controlled. Never put them into `innerHTML` unescaped. Use `textContent` or an escaping helper everywhere. Only render `<a href>` for URLs starting with `https://github.com/`.
4. **Honesty:** no fake metrics, no invented numbers, no decorative charts, no fake "AI is thinking" step lists. Every number shown must come from the API. Model output must be visibly labelled "model opinion"; everything else is deterministic.
5. Accessible: semantic HTML, visible focus states, keyboard-operable rows/buttons, `aria-live` for async status, contrast AA, `prefers-reduced-motion` respected.
6. Responsive down to 375px wide.

## API contract (exact, verified against the running server)

### `GET /api/health`
```json
{"model": "qwen3.5:9b", "ollama": true, "model_installed": true, "offline": false, "github_auth": true}
```
Use it for status pills in the header: model + "local" (green dot if `ollama && model_installed`, red otherwise with tooltip "model checks will be skipped"), a "read-only" pill, and an "offline cache" pill when `offline` is true.

### `GET /api/analyze?pr=<ref>&model=0|1`
`ref` = `owner/repo#123` or a full PR URL (URL-encode it; `#` must become `%23`).
- `model=0`: deterministic checks only, returns in ~1–3 s.
- `model=1`: same plus the local model judgment, ~5–15 s.

**Required UX:** call `model=0` first and render the full report immediately, with an inline "Asking qwen3.5:9b whether the diff does what the linked issue asks… 7s" row (a real elapsed-seconds counter). Then call `model=1` and re-render with the complete result. Skip the second call if health says the model isn't available, and say so in the model panel. If a newer request starts, ignore stale responses.

Response:
```json
{
  "pr": {"owner": "TheAlgorithms", "repo": "Python", "number": 15669, "title": "Add greeting feature",
         "url": "https://github.com/TheAlgorithms/Python/pull/15669", "author": "someuser",
         "author_avatar": "https://avatars.githubusercontent.com/u/230964557?v=4", "association": "NONE",
         "state": "open", "merged": false, "created_at": "2026-10-29T04:21:35Z",
         "additions": 11, "deletions": 0, "changed_files": 1, "linked_issues": []},
  "score": 62,
  "verdict": "needs-work",
  "findings": [
    {"check": "layout", "status": "warn", "title": "New file placed outside the repo's existing structure",
     "detail": "Maintainers usually expect new code next to similar code.",
     "evidence": ["greeting.py (no other .py files in the repo root)"],
     "fix": "Move new files into the directory where similar code lives (see CONTRIBUTING).", "penalty": 10}
  ],
  "model": {"name": "qwen3.5:9b", "used": true, "error": null,
            "judgment": {"verdict": "addresses", "confidence": 0.95, "reason": "…one sentence…",
                         "gaps": ["…"], "guideline_issues": ["…"]}},
  "comment": "Thanks for the contribution, @someuser! … markdown checklist …",
  "tree_truncated": false,
  "elapsed_s": 4.7
}
```
- `verdict` ∈ `ready` (score ≥ 75), `needs-work` (45–74), `low-effort` (< 45). Labels: "Ready for review", "Needs work before review", "Low-effort signals".
- `findings[].status` ∈ `fail`, `warn`, `info`, `pass`, already sorted in that order. Group them: **Doesn't check out** (fail), **Needs attention** (warn), **Context** (info), **Verified** (pass).
- `findings[].check` values: `description`, `linked_issue`, `substance`, `tests`, `imports`, `references`, `template`, `checklist`, `layout`, `author`, `competing`, `model`, `guidelines`. Findings with check `model` or `guidelines` must carry a "model opinion" tag.
- `evidence` items are strings; some are `https://github.com/...` URLs (render as links, show without the domain), others are file paths or code refs (render monospace).
- `model` is `null` when `model=0`. When `model.used` is false, show `model.error`.
- `comment` is the drafted reply to the contributor (markdown text). Show it in a side panel titled "Reply to contributor" with a **Copy** button and the note "Draft only. Sieve never posts to GitHub."

### `GET /api/queue?repo=<owner/repo>`
Fast deterministic pass over up to 15 open PRs (~5–30 s on large repos, no model), sorted best-first:
```json
{"owner": "TheAlgorithms", "repo": "Python", "rows": [
  {"number": 15678, "title": "fixes ISSUE NO - 15633", "url": "https://github.com/…/pull/15678",
   "author": "someuser", "association": "NONE", "score": 92, "verdict": "ready",
   "top_issues": ["Changes code without tests"], "draft": false}
]}
```
A row may instead be `{"number", "title", "error"}`; show it gracefully. Render as a review queue (table or list): score, verdict chip, `#number title`, the `top_issues` joined as a one-line "why", author. Clicking a row (or Enter) opens the full single-PR analysis. Header: "owner/repo: N open PRs", with counts per verdict computed from rows.

### Errors
Non-2xx returns `{"error": "human-readable message"}` (400 bad input, 404 not found, 429 GitHub rate limit, 503 offline/no network, 500 unexpected). Show the message in an inline error banner near the input. Never show a stack trace. Handle the server being down (fetch throws): "Can't reach the Sieve server. Is it still running?"

## Screens and flow

1. **Landing = the tool itself.** No marketing landing page. Header (wordmark "sieve" + status pills), then one big input: "Paste a pull request (owner/repo#123) or a repository (owner/repo)" with a **Check** button. Detect type: PR pattern `owner/repo#N` or `/pull/N` → analysis; `owner/repo` → queue; otherwise inline validation error. Empty input → inline error.
   Below the input, a short headline + 2-sentence explanation + three crisp facts (Read-only · Runs locally on an open-weight model · Fair to newcomers, nothing auto-closes) + **"Try" examples**, which start the check on click:
   - `ThatKJ/sieve-demo-target#1`: "A solid fix with tests"
   - `ThatKJ/sieve-demo-target#2`: "Looks polished, doesn't check out"
   - `ThatKJ/sieve-demo-target#3`: "Drive-by README edit"
   - `ThatKJ/sieve-demo-target`: "Rank every open PR in a repo"
2. **PR report.** Breadcrumb `owner/repo · #N` (repo part links to its queue), PR title large, meta line (avatar, @author, association if not NONE, +adds −dels, files, state, "Open on GitHub ↗"). A **verdict block**: big score `62/100`, verdict label coloured by verdict, tally line ("2 don't check out · 3 need attention · 4 verified"). Then two columns: findings (left, grouped) and a sticky side panel (right): Reply to contributor, Relevance judgment (verdict, confidence %, model name + "Ollama, local"), and a small meta panel (number of findings, elapsed seconds; note if `tree_truncated`). Collapse to one column on mobile.
3. **Queue view** as described above.
4. Keep the URL in sync (`?pr=…` / `?repo=…`) with `history.pushState`, and restore state on load/back-button, so a refresh during the demo shows the same result.

Loading states: a real spinner + plain sentence of what's happening ("Reading the pull request, its files, linked issue and the repository tree from GitHub…"). Disable the Check button while busy.

## Design direction

The feel of a serious early-stage developer tool, like a careful **inspection report**, not a dashboard and not a generic AI app.
- Warm paper background (~`#f5f3ee`), near-black ink text, hairline rules (`#dcd8cf`), cards only where they group something real.
- Typography: a serif for the big headline, PR title and score (system serif stack: "Iowan Old Style", Charter, Georgia); system sans for UI; monospace for evidence, refs, model name.
- One colour per status, used sparingly: fail = vermilion `#b8321f`, warn = ochre `#9a6200`, pass = green `#2d6a46`, info = slate `#4a5a70`, each with a pale tinted background for small status marks/chips.
- Avoid: gradients, glassmorphism, glowing borders, sparkle/robot AI icons, emoji, oversized drop shadows, decorative charts, too many cards, animation beyond a spinner and subtle hover states.
- Strong hierarchy: within 10 seconds a judge should see **score + verdict + the red "Doesn't check out" findings with evidence**.
- Wordmark: lowercase "sieve" in monospace with a small dot-grid glyph (CSS radial-gradient), suggesting a sieve.

## Acceptance checklist (verify each before you finish)

- [ ] `python3 -m sieve --serve` then http://127.0.0.1:8787 loads with no console errors and no external network requests except avatars.
- [ ] Clicking each Try example works; the PR report renders deterministic results first, then updates with the model result.
- [ ] Repo queue renders, rows are clickable and keyboard-accessible.
- [ ] Invalid input, unknown PR (404), and server-down each show a clear inline error.
- [ ] A PR title containing `<img src=x onerror=alert(1)>` renders as text.
- [ ] Copy button copies the draft reply.
- [ ] Back/forward and refresh restore the view.
- [ ] Looks right at 1440px and 375px.

Do not add features beyond this spec. Do not touch `sieve/`, `tests/`, `README.md` or `research/`.
