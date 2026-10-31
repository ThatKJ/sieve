# Sieve — Hackathon Pitch Deck Speaker Notes
**Target Delivery Time:** 20–40 seconds per slide (~3 minutes total)  
**Tone:** Confident, conversational, technical, and precise.

---

### Slide 1 — INTRODUCTION
- **Visual on Screen:** Sieve minimal cover layout, title, tagline, value proposition, and architecture badges.
- **Presenter Spoken Notes (25s):**
  > "Good morning, judges. We are presenting **Sieve: GitHub, redesigned for maintainers.**
  >
  > Right now, open source maintainers are burning out because GitHub wasn't built for triaging hundreds of automated and AI-generated pull requests.
  >
  > Sieve is an open-source, local-first intelligence workspace that injects directly into GitHub. It helps maintainers understand pull requests, identify risks, and decide what needs attention — without ever running untrusted contributor code.
  >
  > Let's look at why this is such an urgent problem."
- **Why it matters:** Immediately frames the product in simple English, establishes credibility, and defines Sieve's core promise.
- **Bridge to Next Slide:** Sets up the real-world maintainer pain.

---

### Slide 2 — THE PROBLEM
- **Visual on Screen:** Four core pain points alongside the conceptual ripple effect illustration.
- **Presenter Spoken Notes (35s):**
  > "What you're seeing here is the reality open source maintainers face every single evening.
  >
  > Repositories are flooded with pull requests. In an October 2026 Linux Foundation survey, maintainers reported that nearly 25% of incoming pull requests are AI-generated slop — code that looks clean and polished on the surface, but actually does nothing or introduces subtle bugs.
  >
  > Reviewing this takes hours. Even worse, GitHub only shows modified lines. A simple two-line change in one file can quietly break modules three directories away, because GitHub doesn't show you the repository import graph. Maintainers need to know what to review first.
  >
  > Here is how Sieve solves that."
- **Why it matters:** Proves the problem with verified industry data (Linux Foundation Oct 2026 survey) and shows the invisible "blast radius" blindspot.
- **Bridge to Next Slide:** Transitions from pain to Sieve's 5-step solution.

---

### Slide 3 — HOW SIEVE HELPS
- **Visual on Screen:** 5-step horizontal workflow (Connect, Understand, Analyse, Identify Risks, Guide Action) and the Facts vs. Hypotheses cards.
- **Presenter Spoken Notes (35s):**
  > "Here is Sieve’s five-step workflow.
  >
  > First, our Chrome extension connects to GitHub in 100% read-only mode — we never ask for write permissions. Second, our standard-library Python engine statically parses the repository AST to build a complete import graph. Third, we verify contributor claims: did they link a real open issue? Are claimed tests actually in the diff? Do imported modules exist?
  >
  > Fourth, we calculate the blast radius DAG: which modules depend on the changed files, and what tests need to run? And fifth, we deliver an actionable brief with exact pytest reproduction commands.
  >
  > Crucially, we separate deterministic AST facts — which are 100% verified — from Gemma 4 multimodal architectural reasoning, which is clearly labeled as model hypothesis.
  >
  > Now let's see Sieve working live in GitHub."
- **Why it matters:** Establishes engineering rigor; judges love knowing deterministic facts are never mixed up with AI hallucinations.
- **Bridge to Next Slide:** Moves to the live hero demonstration.

---

### Slide 4 — LIVE MISSION CONTROL (Hero Slide)
- **Visual on Screen:** Full-width in-situ screenshot of Sieve Mission Control injected inside GitHub, with callouts for the Native Switcher, Turn-Taking Lanes, and Blast Radius ranking.
- **Presenter Spoken Notes (40s):**
  > "This is the hero experience: GitHub transformed into a maintainer workspace.
  >
  > Notice the Native/Sieve switcher injected directly into GitHub's subnav. With one click, the standard GitHub pull request list becomes the Sieve Command Center. There's no separate tab, no SaaS dashboard, and zero context switching.
  >
  > At the top, our triage KPI strip categorizes PRs by responsibility: what needs your action, what's waiting on the author, and what is merge-ready. On the right, the Spotlight card ranks PRs not by when they were opened, but by their actual architectural blast radius.
  >
  > Maintainers instantly know which PRs are safe to merge and which ones could break the build.
  >
  > Now let's zoom in on what happens when a maintainer inspects a suspicious PR."
- **Why it matters:** Demonstrates that Sieve is an actual in-situ developer tool running inside GitHub, not an external mock dashboard.
- **Bridge to Next Slide:** Dives into individual PR deep analysis.

---

### Slide 5 — PULL REQUEST INTELLIGENCE
- **Visual on Screen:** Real PR #4 drawer showing the 25/100 score, broken imports, missing tests, and the Gemma 4 Visual Intelligence card.
- **Presenter Spoken Notes (40s):**
  > "This is our in-situ PR Intelligence drawer, running live on pull request #4 from our demo repository.
  >
  > This PR arrived with a polished description claiming comprehensive tests and an issue fix. But look at what Sieve discovered:
  >
  > First, it scored it 25 out of 100 — low effort. The diff contains zero test files despite the claims. Second, it imports , which doesn't exist anywhere in the repository. Third, our regression radar caught that an internal function was renamed while  still imports the old name — a silent downstream breakage.
  >
  > At the bottom right, Gemma 4 analyzed the visual topology DAG alongside AST facts to explain the architectural risk. Every finding is badged with its exact evidence source.
  >
  > The maintainer gets an immediate verdict and a pre-drafted polite feedback checklist. Sieve doesn't just show what changed — it explains what it could affect."
- **Why it matters:** Shows the real product catching real bugs and LLM-generated phantom imports on a real PR.
- **Bridge to Next Slide:** Summarizes the live product, architecture guarantees, and open-source availability.

---

### Slide 6 — THE LIVE PRODUCT
- **Visual on Screen:** Three-column product ecosystem (Web Showcase, Chrome Extension popup with 4ms latency, and GitHub repository links), with the core closing quote and guarantees.
- **Presenter Spoken Notes (25s):**
  > "To wrap up: Sieve is a real, working product built tonight.
  >
  > On the left, our web showcase features an interactive 3D Repository Atlas and live demo explorer. In the center, our Chrome extension runs locally, pinging the Python daemon in 4 milliseconds with Gemma 4 visual intelligence active. On the right, our repository is public under the MIT license with 94 passing automated tests, tested against our live demo repo .
  >
  > Zero cloud lock-in. 100% read-only. Contributor code is never executed.
  >
  > Understand every change. Review with confidence.
  >
  > Thank you, and we’re ready for your questions!"
- **Why it matters:** Ends with confidence, verified facts, clear open-source links, and memorable closing motto.
