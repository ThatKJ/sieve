// Sieve Workspace — Activation experience
// Shown when the maintainer switches to Sieve Workspace, on the first activation in a tab, or when a previous
// initialization failed. Stages are driven by the caller as real work completes; nothing advances on a timer.

window.SieveActivation = (function () {
  "use strict";

  const STAGES = [
    ["github", "Connecting to GitHub"],
    ["repo", "Detecting repository"],
    ["engine", "Connecting to local Sieve Engine"],
    ["data", "Loading repository context"],
    ["workspace", "Preparing your workspace"],
  ];
  const SESSION_KEY = "sieve-workspace-activated";
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return node;
  }

  // The full sequence runs once per tab session, unless the user switches to Sieve on purpose or init failed.
  function shouldShow({ intentional } = {}) {
    if (intentional) return true;
    try { return sessionStorage.getItem(SESSION_KEY) !== "ok"; } catch { return true; }
  }

  function remember(ok) {
    try { sessionStorage.setItem(SESSION_KEY, ok ? "ok" : "failed"); } catch { /* storage blocked: show again next time */ }
  }

  // Character reveal; resolves when the line is fully shown. A cancelled reveal completes immediately.
  function typeInto(node, text, speed, signal) {
    node.setAttribute("aria-label", text);
    if (reducedMotion() || signal.cancelled) { node.textContent = text; return Promise.resolve(); }
    node.textContent = "";
    return new Promise((resolve) => {
      let i = 0;
      signal.finish = () => { clearTimeout(signal.timer); node.textContent = text; resolve(); }; // cancel = settle now
      const tick = () => {
        if (signal.cancelled) { node.textContent = text; return resolve(); }
        node.textContent = text.slice(0, ++i);
        if (i >= text.length) return resolve();
        // natural cadence: a short pause after punctuation, slight jitter otherwise
        signal.timer = setTimeout(tick, /[.,]/.test(text[i - 1]) ? speed * 6 : speed + Math.random() * speed * 0.6);
      };
      signal.timer = setTimeout(tick, speed);
    });
  }

  // start(shadowRoot, { onRetry }) mounts the overlay and returns a controller:
  //   stage(id, "active" | "done" | "error", detail?) · fail(title, detail, help) · complete() · dismiss()
  function start(shadowRoot, { onRetry } = {}) {
    const signal = { cancelled: false, timer: 0 };
    const line1 = el("span", { class: "sieve-act-line1" });
    const line2 = el("span", { class: "sieve-act-line2" });
    const bar = el("span");
    const progress = el("div", { class: "sieve-act-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(STAGES.length), "aria-valuenow": "0", "aria-label": "Steps completed" }, [bar]);
    const list = el("ol", { class: "sieve-act-stages", "aria-live": "polite" });
    const footer = el("div", { class: "sieve-act-footer" });
    const panel = el("section", { class: "sieve-act-panel", role: "dialog", "aria-modal": "true", "aria-label": "Starting Sieve Workspace", tabindex: "-1" }, [
      el("div", { class: "sieve-act-brand" }, [
        el("div", { class: "sieve-act-mark", "aria-hidden": "true" }, [el("span", { class: "ring r1" }), el("span", { class: "ring r2" }), el("span", { class: "core" })]),
        el("span", { class: "sieve-act-word", text: "sieve" }),
      ]),
      el("h2", { class: "sieve-act-headline" }, [line1, line2]),
      progress, list, footer,
    ]);
    const overlay = el("div", { class: "sieve-act-overlay" }, [panel]);
    const rows = new Map();
    let finished = false;
    let gone = false; // overlay stopped (dismissed, failed-and-retried, or completed)

    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); dismiss(); } };
    document.addEventListener("keydown", onKey, true);
    shadowRoot.append(overlay);
    requestAnimationFrame(() => overlay.classList.add("open"));
    panel.focus({ preventScroll: true });

    const headline = typeInto(line1, "Hello, Maintainer.", 55, signal)
      .then(() => typeInto(line2, "Integrating Sieve into GitHub.", 30, signal));

    function stage(id, status, detail) {
      if (finished) return;
      const label = (STAGES.find(([k]) => k === id) || [id, id])[1];
      let row = rows.get(id);
      if (!row) {
        row = el("li", { class: "sieve-act-stage" }, [
          el("span", { class: "sieve-act-dot", "aria-hidden": "true" }),
          el("span", { class: "sieve-act-label", text: label }),
          el("span", { class: "sieve-act-detail" }),
        ]);
        rows.set(id, row);
        list.append(row);
      }
      row.dataset.state = status;
      row.querySelector(".sieve-act-detail").textContent = detail || "";
      const done = [...rows.values()].filter((r) => r.dataset.state === "done").length; // real completed steps only
      progress.setAttribute("aria-valuenow", String(done));
      bar.style.width = `${(done / STAGES.length) * 100}%`;
    }

    function fail(title, detail, help) {
      if (finished) return;
      remember(false);
      panel.classList.add("failed");
      footer.replaceChildren(
        el("div", { class: "sieve-act-error", role: "alert" }, [
          el("strong", { text: title }), el("p", { text: detail }), help ? el("p", { class: "sieve-act-help" }, help) : null,
        ]),
        el("div", { class: "sieve-act-actions" }, [
          el("button", { type: "button", class: "btn-sieve primary", text: "Retry", onclick: () => { teardown(); onRetry?.(); } }),
          el("button", { type: "button", class: "btn-sieve", text: "Dismiss", onclick: dismiss }),
        ]),
      );
      footer.querySelector("button")?.focus();
    }

    async function complete() {
      if (finished) return;
      remember(true);
      // Let the welcome line finish (about 2 s, instant with reduced motion) so it is actually seen.
      // The steps above already show real, completed state; this only paces the closing message.
      await headline;
      await new Promise((r) => setTimeout(r, 700)); // let the finished line be read (a pause, not motion)
      if (gone) return; // dismissed or Sieve disabled while the line was finishing
      line1.textContent = "You're all set.";
      line2.textContent = "Your Sieve workspace is ready.";
      panel.classList.add("done");
      setTimeout(dismiss, reducedMotion() ? 250 : 650); // a beat to read the confirmation, then reveal the Command Center
    }

    function stop() {
      gone = true;
      finished = true;
      signal.cancelled = true;
      signal.finish?.();
      document.removeEventListener("keydown", onKey, true);
    }

    function teardown() { stop(); overlay.remove(); }

    function dismiss() {
      if (gone) return;
      stop();
      overlay.classList.remove("open");
      overlay.classList.add("closing");
      setTimeout(() => overlay.remove(), reducedMotion() ? 0 : 280);
    }

    return { stage, fail, complete, dismiss, get active() { return !finished; } };
  }

  // A no-op controller for silent (re)loads, so callers don't need to branch.
  const silent = { stage() {}, fail() { remember(false); }, complete() { remember(true); }, dismiss() {}, active: false };

  return { start, shouldShow, silent };
})();
