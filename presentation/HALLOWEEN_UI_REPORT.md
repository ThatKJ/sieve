# Halloween UI Report

**Approach:** a shared "Halloween Edition" token layer appended to each existing stylesheet. It overrides the existing CSS variables, so every component inherits it. No layout, JS, backend, API or permission changes.

**Tokens:** bg #0B0A0F / #121019, cards #191620, elevated #211B29, text #F8F2EA / #AAA1B2, orange #FF762E / #FF9A4D (interaction), purple #7952A5 / #39244F (atmosphere and AI), border #302638, success #82B99A, warn #E9A34B, error #E36C69.

**Files:**
- `extension/ui/workspace.css`: Mission Control, PR Intelligence, PR controls, Gemma panels, topology labels and edges, buttons, inputs, KPIs, rows, confirmation panel, pumpkin plus "HALLOWEEN EDITION" eyebrow, crescent moon, backdrop glow; reduced-motion respected.
- `extension/popup/popup.css`: palette, orange primary buttons, edition label.
- `web/style.css`: palette, inverted-ink buttons fixed to orange with dark text, hard-coded cobalt replaced with orange, moon, background glow.

**Verified:** website rendered at 1440×900 and 390×844 with Playwright; 0 console errors; dark theme and contrast look good.

**Not verified / known issues:**
- Extension overlay, Mission Control and popup were not rendered (CSS only).
- The `.sieve-pr-pill` on GitHub pages is styled inside `content.js` and was left unchanged, to avoid colliding with the other session's edits.
- The website's embedded product screenshot is still the old light UI.
- One blue text block ("Everything Sieve reads") may come from inline styles and was not re-checked.
