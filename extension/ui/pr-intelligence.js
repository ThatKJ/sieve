// Sieve Workspace — Individual PR Intelligence Drawer Component
// Monochromatic Luxury Design Standard (media_1793397476309_ebda5710.jpg)
// Embedded on github.com/:owner/:repo/pull/:id or opened from Command Center.

window.SievePRIntelligence = (function () {
  "use strict";

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

  function openDrawer(shadowRoot, prAnalysis, onClose) {
    // Backdrop
    const backdrop = el("div", { class: "sieve-drawer-backdrop" });
    const drawer = el("aside", { class: "sieve-drawer", role: "dialog", "aria-modal": "true" });

    const p = prAnalysis.pr || {};
    const score = prAnalysis.score ?? 0;
    const verdict = prAnalysis.verdict || "ready";

    // Header
    const closeBtn = el("button", {
      type: "button",
      class: "drawer-close",
      "aria-label": "Close drawer",
      text: "×",
      onclick: () => {
        backdrop.remove();
        onClose?.();
      }
    });

    const head = el("div", { class: "sieve-drawer-head" }, [
      el("div", { class: "sieve-drawer-title-wrap" }, [
        el("h2", { text: `#${p.number} ${p.title}` }),
        el("p", { text: `By @${p.author} · Score: ${score}/100 (${verdict.replace("-", " ")}) · ${p.additions ?? 0} additions, ${p.deletions ?? 0} deletions` })
      ]),
      closeBtn
    ]);

    // Body
    const body = el("div", { class: "sieve-drawer-body" });

    // 1. PR Blast Radius Topology Block
    const topoBlock = el("div", { class: "sieve-card-block" }, [
      el("h3", { text: "Deterministic Blast Radius (Import DAG)" }),
      el("p", { style: "font-size: 12px; color: var(--sieve-text-secondary); margin-bottom: 12px;", text: "Parsed via Python static AST. Green nodes are test files; black nodes are modified modules; grey nodes are direct downstream dependents." })
    ]);
    const topoCanvas = el("div", { class: "topo-canvas-mount" });
    topoBlock.append(topoCanvas);

    if (window.SieveTopology && prAnalysis.impact) {
      window.SieveTopology.render(topoCanvas, prAnalysis.impact);
    }

    // 2. Claim vs. Reality Evidence Ledger Block
    const findings = prAnalysis.findings || [];
    const ledgerBlock = el("div", { class: "sieve-card-block" }, [
      el("h3", { text: "Claim vs. Reality Evidence Ledger" }),
      el("p", { style: "font-size: 12px; color: var(--sieve-text-secondary); margin-bottom: 12px;", text: "Deterministic verification of contribution claims against the actual code patch." })
    ]);

    const findingsList = el("div", { style: "display: flex; flex-direction: column;" });
    if (findings.length > 0) {
      findings.forEach((f) => {
        const isPass = f.status === "pass";
        const iconClass = isPass ? "pass" : "warn";
        const iconSymbol = isPass ? "✓" : "!";

        const item = el("div", { class: "sieve-evidence-item" }, [
          el("div", { class: `sieve-evidence-icon ${iconClass}`, text: iconSymbol }),
          el("div", { class: "sieve-evidence-text" }, [
            el("h4", { text: f.title }),
            el("p", { text: f.detail || f.message || "" })
          ])
        ]);
        findingsList.append(item);
      });
    } else {
      findingsList.append(el("div", { style: "font-size: 12.5px; color: var(--sieve-text-secondary);", text: "No convention or testing risks detected." }));
    }
    ledgerBlock.append(findingsList);

    // 3. Suggested Contributor Response Composer
    const comment = prAnalysis.comment || `Thanks @${p.author} for the contribution! The changes look clean and pass our architectural safety gates.`;
    const copyBtn = el("button", {
      type: "button",
      class: "btn-sieve primary",
      text: "📋 Copy Response",
      onclick: () => {
        const composerText = drawer.querySelector(".sieve-composer-area")?.value || comment;
        navigator.clipboard.writeText(composerText).then(() => {
          copyBtn.textContent = "Copied ✓";
          setTimeout(() => { copyBtn.textContent = "📋 Copy Response"; }, 1500);
        });
      }
    });

    const composerBlock = el("div", { class: "sieve-card-block" }, [
      el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;" }, [
        el("h3", { style: "margin-bottom: 0;", text: "Suggested Maintainer Response" }),
        copyBtn
      ]),
      el("p", { style: "font-size: 12px; color: var(--sieve-text-secondary); margin-bottom: 10px;", text: "Pre-filled based on verified evidence. Sieve never posts automatically." }),
      el("textarea", {
        class: "sieve-composer-area",
        text: comment
      })
    ]);

    body.append(topoBlock, ledgerBlock, composerBlock);
    drawer.append(head, body);
    backdrop.append(drawer);

    // Close on backdrop click or ESC key
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
        onClose?.();
      }
    });

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        backdrop.remove();
        window.removeEventListener("keydown", onKeyDown);
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    shadowRoot.append(backdrop);
  }

  return { openDrawer };
})();
