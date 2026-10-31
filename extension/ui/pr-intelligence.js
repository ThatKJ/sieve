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

  function buildVisualIntelligence(p, impact, findings, topo) {
    const prRef = `${p.owner}/${p.repo}#${p.number}`;
    const headSha = p.head_sha || "";

    const viContainer = el("div", { class: "sieve-vi-block" });

    const head = el("div", { class: "sieve-vi-head" }, [
      el("div", { class: "sieve-vi-title-box" }, [
        el("h4", {}, [
          el("span", { text: "🔮" }),
          "Visual Architecture Intelligence"
        ]),
        el("p", { text: "Multimodal reasoning over the repository impact graph and deterministic AST evidence." })
      ]),
      el("div", { class: "sieve-vi-model-badge" }, [
        el("span", { class: "sieve-vi-dot" }),
        "gemma-4-26b-a4b-it"
      ])
    ]);

    const contentBox = el("div", { class: "sieve-vi-content-box" });

    const triggerBox = el("div", { class: "sieve-vi-trigger-box" }, [
      el("button", {
        type: "button",
        class: "btn-sieve primary",
        text: "Analyze Architecture with Gemma 4",
        onclick: () => runAnalysis()
      }),
      el("span", {
        class: "sieve-vi-hint",
        text: "Exports this blast radius graph as PNG and transmits it alongside AST dependencies in a single multimodal inference request."
      })
    ]);

    contentBox.append(triggerBox);
    viContainer.append(head, contentBox);

    async function runAnalysis() {
      contentBox.replaceChildren(
        el("div", { class: "sieve-vi-loading" }, [
          el("span", { class: "sieve-ws-spinner", "aria-hidden": "true" }),
          "Rasterizing topology graph & analyzing with gemma-4-26b-a4b-it…"
        ])
      );

      try {
        let imageB64 = "";
        let imgMeta = null;
        if (window.SieveTopology && window.SieveTopology.exportPng) {
          const raster = await window.SieveTopology.exportPng(topo);
          imageB64 = raster.base64;
          imgMeta = { width: raster.width, height: raster.height, dataUrl: raster.dataUrl };
        } else {
          throw new Error("SieveTopology.exportPng is unavailable.");
        }

        chrome.runtime.sendMessage({
          type: "ANALYZE_GEMMA_VISUAL",
          image_b64: imageB64,
          pr_ref: prRef
        }, (res) => {
          if (!res || !res.ok) {
            const errMsg = res?.error || "Gemma 4 visual intelligence request failed.";
            contentBox.replaceChildren(
              el("div", { class: "sieve-act-footer" }, [
                el("div", { class: "sieve-act-error" }, [
                  el("strong", { text: "Analysis Unsuccessful" }),
                  el("p", { text: errMsg }),
                  errMsg.includes("key") ? el("p", { class: "sieve-act-help", text: "Add GEMMA_API_KEY to your .env file and restart `python3 -m sieve --serve`." }) : null,
                  el("div", { class: "sieve-act-actions" }, [
                    el("button", { type: "button", class: "btn-sieve primary", text: "Retry", onclick: () => runAnalysis() })
                  ])
                ])
              ])
            );
            return;
          }

          renderResults(res.data, imgMeta);
        });
      } catch (err) {
        contentBox.replaceChildren(
          el("div", { class: "sieve-act-error" }, [
            el("strong", { text: "Rasterization failed" }),
            el("p", { text: err.message || String(err) }),
            el("button", { type: "button", class: "btn-sieve", text: "Retry", onclick: () => runAnalysis() })
          ])
        );
      }
    }

    function renderResults(data, imgMeta) {
      const diag = data.diagnostic || {};
      const grounding = data.grounding || {};
      const risks = data.potential_risks || [];
      const tests = data.missing_test_scenarios || [];
      const implications = data.architectural_implications || [];

      const resultNodes = [];

      if (imgMeta?.dataUrl) {
        const previewRow = el("div", { class: "sieve-vi-preview-bar" }, [
          el("span", { text: `Attached Topology Image (${imgMeta.width}×${imgMeta.height} PNG)` }),
          el("img", { src: imgMeta.dataUrl, alt: "Rasterized Topology Graph", class: "sieve-vi-preview-thumb" })
        ]);
        resultNodes.push(previewRow);
      }

      if (data.summary) {
        resultNodes.push(el("div", { class: "sieve-vi-summary", text: data.summary }));
      }

      if (implications.length) {
        resultNodes.push(el("div", { class: "sieve-vi-section" }, [
          el("h5", { class: "sieve-vi-section-title", text: "Architectural Implications" }),
          el("ul", { class: "sieve-ws-files" }, implications.map((imp) => el("li", { text: imp })))
        ]));
      }

      if (risks.length) {
        resultNodes.push(el("div", { class: "sieve-vi-section" }, [
          el("h5", { class: "sieve-vi-section-title", text: "Potential Architectural Risks" }),
          el("div", { class: "sieve-vi-list" }, risks.map((r) => el("div", { class: "sieve-vi-risk-card" }, [
            el("div", { class: "sieve-vi-risk-header" }, [
              el("strong", { text: r.title || "Risk" }),
              el("div", { style: "display: flex; gap: 6px;" }, [
                el("span", { class: `sieve-vi-pill ${r.severity || "medium"}`, text: r.severity || "medium" }),
                el("span", { class: `sieve-vi-pill ${r.verified ? "verified" : "hypothesis"}`, text: r.verified ? "Verified in AST" : "Model Hypothesis" })
              ])
            ]),
            el("p", { class: "sieve-vi-desc", text: r.explanation || "" }),
            r.evidence ? el("code", { style: "font-size: 11px; color: var(--sieve-text-secondary);", text: `Citation: ${r.evidence}` }) : null
          ])))
        ]));
      }

      if (tests.length) {
        resultNodes.push(el("div", { class: "sieve-vi-section" }, [
          el("h5", { class: "sieve-vi-section-title", text: "Suggested Missing Test Scenarios" }),
          el("div", { class: "sieve-vi-list" }, tests.map((t) => el("div", { class: "sieve-vi-test-card" }, [
            el("div", { class: "sieve-vi-test-header" }, [
              el("code", { text: t.target || "Module" }),
              el("span", { class: "sieve-vi-pill low", text: t.test_type || "test" })
            ]),
            el("p", { class: "sieve-vi-desc", text: t.scenario || "" })
          ])))
        ]));
      }

      resultNodes.push(el("div", { class: "sieve-vi-diag-bar", text: `Inference: ${diag.model_id || "gemma-4-26b-a4b-it"} · Image: ${diag.image_dimensions || "PNG"} (${diag.image_bytes || 0} bytes) · Grounding: ${grounding.status || "verified"} (${grounding.verified_symbols_cited || 0} symbols)` }));

      const chatBox = buildChatBox(prRef, headSha);
      resultNodes.push(chatBox);

      contentBox.replaceChildren(el("div", { class: "sieve-vi-content" }, resultNodes));
    }

    function buildChatBox(repoRef, headSha) {
      const box = el("div", { class: "sieve-vi-chat-box" });
      const historyEl = el("div", { class: "sieve-vi-history" });

      const quickChips = el("div", { class: "sieve-vi-quick-chips" }, [
        "Which test should I run first?",
        "Why are downstream modules affected?",
        "What are the contract breaking risks?"
      ].map((q) => el("button", {
        type: "button",
        class: "sieve-vi-chip",
        text: q,
        onclick: () => sendQuestion(q)
      })));

      const input = el("input", {
        type: "text",
        class: "sieve-vi-chat-input",
        placeholder: "Ask Gemma 4 about this pull request architecture…"
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          sendQuestion(input.value.trim());
          input.value = "";
        }
      });

      const sendBtn = el("button", {
        type: "button",
        class: "btn-sieve",
        text: "Ask",
        onclick: () => {
          if (input.value.trim()) {
            sendQuestion(input.value.trim());
            input.value = "";
          }
        }
      });

      const inputRow = el("div", { class: "sieve-vi-input-row" }, [input, sendBtn]);

      box.append(
        el("strong", { style: "font-size: 12px; color: var(--sieve-text-primary);", text: "Ask Gemma 4 Follow-up" }),
        quickChips,
        historyEl,
        inputRow
      );

      function sendQuestion(q) {
        historyEl.append(el("div", { class: "sieve-vi-msg user", text: q }));
        const loadingMsg = el("div", { class: "sieve-vi-msg assistant", text: "Reasoning with Gemma 4…" });
        historyEl.append(loadingMsg);
        historyEl.scrollTop = historyEl.scrollHeight;

        chrome.runtime.sendMessage({
          type: "CHAT_GEMMA_VISUAL",
          repo_ref: repoRef,
          head_sha: headSha,
          message: q
        }, (res) => {
          if (!res || !res.ok) {
            loadingMsg.textContent = res?.error || "Gemma 4 chat failed.";
            loadingMsg.style.color = "var(--sieve-status-fail)";
          } else {
            loadingMsg.textContent = res.data.reply || "No response received.";
          }
          historyEl.scrollTop = historyEl.scrollHeight;
        });
      }

      return box;
    }

    return viContainer;
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
          buildVisualIntelligence(p, impact, findings, topo),
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
