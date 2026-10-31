// Sieve Workspace — Pure SVG PR Impact Topology Renderer
// Zero external libraries. Deterministic column DAG layout for PR Blast Radius.

window.SieveTopology = (function () {
  "use strict";

  function svgEl(tag, attrs = {}, children = []) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function render(container, impactData, onSelectNode) {
    container.replaceChildren();
    const nodes = impactData?.nodes || [];
    const edges = impactData?.edges || [];

    if (!nodes.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <div class="empty-icon">🛡️</div>
        <div class="empty-title">Isolated Change — Zero Code Blast Radius</div>
        <div class="empty-sub">None of the files changed in this pull request are imported by other modules in this repository.</div>
      `;
      container.append(empty);
      return;
    }

    const colUpstream = [];
    const colChanged = [];
    const colDependents = [];
    const colTests = [];

    for (const n of nodes) {
      if (n.is_test || n.role === "test-inferred") {
        colTests.push(n);
      } else if (n.role === "dependency") {
        colUpstream.push(n);
      } else if (["modified", "added", "renamed", "removed"].includes(n.role)) {
        colChanged.push(n);
      } else {
        colDependents.push(n);
      }
    }

    const columns = [];
    if (colUpstream.length) columns.push({ id: "upstream", label: "UPSTREAM DEPS", items: colUpstream });
    columns.push({ id: "changed", label: "CHANGED IN PR", items: colChanged });
    if (colDependents.length) columns.push({ id: "dependents", label: "DIRECT DEPENDENTS", items: colDependents });
    if (colTests.length) columns.push({ id: "tests", label: "TEST CONSUMERS", items: colTests });

    const K = columns.length;
    const CARD_W = 200;
    const CARD_H = 42;
    const GAP_X = Math.max(48, Math.floor((800 - 64 - K * CARD_W) / Math.max(1, K - 1)));
    const SVG_W = Math.max(760, 64 + K * CARD_W + (K - 1) * GAP_X);

    const Y_START = 52;
    const STEP_Y = CARD_H + 14;
    const maxItems = Math.max(1, ...columns.map((c) => c.items.length));
    const SVG_H = Math.max(340, Y_START + maxItems * STEP_Y + 30);

    const nodePos = new Map();
    columns.forEach((col, cIdx) => {
      const colX = 24 + cIdx * (CARD_W + GAP_X);
      col.items.forEach((item, iIdx) => {
        const itemY = Y_START + iIdx * STEP_Y;
        nodePos.set(item.id, {
          x: colX,
          y: itemY,
          w: CARD_W,
          h: CARD_H,
          node: item,
          colId: col.id
        });
      });
    });

    const svg = svgEl("svg", {
      viewBox: `0 0 ${SVG_W} ${SVG_H}`,
      width: "100%",
      height: SVG_H,
      style: "display: block; user-select: none; background: var(--sieve-surface-secondary, #faf9f6); border-radius: 12px; border: 1px solid var(--sieve-border-subtle, rgba(29,29,31,0.1));"
    });

    // Defs & Arrow markers
    const defs = svgEl("defs", {}, [
      svgEl("marker", {
        id: "sieve-arrow",
        viewBox: "0 0 10 10",
        refX: "8",
        refY: "5",
        markerWidth: "6",
        markerHeight: "6",
        orient: "auto-start-reverse"
      }, [
        svgEl("path", { d: "M 0 1.5 L 8 5 L 0 8.5 z", fill: "rgba(29, 29, 31, 0.4)" })
      ]),
      svgEl("marker", {
        id: "sieve-arrow-active",
        viewBox: "0 0 10 10",
        refX: "8",
        refY: "5",
        markerWidth: "7",
        markerHeight: "7",
        orient: "auto-start-reverse"
      }, [
        svgEl("path", { d: "M 0 1.5 L 8 5 L 0 8.5 z", fill: "#2f5bea" })
      ])
    ]);
    svg.append(defs);

    // Column Headers
    columns.forEach((col, cIdx) => {
      const colX = 24 + cIdx * (CARD_W + GAP_X);
      svg.append(
        svgEl("text", {
          x: colX + CARD_W / 2,
          y: 28,
          "text-anchor": "middle",
          fill: "#6e6d68",
          "font-size": "10.5px",
          "font-family": "ui-monospace, monospace",
          "font-weight": "600",
          "letter-spacing": "0.06em"
        }, [`${col.label} (${col.items.length})`])
      );
    });

    // Edges
    const edgesGroup = svgEl("g", { class: "topo-edges" });
    const edgeMap = [];

    edges.forEach((edge) => {
      const pSrc = nodePos.get(edge.source);
      const pTgt = nodePos.get(edge.target);
      if (!pSrc || !pTgt) return;

      let x1, y1, x2, y2;
      if (pTgt.x < pSrc.x) {
        x1 = pTgt.x + CARD_W;
        y1 = pTgt.y + CARD_H / 2;
        x2 = pSrc.x;
        y2 = pSrc.y + CARD_H / 2;
      } else if (pSrc.x < pTgt.x) {
        x1 = pSrc.x + CARD_W;
        y1 = pSrc.y + CARD_H / 2;
        x2 = pTgt.x;
        y2 = pTgt.y + CARD_H / 2;
      } else {
        x1 = pSrc.x + CARD_W;
        y1 = pSrc.y + CARD_H / 2;
        x2 = pTgt.x + CARD_W;
        y2 = pTgt.y + CARD_H / 2;
      }

      const dx = Math.max(30, Math.abs(x2 - x1) * 0.45);
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      const pathEl = svgEl("path", {
        d,
        stroke: "rgba(29, 29, 31, 0.22)",
        "stroke-width": "1.5px",
        fill: "none",
        "marker-end": "url(#sieve-arrow)",
        "data-source": edge.source,
        "data-target": edge.target,
        style: "transition: stroke 150ms, stroke-width 150ms, opacity 150ms;"
      }, [
        svgEl("title", {}, [`${edge.source} -> ${edge.target} (${edge.stmt || ""})`])
      ]);

      edgesGroup.append(pathEl);
      edgeMap.push({ el: pathEl, edge });
    });
    svg.append(edgesGroup);

    // Nodes
    const nodesGroup = svgEl("g", { class: "topo-nodes" });
    const nodeEls = new Map();

    nodePos.forEach((pos, id) => {
      const n = pos.node;
      const role = n.role || (n.is_test ? "test-inferred" : "direct");
      const parts = n.path.split("/");
      const fileName = parts.pop();
      const dirName = parts.length ? parts.join("/") + "/" : "";

      const badgeText = {
        modified: "MOD", added: "ADD", removed: "DEL", renamed: "REN",
        direct: "DEP", indirect: "INDIR", dependency: "UP", "test-inferred": "TEST"
      }[role] || "DEP";

      const accentColor = {
        modified: "#171717", added: "#2e7d32", removed: "#c62828",
        direct: "#777571", indirect: "#a19f9a", dependency: "#777571", "test-inferred": "#2e7d32"
      }[role] || "#777571";

      const g = svgEl("g", {
        tabindex: "0",
        style: "cursor: pointer; outline: none; transition: transform 150ms, opacity 150ms;"
      }, [
        svgEl("rect", {
          x: pos.x, y: pos.y, width: pos.w, height: pos.h, rx: 7, ry: 7,
          fill: "var(--sieve-surface-elevated, #ffffff)", stroke: "var(--sieve-border-subtle, rgba(29, 29, 31, 0.15))", "stroke-width": "1"
        }),
        svgEl("rect", {
          x: pos.x, y: pos.y, width: 4, height: pos.h, rx: 2, ry: 2, fill: accentColor
        }),
        svgEl("text", {
          x: pos.x + 12, y: pos.y + 18,
          fill: "var(--sieve-text-primary, #1d1d1f)", "font-size": "12px", "font-family": "ui-monospace, monospace", "font-weight": "600"
        }, [fileName]),
        svgEl("text", {
          x: pos.x + 12, y: pos.y + 32,
          fill: "var(--sieve-text-muted, #6e6d68)", "font-size": "10px", "font-family": "ui-monospace, monospace"
        }, [dirName || "(root)"]),
        svgEl("rect", {
          x: pos.x + pos.w - 44, y: pos.y + 12, width: 36, height: 18, rx: 4, ry: 4,
          fill: "var(--sieve-surface-secondary, rgba(29, 29, 31, 0.06))"
        }),
        svgEl("text", {
          x: pos.x + pos.w - 26, y: pos.y + 24, "text-anchor": "middle",
          fill: accentColor, "font-size": "9px", "font-family": "ui-monospace, monospace", "font-weight": "700"
        }, [badgeText])
      ]);

      g.addEventListener("click", () => {
        highlightNode(id);
        onSelectNode?.(n);
      });

      nodesGroup.append(g);
      nodeEls.set(id, { g, n, pos });
    });
    svg.append(nodesGroup);

    let activeId = null;
    function highlightNode(id) {
      if (activeId === id) {
        activeId = null;
        nodeEls.forEach(({ g }) => { g.style.opacity = "1"; g.querySelector("rect").setAttribute("stroke", "rgba(29,29,31,0.15)"); });
        edgeMap.forEach(({ el }) => { el.style.opacity = "1"; el.setAttribute("stroke", "rgba(29,29,31,0.22)"); el.setAttribute("marker-end", "url(#sieve-arrow)"); });
        return;
      }

      activeId = id;
      const inbound = edges.filter((e) => e.target === id);
      const outbound = edges.filter((e) => e.source === id);
      const connected = new Set([id, ...inbound.map((e) => e.source), ...outbound.map((e) => e.target)]);

      nodeEls.forEach(({ g }, nId) => {
        if (nId === id) {
          g.style.opacity = "1";
          g.querySelector("rect").setAttribute("stroke", "#2f5bea");
          g.querySelector("rect").setAttribute("stroke-width", "2");
        } else if (connected.has(nId)) {
          g.style.opacity = "1";
          g.querySelector("rect").setAttribute("stroke", "#2f5bea");
          g.querySelector("rect").setAttribute("stroke-width", "1.5");
        } else {
          g.style.opacity = "0.2";
          g.querySelector("rect").setAttribute("stroke", "rgba(29,29,31,0.15)");
        }
      });

      edgeMap.forEach(({ el, edge }) => {
        if (edge.source === id || edge.target === id) {
          el.style.opacity = "1";
          el.setAttribute("stroke", "#2f5bea");
          el.setAttribute("stroke-width", "2.5px");
          el.setAttribute("marker-end", "url(#sieve-arrow-active)");
        } else {
          el.style.opacity = "0.15";
          el.setAttribute("stroke", "rgba(29,29,31,0.22)");
          el.setAttribute("marker-end", "url(#sieve-arrow)");
        }
      });
    }

    container.append(svg);
  }

  async function exportPng(svgOrContainer) {
    let svg = svgOrContainer;
    if (svg && svg.nodeName !== "svg") {
      svg = svg.querySelector("svg");
    }
    if (!svg) {
      throw new Error("No SVG impact topology element found to export.");
    }

    const clone = svg.cloneNode(true);
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    const width = Math.max(800, parseInt(svg.getAttribute("width") || svg.viewBox?.baseVal?.width || 800, 10));
    const height = Math.max(400, parseInt(svg.getAttribute("height") || svg.viewBox?.baseVal?.height || 400, 10));
    clone.setAttribute("width", width);
    clone.setAttribute("height", height);
    clone.style.background = "#faf9f6";

    const svgXml = new XMLSerializer().serializeToString(clone);
    const dataUri = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(svgXml)));

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#faf9f6";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const pngDataUrl = canvas.toDataURL("image/png");
          const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, "");
          resolve({
            dataUrl: pngDataUrl,
            base64: base64Data,
            width,
            height
          });
        } catch (err) {
          reject(new Error("Canvas rasterization failed: " + err.message));
        }
      };
      img.onerror = () => {
        reject(new Error("Failed to load SVG into raster image for Gemma analysis."));
      };
      img.src = dataUri;
    });
  }

  return { render, exportPng };
})();

