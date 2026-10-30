// Sieve Workspace — PR Intelligence Workspace
// A centered floating overlay above the Command Center (or the PR page), rendered in the shared Shadow DOM.
// One overlay per shadow root: opening another PR while it is open swaps the content in place.
// All PR text is untrusted and is only ever set through textContent (el()).

window.SievePRIntelligence = (function () {
  "use strict";

  const CLOSE_MS = 220;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STATUS = { fail: ["✕", "Doesn't check out"], warn: ["!", "Needs attention"], info: ["i", "Context"], pass: ["✓", "Verified"] };
  const SOURCE = { repository: "Repository", github: "GitHub data", model: "Model opinion" };
  const VERDICT = { ready: "Ready for review", "needs-work": "Needs work", "low-effort": "Low-effort signals" };

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  const safeUrl = (u) => (typeof u === "string" && /^https:\/\/github\.com\//.test(u) ? u : null);
  const ghLink = (href, text, cls = "sieve-ws-link") => (safeUrl(href) ? el("a", { href, target: "_blank", rel: "noopener", class: cls, text }) : null);

  // ---------------------------------------------------------------- overlay lifecycle
  const state = new WeakMap(); // shadowRoot -> { backdrop, dialog, body, trigger, token, onClose, prevOverflow }

  function ensureStyles(shadowRoot) {
    if (!shadowRoot.querySelector('link[href*="workspace.css"]')) {
      shadowRoot.prepend(el("link", { rel: "stylesheet", href: chrome.runtime.getURL("ui/workspace.css") }));
    }
  }

  function focusables(root) {
    return [...root.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => n.getClientRects().length > 0);
  }

  function mount(shadowRoot, trigger, onClose) {
    let s = state.get(shadowRoot);
    if (s && s.backdrop.isConnected && !s.closing) {
      if (trigger) s.trigger = trigger; // switching PRs keeps the window; focus returns to the newest trigger
      if (onClose) s.onClose = onClose;
      return s;
    }
    ensureStyles(shadowRoot);
    const titleId = "sieve-ws-title";
    const body = el("div", { class: "sieve-ws-scroll" });
    const dialog = el("section", { class: "sieve-ws", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" }, [body]);
    const backdrop = el("div", { class: "sieve-ws-backdrop" }, [dialog]);
    s = { root: shadowRoot, backdrop, dialog, body, trigger, token: 0, onClose, titleId, prevOverflow: document.documentElement.style.overflow };
    state.set(shadowRoot, s);

    // click outside closes, unless the maintainer has edited the response draft (avoid losing their words)
    backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop && !s.dirty) close(shadowRoot); });
    s.onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(shadowRoot); return; }
      if (e.key !== "Tab") return;
      const items = focusables(dialog);
      if (!items.length) { e.preventDefault(); dialog.focus(); return; }
      const active = shadowRoot.activeElement;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (active === first || !dialog.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !dialog.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", s.onKey, true);
    document.documentElement.style.overflow = "hidden"; // lock page scroll behind the overlay
    shadowRoot.append(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("open"));
    return s;
  }

  function close(shadowRoot) {
    const s = state.get(shadowRoot);
    if (!s || !s.backdrop.isConnected || s.closing) return;
    s.closing = true;
    s.token++; // ignore any in-flight load
    document.removeEventListener("keydown", s.onKey, true);
    document.documentElement.style.overflow = s.prevOverflow;
    s.backdrop.classList.remove("open");
    s.backdrop.classList.add("closing");
    const done = () => {
      s.backdrop.remove();
      if (state.get(shadowRoot) === s) state.delete(shadowRoot);
      if (s.trigger && s.trigger.isConnected) s.trigger.focus({ preventScroll: true });
      s.onClose?.();
    };
    if (reducedMotion()) done(); else setTimeout(done, CLOSE_MS);
  }

  function isOpen(shadowRoot) {
    const s = shadowRoot && state.get(shadowRoot);
    return Boolean(s && s.backdrop.isConnected && !s.closing);
  }

  // The command center re-renders its shadow root on SPA navigation; it calls this to keep an open overlay alive.
  function overlayNode(shadowRoot) {
    return isOpen(shadowRoot) ? state.get(shadowRoot).backdrop : null;
  }

  function setBody(s, nodes) {
    s.body.replaceChildren(...nodes.filter(Boolean));
    s.body.scrollTop = 0;
  }

  function header(s, { eyebrow, title, meta, links = [], verdict, score }) {
    const navLinks = links.filter(Boolean);
    return el("header", { class: "sieve-ws-head" }, [
      el("div", { class: "sieve-ws-head-main" }, [
        el("p", { class: "sieve-ws-eyebrow", text: eyebrow }),
        el("h2", { id: s.titleId, class: "sieve-ws-title", text: title }),
        meta ? el("p", { class: "sieve-ws-meta", text: meta }) : null,
        navLinks.length ? el("nav", { class: "sieve-ws-links", "aria-label": "Open on GitHub" }, navLinks) : null,
      ]),
      el("div", { class: "sieve-ws-head-side" }, [
        score !== undefined ? el("div", { class: `sieve-ws-score ${verdict || ""}`, "aria-label": `Score ${score} of 100` }, [
          el("strong", { text: String(score) }), el("span", { text: "/100" }),
        ]) : null,
        el("button", { type: "button", class: "sieve-ws-close", "aria-label": "Close PR intelligence", text: "×", onclick: () => close(s.root) }),
      ]),
    ]);
  }

  // ---------------------------------------------------------------- public API
  // open(shadowRoot, { prRef, trigger, load }) shows a loading state, awaits load(), then renders or shows an error.
  async function open(shadowRoot, { prRef, trigger, load, onClose }) {
    const s = mount(shadowRoot, trigger, onClose);
    const token = ++s.token;
    s.dirty = false; // new PR content: nothing typed yet
    setBody(s, [
      header(s, { eyebrow: "Sieve intelligence", title: prRef }),
      el("div", { class: "sieve-ws-state", role: "status" }, [el("span", { class: "sieve-ws-spinner", "aria-hidden": "true" }),
        "Reading the pull request, linked issue and repository graph…"]),
    ]);
    s.dialog.focus({ preventScroll: true });
    try {
      const data = await load();
      if (token !== s.token) return; // superseded by another PR, or closed
      render(s, data);
    } catch (err) {
      if (token !== s.token) return;
      setBody(s, [
        header(s, { eyebrow: "Sieve intelligence", title: prRef }),
        el("div", { class: "sieve-ws-state error", role: "alert" }, [
          el("strong", { text: "Couldn't analyse this pull request" }),
          el("p", { text: err.message || String(err) }),
          el("p", { class: "sieve-ws-hint" }, ["Is the engine running? Start it with ", el("code", { text: "python3 -m sieve --serve" }), "."]),
          el("button", { type: "button", class: "btn-sieve primary", text: "Retry", onclick: () => open(shadowRoot, { prRef, load }) }),
        ]),
      ]);
    }
  }

  // Backwards-compatible entry point: render analysis that is already loaded.
  function openDrawer(shadowRoot, prAnalysis, onClose) {
    const p = prAnalysis.pr || {};
    return open(shadowRoot, { prRef: `${p.owner}/${p.repo}#${p.number}`, load: async () => prAnalysis, onClose });
  }

  // ---------------------------------------------------------------- content
  function block(title, sub, children, cls = "") {
    return el("section", { class: `sieve-ws-block ${cls}` }, [
      el("h3", { text: title }), sub ? el("p", { class: "sieve-ws-sub", text: sub }) : null, ...[].concat(children),
    ]);
  }

  function render(s, d) {
    const p = d.pr || {};
    const impact = d.impact || {};
    const findings = d.findings || [];
    const sum = impact.summary || {};
    const repoUrl = `https://github.com/${p.owner}/${p.repo}`;

    const links = [
      ghLink(p.url, "Conversation ↗"),
      ghLink(p.url && `${p.url}/files`, "Files changed ↗"),
      ...(p.linked_issues || []).map((n) => ghLink(`${repoUrl}/issues/${n}`, `Issue #${n} ↗`)),
    ];

    const count = (st) => findings.filter((f) => f.status === st).length;
    const overview = el("dl", { class: "sieve-ws-overview" }, [
      ["Verdict", VERDICT[d.verdict] || d.verdict], ["Diff", `+${p.additions ?? 0} −${p.deletions ?? 0}`],
      ["Changed files", String(sum.changed_files ?? p.changed_files ?? 0)], ["Depend on it", String(sum.direct_dependents ?? 0)],
      ["Related tests", String(sum.related_test_files ?? 0)], ["Checks", `${count("fail")} fail · ${count("warn")} warn · ${count("pass")} pass`],
    ].map(([k, v]) => el("div", {}, [el("dt", { text: k }), el("dd", { text: v })])));

    // change summary: the files the PR touches, with roles from the impact graph
    const changed = (impact.nodes || []).filter((n) => ["added", "modified", "removed", "renamed"].includes(n.role));
    const changeList = el("ul", { class: "sieve-ws-files" }, changed.slice(0, 12).map((n) => el("li", {}, [
      el("code", { text: n.id || n.path }), el("span", { class: `sieve-ws-role ${n.role}`, text: n.role }),
    ])));

    // blast radius: the existing deterministic SVG
    const topo = el("div", { class: "topo-canvas-mount" });
    if (window.SieveTopology && (impact.nodes || []).length) window.SieveTopology.render(topo, impact);
    else topo.append(el("p", { class: "sieve-ws-sub", text: "No import graph available for this pull request." }));
    const limits = (impact.limitations || []).filter(Boolean);

    // claim vs reality ledger, grouped by outcome
    const ledger = ["fail", "warn", "info", "pass"].map((st) => {
      const items = findings.filter((f) => f.status === st);
      if (!items.length) return null;
      return el("div", { class: "sieve-ws-group" }, [
        el("h4", { class: "sieve-ws-group-title", text: STATUS[st][1] }),
        ...items.map((f) => el("div", { class: "sieve-evidence-item" }, [
          el("div", { class: `sieve-evidence-icon ${st === "pass" ? "pass" : st === "fail" ? "fail" : "warn"}`, text: STATUS[st][0], "aria-hidden": "true" }),
          el("div", { class: "sieve-evidence-text" }, [
            el("h4", {}, [f.title, f.source ? el("span", { class: "sieve-ws-src", text: SOURCE[f.source] || f.source }) : null]),
            f.detail ? el("p", { text: f.detail }) : null,
            (f.evidence || []).length ? el("ul", { class: "sieve-ws-evidence" }, f.evidence.slice(0, 4).map((e) => el("li", {}, [safeUrl(e) ? ghLink(e, e.replace("https://github.com/", "")) : el("code", { text: e })]))) : null,
          ]),
        ])),
      ]);
    });

    // review checklist: high radar risks + the verification plan (recommendations only)
    const steps = [
      ...(impact.risks || []).filter((r) => r.level === "high").map((r) => ({ kind: "Risk", text: r.title, extra: r.evidence?.[0] })),
      ...(impact.plan || []).map((x) => ({ kind: { fix: "Fix", run: "Run", "add-test": "Add test", inspect: "Inspect" }[x.action] || x.action, text: x.text, extra: x.command })),
    ];
    const checklist = el("ol", { class: "sieve-ws-checklist" }, steps.slice(0, 8).map((x, i) => el("li", {}, [
      el("input", { type: "checkbox", id: `sieve-ck-${i}` }),
      el("label", { for: `sieve-ck-${i}` }, [el("span", { class: "sieve-ws-kind", text: x.kind }), x.text, x.extra ? el("code", { text: x.extra }) : null]),
    ])));

    // related work: linked issues, competing PRs, history on the changed files
    const arch = d.archaeology || {};
    const competing = findings.filter((f) => f.check === "competing").flatMap((f) => f.evidence || []);
    const related = [
      ...(p.linked_issues || []).map((n) => el("li", {}, [ghLink(`${repoUrl}/issues/${n}`, `Issue #${n}`), " linked by this PR"])),
      ...competing.map((ref) => el("li", {}, [ghLink(`${repoUrl}/pull/${String(ref).replace("#", "")}`, `PR ${ref}`), " targets the same issue"])),
      ...(arch.candidate_reverts || []).slice(0, 3).map((c) => el("li", {}, ["Possible revert: ", ghLink(c.url, c.sha || "commit"), ` ${c.message || ""}`])),
      ...(arch.candidate_fixes || []).slice(0, 3).map((c) => el("li", {}, ["Earlier fix: ", ghLink(c.url, c.sha || "commit"), ` ${c.message || ""}`])),
      ...(arch.recent_commits || []).slice(0, 4).map((c) => el("li", {}, [ghLink(c.url, c.sha || "commit"), ` ${c.message || ""}`, c.file ? el("span", { class: "sieve-ws-sub", text: ` · ${c.file}` }) : null])),
    ];

    const area = el("textarea", { class: "sieve-composer-area", "aria-label": "Suggested response to the contributor" });
    area.value = d.comment || "";
    area.addEventListener("input", () => { s.dirty = true; });
    const copy = el("button", { type: "button", class: "btn-sieve primary", text: "Copy response" });
    copy.addEventListener("click", () => navigator.clipboard.writeText(area.value)
      .then(() => { copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy response"; }, 1500); })
      .catch(() => { copy.textContent = "Select and copy"; }));

    setBody(s, [
      header(s, {
        eyebrow: `${p.owner}/${p.repo} · pull request #${p.number}`, title: p.title || `#${p.number}`,
        meta: `@${p.author}${p.association && p.association !== "NONE" ? ` · ${p.association.toLowerCase().replaceAll("_", " ")}` : ""} · ${p.merged ? "merged" : p.state || "open"}`,
        links, verdict: d.verdict, score: d.score,
      }),
      el("div", { class: "sieve-ws-grid" }, [
        el("div", { class: "sieve-ws-main" }, [
          block("Overview", null, overview, "contrast"),
          changed.length ? block("Change summary", "Files this pull request touches.", changeList) : null,
          block("Deterministic blast radius", "Every connection comes from an import statement parsed from the repository.", [topo,
            limits.length ? el("p", { class: "sieve-ws-hint", text: limits.join(" · ") }) : null]),
          block("Claim vs reality", "What the pull request says, checked against what it contains.", ledger.some(Boolean) ? ledger.filter(Boolean) : el("p", { class: "sieve-ws-sub", text: "No findings." })),
        ]),
        el("aside", { class: "sieve-ws-side" }, [
          block("Review checklist", "Recommended next steps. Sieve has not run any of them.", steps.length ? checklist : el("p", { class: "sieve-ws-sub", text: "Nothing in the import graph depends on these files." })),
          block("Related work", null, related.length ? el("ul", { class: "sieve-ws-related" }, related) : el("p", { class: "sieve-ws-sub", text: "No linked issues, competing PRs or recent history found." })),
          block("Suggested response", "Draft only. Sieve never posts to GitHub.", [area, el("div", { class: "sieve-ws-actions" }, [copy, ghLink(p.url, "Reply on GitHub ↗", "btn-sieve")])]),
        ]),
      ]),
    ]);
  }

  return { open, openDrawer, close, isOpen, overlayNode };
})();
