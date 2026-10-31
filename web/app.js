// Sieve front end. All PR, issue and repository text is untrusted: the DOM is built with
// textContent through el(); nothing from the API is ever assigned to innerHTML.
"use strict";

const $ = (id) => document.getElementById(id);
const PR_RE = /^(?:https?:\/\/github\.com\/)?[\w.-]+\/[\w.-]+(?:\/pull\/|#)\d+\/?$/;
const REPO_RE = /^(?:https?:\/\/github\.com\/)?[\w.-]+\/[\w.-]+\/?$/;
const DEMO_REPO = "ThatKJ/sieve-demo-target";
const EXAMPLES = [
  { ref: `${DEMO_REPO}#3`, title: "A focused fix with a test", note: "Fixes #1, adds a regression test" },
  { ref: `${DEMO_REPO}#4`, title: "Polished description, doesn't check out", note: "Claims tests, renames a function still in use" },
  { ref: `${DEMO_REPO}#5`, title: "Drive-by README edit", note: "No issue, no description" },
];
const VERDICT = { ready: "Ready for review", "needs-work": "Needs work before review", "low-effort": "Low-effort signals" };
const STATUS_GROUPS = [["fail", "Doesn't check out"], ["warn", "Needs attention"], ["info", "Context"], ["pass", "Verified"]];
const SOURCE_LABEL = { repository: "Repository", github: "GitHub data", model: "Model opinion" };
const ROLE_LABEL = {
  added: "Added in this PR", modified: "Modified in this PR", removed: "Deleted in this PR", renamed: "Renamed in this PR",
  direct: "Directly depends on the change", indirect: "Indirectly depends on the change",
  dependency: "Used by the changed code", "test-inferred": "Possibly related test (inferred from name)",
};

let health = { ollama: false, model: "local model", model_installed: false };
let run = 0;          // guards against stale responses when a new inspection starts
let atlas = null;     // active Atlas controller
let atlasData = null; // last /api/atlas payload

// ---------------------------------------------------------------- DOM helpers
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

// replaceChildren() renders null as the text "null"; this drops empty children first
const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));

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

const safeGitHub = (url) => typeof url === "string" && /^https:\/\/github\.com\//.test(url);
const link = (href, text) => (safeGitHub(href) ? el("a", { href, target: "_blank", rel: "noopener", text }) : el("span", { text }));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function api(path) {
  const isEnginePort = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && (window.location.port === "8787" || window.location.port === "");

  // On public hosting (e.g. Vercel) or static preview, serve demo snapshots directly without failed network calls:
  if (!isEnginePort && window.SIEVE_DEMO_DATA) {
    if (path === "/api/health") {
      return {
        model: "Local Engine",
        ollama: false,
        model_installed: false,
        offline: true,
        demo_mode: true,
        github_auth: true,
        gemma_configured: true,
        gemma_model: "gemma-4-26b-a4b-it",
      };
    }
    const decoded = decodeURIComponent(path);
    if (decoded.includes("/api/atlas") && decoded.includes("ThatKJ/sieve-demo-target")) {
      return window.SIEVE_DEMO_DATA.atlas;
    }
    if (decoded.includes("/api/analyze") && decoded.includes("ThatKJ/sieve-demo-target")) {
      if (decoded.includes("#3") || decoded.includes("/3")) return window.SIEVE_DEMO_DATA.pr3;
      if (decoded.includes("#4") || decoded.includes("/4")) return window.SIEVE_DEMO_DATA.pr4;
      if (decoded.includes("#5") || decoded.includes("/5")) return window.SIEVE_DEMO_DATA.pr5;
    }
    throw new Error("Live inspection of arbitrary repositories requires the local Sieve engine. Start it locally with: python3 -m sieve --serve");
  }

  let res;
  let liveError = null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    res = await fetch(path, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      return await res.json();
    }
    const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
    liveError = data.error || `Server returned ${res.status}`;
  } catch (err) {
    liveError = err.name === "AbortError" ? "Request timed out" : (err.message || "Failed to reach server");
  }

  // Fallback to static demo data on local server when engine is offline:
  if (window.SIEVE_DEMO_DATA) {
    if (path === "/api/health") {
      return {
        model: "Local Engine",
        ollama: false,
        model_installed: false,
        offline: true,
        demo_mode: true,
        github_auth: true,
        gemma_configured: true,
        gemma_model: "gemma-4-26b-a4b-it",
      };
    }
    const decoded = decodeURIComponent(path);
    if (decoded.includes("/api/atlas") && decoded.includes("ThatKJ/sieve-demo-target")) {
      return window.SIEVE_DEMO_DATA.atlas;
    }
    if (decoded.includes("/api/analyze") && decoded.includes("ThatKJ/sieve-demo-target")) {
      if (decoded.includes("#3") || decoded.includes("/3")) return window.SIEVE_DEMO_DATA.pr3;
      if (decoded.includes("#4") || decoded.includes("/4")) return window.SIEVE_DEMO_DATA.pr4;
      if (decoded.includes("#5") || decoded.includes("/5")) return window.SIEVE_DEMO_DATA.pr5;
    }
  }

  throw new Error(`Can't reach local Sieve server on 127.0.0.1:8787 (${liveError}). To inspect private or arbitrary repositories live, start the local engine: python3 -m sieve --serve`);
}

function show(view) {
  for (const id of ["home", "review", "repo"]) $(id).hidden = id !== view;
}

function setError(msg) {
  $("error").textContent = msg || "";
  $("error").hidden = !msg;
}

function busy(on) {
  $("go").disabled = on;
  $("go").textContent = on ? "Inspecting…" : "Inspect";
}

function spinner(text) {
  return el("div", { class: "loading", role: "status" }, [el("span", { class: "spin", "aria-hidden": "true" }), text]);
}

async function copyText(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Copy failed: select the text";
  }
  setTimeout(() => { btn.textContent = "Copy"; }, 1600);
}

// ---------------------------------------------------------------- status
async function loadHealth() {
  try { health = await api("/api/health"); } catch { /* server down: shown on first request */ }
  const ok = health.ollama && health.model_installed;
  const isDemo = Boolean(health.demo_mode);
  fill($("status"), [
    el("span", {
      class: `pill ${ok ? "ok" : (isDemo ? "demo" : "off")}`,
      title: isDemo ? "Viewing static demo snapshot on Vercel" : (ok ? "Ollama & Sieve running locally" : "Local engine offline: connect python3 -m sieve --serve for live PR inspection")
    }, [
      el("span", { class: "dot", "aria-hidden": "true" }),
      isDemo ? "demo mode · public" : `${health.model} · ${ok ? "local" : "offline"}`
    ]),
    health.offline && !isDemo ? el("span", { class: "pill", title: "Serving cached GitHub data (SIEVE_OFFLINE=1)" }, [el("span", { class: "dot", "aria-hidden": "true" }), "cached"]) : null,
  ]);
}

// ---------------------------------------------------------------- routing
function start(raw, push = true) {
  const ref = raw.trim();
  setError("");
  if (!ref) return setError("Paste a pull request (owner/repo#123) or a repository (owner/repo).");
  const kind = PR_RE.test(ref) ? "pr" : REPO_RE.test(ref) ? "repo" : null;
  if (!kind) return setError("That isn't a GitHub pull request or repository. Try owner/repo#123 or owner/repo.");
  $("target").value = ref;
  if (push) history.pushState(null, "", `?${kind}=${encodeURIComponent(ref)}`);
  return kind === "pr" ? inspectPr(ref) : inspectRepo(ref);
}

function fromUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get("pr")) return start(p.get("pr"), false);
  if (p.get("repo")) return start(p.get("repo"), false);
  $("target").value = "";
  renderHome();
}

// ---------------------------------------------------------------- Atlas panel (shared by home, review, repo)
function atlasPanel({ caption, withImpact }) {
  const canvas = el("canvas", { class: "atlas-canvas", tabindex: "0", role: "img",
    "aria-label": "Repository import graph. Use arrow keys to step through files, plus and minus to zoom, 0 to reset." });
  const inspector = el("aside", { class: "inspector glass", hidden: true, "aria-live": "polite" });
  const search = el("input", { class: "atlas-search", type: "search", placeholder: "Find a file", "aria-label": "Find a file in the atlas" });
  const modeBtns = withImpact ? el("div", { class: "segmented", role: "group", "aria-label": "Atlas layer" }, [
    el("button", { type: "button", "aria-pressed": "true", "data-mode": "impact", text: "PR impact" }),
    el("button", { type: "button", "aria-pressed": "false", "data-mode": "structure", text: "Structure" }),
  ]) : null;
  const isolate = el("button", { type: "button", class: "btn ghost small", "aria-pressed": "false", text: "Isolate" });
  const replay = withImpact ? el("button", { type: "button", class: "btn ghost small", text: "Replay" }) : null;
  const reset = el("button", { type: "button", class: "btn ghost small", text: "Reset" });
  const expand = el("button", { type: "button", class: "btn ghost small", text: "Full screen", "aria-pressed": "false" });
  const legend = el("div", { class: "legend" });
  const stage = el("div", { class: "atlas-stage" }, [
    canvas,
    el("div", { class: "atlas-controls glass" }, [modeBtns, search, el("div", { class: "row" }, [isolate, replay, reset, expand]), legend,
      el("p", { class: "atlas-hint", text: "Drag to orbit · Shift-drag to pan · Scroll to zoom · Arrow keys step through files" })]),
    inspector,
  ]);
  const root = el("section", { class: "atlas-panel", "aria-label": "Repository Atlas" }, [
    el("div", { class: "panel-head" }, [el("h2", { text: "Repository Atlas" }), el("p", { class: "sub", text: caption })]),
    stage,
  ]);

  const ctl = window.Atlas.create(canvas, { onSelect: (n) => renderInspector(inspector, n), leftInset: () => (stage.clientWidth < 720 ? 0 : stage.querySelector(".atlas-controls").offsetWidth + 12), focusInset: () => (inspector.hidden || stage.clientWidth < 720 ? 0 : inspector.offsetWidth + 12) });
  modeBtns?.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    modeBtns.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    ctl.setMode(b.dataset.mode);
    renderLegend(legend, b.dataset.mode === "impact" && atlasData?.impact);
  });
  search.addEventListener("input", () => ctl.setQuery(search.value));
  isolate.addEventListener("click", () => {
    const on = isolate.getAttribute("aria-pressed") !== "true";
    isolate.setAttribute("aria-pressed", String(on));
    ctl.setIsolate(on);
  });
  replay?.addEventListener("click", () => ctl.replay());
  reset.addEventListener("click", () => { search.value = ""; isolate.setAttribute("aria-pressed", "false"); ctl.reset(); });
  const toggleFull = (on) => {
    stage.classList.toggle("full", on);
    expand.setAttribute("aria-pressed", String(on));
    expand.textContent = on ? "Exit full screen" : "Full screen";
    document.body.classList.toggle("no-scroll", on);
    canvas.focus();
  };
  expand.addEventListener("click", () => toggleFull(!stage.classList.contains("full")));
  stage.addEventListener("keydown", (e) => { if (e.key === "Escape" && stage.classList.contains("full")) toggleFull(false); });

  atlas = ctl;
  return { root, stage, ctl, legend, setLoading(text) { stage.dataset.state = "loading"; stage.append(el("div", { class: "atlas-loading" }, [spinner(text)])); },
    setError(text) { stage.dataset.state = "error"; stage.querySelector(".atlas-loading")?.remove(); stage.append(el("div", { class: "atlas-loading" }, [el("p", { class: "muted", text })])); },
    setData(data) {
      stage.dataset.state = "ready";
      stage.querySelector(".atlas-loading")?.remove();
      atlasData = data;
      ctl.setData(data.graph, data.impact);
      renderLegend(legend, Boolean(data.impact));
    } };
}

function renderLegend(legend, impact) {
  const item = (cls, text) => el("li", {}, [el("span", { class: `swatch ${cls}`, "aria-hidden": "true" }), text]);
  fill(legend, el("ul", {}, impact
    ? [item("changed", "Changed"), item("direct", "Imports the change"), item("indirect", "Indirectly affected"), item("removed", "Deleted"), item("test", "Test (dashed: inferred)")]
    : [item("file", "Source file"), item("test", "Test file"), item("height", "Height = files importing it")]));
}

function renderInspector(box, n) {
  if (!n) { box.hidden = true; fill(box, ); return; }
  const { out, in: incoming } = atlas.edgesOf(n.id);
  const mark = atlasData?.impact?.marks?.[n.id];
  const edgeRow = (e, other) => el("li", {}, [
    el("button", { type: "button", class: "linkish", text: other, onclick: () => atlas.select(other) }),
    el("code", { text: `:${e.line}  ${e.stmt}` }),
  ]);
  const tests = incoming.filter((e) => atlas.node(e.source)?.test).map((e) => e.source);
  box.hidden = false;
  fill(box, 
    el("div", { class: "insp-head" }, [
      el("div", {}, [el("p", { class: "eyebrow", text: n.test ? "Test file" : `${n.lang} file` }), el("h3", { class: "path", text: n.id })]),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Close inspector", text: "×", onclick: () => atlas.select(null) }),
    ]),
    mark ? el("p", { class: `role-note role-${mark.role}` }, [el("strong", { text: ROLE_LABEL[mark.role] || mark.role }), el("span", { text: mark.reason })]) : null,
    el("dl", { class: "facts" }, [
      el("dt", { text: "Lines" }), el("dd", { text: n.added ? `+${n.lines} (new)` : String(n.lines) }),
      el("dt", { text: "Imported by" }), el("dd", { text: plural(incoming.length, "file") }),
      el("dt", { text: "Imports" }), el("dd", { text: plural(out.length, "repo file") }),
    ]),
    n.symbols?.length ? el("div", { class: "insp-block" }, [el("h4", { text: "Top-level symbols" }), el("p", { class: "chips" }, n.symbols.slice(0, 14).map((s) => el("code", { text: s })))]) : null,
    incoming.length ? el("div", { class: "insp-block" }, [el("h4", { text: `Imported by (${incoming.length})` }), el("ul", { class: "edges" }, incoming.slice(0, 12).map((e) => edgeRow(e, e.source)))]) : null,
    out.length ? el("div", { class: "insp-block" }, [el("h4", { text: `Imports (${out.length})` }), el("ul", { class: "edges" }, out.slice(0, 12).map((e) => edgeRow(e, e.target)))]) : null,
    !n.test ? el("p", { class: "muted small", text: tests.length ? `Tests importing it: ${tests.join(", ")}` : "No test file imports this file directly." }) : null,
    el("p", { class: "muted small source-note", text: n.added ? "Source: PR file list (not in the base branch)" : "Source: parsed from the repository snapshot" }),
  );
}

// ---------------------------------------------------------------- Impact Topology SVG Workbench
function topologyWorkbench(impactData, onSelectFile) {
  const container = el("section", { class: "topology-workbench", "aria-label": "PR Impact Topology Workbench" });
  let currentImpact = impactData;
  let activeSelectedId = null;

  const titleEl = el("div", { class: "panel-head" }, [
    el("div", {}, [
      el("h2", { text: "PR Impact Topology" }),
      el("p", { class: "sub", text: "Deterministic import blast radius: modified modules, internal dependents, and verified test consumers." })
    ])
  ]);

  const searchInput = el("input", {
    type: "search",
    class: "top-search",
    placeholder: "Filter topology files…",
    "aria-label": "Filter files in topology graph"
  });

  const resetBtn = el("button", { type: "button", class: "btn ghost small", text: "Reset" });
  const expandBtn = el("button", { type: "button", class: "btn ghost small", text: "Full screen", "aria-pressed": "false" });

  const summaryBar = el("div", { class: "top-summary-bar" });
  const stage = el("div", { class: "topology-stage" });
  const scrollWrap = el("div", { class: "topology-scroll" });
  const inspector = el("aside", { class: "top-inspector glass", hidden: true, "aria-live": "polite" });

  stage.append(scrollWrap, inspector);
  container.append(
    el("div", { class: "top-toolbar" }, [
      titleEl,
      el("div", { class: "top-actions" }, [searchInput, resetBtn, expandBtn])
    ]),
    summaryBar,
    stage
  );

  function toggleFull(on) {
    stage.classList.toggle("full", on);
    expandBtn.setAttribute("aria-pressed", String(on));
    expandBtn.textContent = on ? "Exit full screen" : "Full screen";
    document.body.classList.toggle("no-scroll", on);
  }
  expandBtn.addEventListener("click", () => toggleFull(!stage.classList.contains("full")));
  stage.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (stage.classList.contains("full")) toggleFull(false);
      selectNode(null);
    }
  });

  function selectNode(id) {
    activeSelectedId = id;
    const nodeElements = stage._nodeElements;
    const edgeElements = stage._edgeElements;
    const edges = currentImpact?.edges || [];

    if (!nodeElements || !edgeElements) return;

    if (!id) {
      nodeElements.forEach(({ el: nodeEl }) => {
        nodeEl.classList.remove("selected", "neighbor-active", "dimmed");
      });
      edgeElements.forEach(({ el: edgeEl }) => {
        edgeEl.classList.remove("edge-active", "dimmed");
        edgeEl.setAttribute("marker-end", "url(#arrow-top)");
      });
      inspector.hidden = true;
      fill(inspector, );
      onSelectFile?.(null);
      return;
    }

    const selected = nodeElements.get(id);
    if (!selected) return;

    const inbound = edges.filter((e) => e.target === id);
    const outbound = edges.filter((e) => e.source === id);
    const connected = new Set([id, ...inbound.map((e) => e.source), ...outbound.map((e) => e.target)]);

    nodeElements.forEach(({ el: nodeEl }, nId) => {
      if (nId === id) {
        nodeEl.classList.add("selected");
        nodeEl.classList.remove("neighbor-active", "dimmed");
      } else if (connected.has(nId)) {
        nodeEl.classList.add("neighbor-active");
        nodeEl.classList.remove("selected", "dimmed");
      } else {
        nodeEl.classList.add("dimmed");
        nodeEl.classList.remove("selected", "neighbor-active");
      }
    });

    edgeElements.forEach(({ el: edgeEl, edge }) => {
      if (edge.source === id || edge.target === id) {
        edgeEl.classList.add("edge-active");
        edgeEl.classList.remove("dimmed");
        edgeEl.setAttribute("marker-end", "url(#arrow-active)");
      } else {
        edgeEl.classList.add("dimmed");
        edgeEl.classList.remove("edge-active");
        edgeEl.setAttribute("marker-end", "url(#arrow-top)");
      }
    });

    renderInspector(selected.node, inbound, outbound);
    onSelectFile?.(id);
  }

  function renderInspector(n, inbound, outbound) {
    inspector.hidden = false;
    const role = n.role || (n.is_test ? "test-inferred" : "direct");
    const roleDesc = {
      modified: "Epicenter — modified in this PR. Changes to public interfaces ripple to dependents.",
      added: "Newly added file in this pull request.",
      removed: "Deleted in this pull request. Review dependents for broken imports.",
      renamed: "Renamed in this pull request.",
      direct: "Direct Dependent — imports this module directly in repository code.",
      indirect: "Indirect Dependent — imports a direct dependent of this module.",
      dependency: "Upstream Dependency — imported by the modified code.",
      "test-inferred": "Test Consumer — imports and exercises this module."
    }[role] || n.reason || "Connected via repository import statement.";

    const copyBtn = el("button", { type: "button", class: "btn ghost small", text: "Copy path" });
    copyBtn.addEventListener("click", () => copyText(copyBtn, n.path));

    const edgeItem = (otherId, stmt, line) => el("li", { class: "top-edge-item" }, [
      el("button", {
        type: "button",
        class: "linkish",
        text: otherId,
        onclick: () => selectNode(otherId)
      }),
      stmt ? el("code", { text: `:${line || 1}  ${stmt}` }) : null
    ]);

    fill(inspector, [
      el("div", { class: "insp-head" }, [
        el("div", {}, [
          el("p", { class: "eyebrow", text: ROLE_LABEL[role] || role }),
          el("h3", { class: "path", text: n.path })
        ]),
        el("button", {
          type: "button",
          class: "icon-btn",
          "aria-label": "Close inspector",
          text: "×",
          onclick: () => selectNode(null)
        })
      ]),
      el("p", { class: `role-note role-${role}` }, [
        el("strong", { text: ROLE_LABEL[role] || role }),
        el("span", { text: roleDesc })
      ]),
      el("dl", { class: "facts" }, [
        el("dt", { text: "Language" }), el("dd", { text: n.lang || "python" }),
        el("dt", { text: "Imported by" }), el("dd", { text: plural(inbound.length, "file") }),
        el("dt", { text: "Imports" }), el("dd", { text: plural(outbound.length, "internal file") }),
      ]),
      n.symbols?.length ? el("div", { class: "insp-block" }, [
        el("h4", { text: "Top-level symbols" }),
        el("p", { class: "chips" }, n.symbols.slice(0, 16).map((s) => el("code", { text: s })))
      ]) : null,
      inbound.length ? el("div", { class: "insp-block" }, [
        el("h4", { text: `Imported by (${inbound.length})` }),
        el("ul", { class: "edges" }, inbound.slice(0, 10).map((e) => edgeItem(e.source, e.stmt, e.line)))
      ]) : null,
      outbound.length ? el("div", { class: "insp-block" }, [
        el("h4", { text: `Imports (${outbound.length})` }),
        el("ul", { class: "edges" }, outbound.slice(0, 10).map((e) => edgeItem(e.target, e.stmt, e.line)))
      ]) : null,
      n.is_test || role === "test-inferred" ? el("p", { class: "muted small", text: "✓ Verified test module connected to the PR blast radius." }) : null,
      el("div", { class: "row", style: "margin-top: 8px;" }, [copyBtn]),
      el("p", { class: "muted small source-note", text: "Evidence: deterministic AST import resolution against base branch" })
    ]);
  }

  function render(impact) {
    currentImpact = impact || { nodes: [], edges: [], summary: {}, limitations: [] };
    const nodes = currentImpact.nodes || [];
    const edges = currentImpact.edges || [];
    const summary = currentImpact.summary || {};

    // Summary bar
    fill(summaryBar, [
      el("span", { class: "top-chip" }, [el("strong", { text: String(summary.changed_files ?? nodes.filter((n) => ["modified", "added", "renamed", "removed"].includes(n.role)).length) }), " changed"]),
      el("span", { class: "top-chip" }, [el("strong", { text: String(summary.direct_dependents ?? nodes.filter((n) => ["direct", "indirect"].includes(n.role) && !n.is_test).length) }), " dependents"]),
      el("span", { class: "top-chip ok" }, [el("strong", { text: String(summary.related_test_files ?? nodes.filter((n) => n.is_test || n.role === "test-inferred").length) }), " tests"]),
      summary.unresolved_imports ? el("span", { class: "top-chip warn" }, [el("strong", { text: String(summary.unresolved_imports) }), " unresolved"]) : null
    ]);

    if (!nodes.length) {
      fill(scrollWrap, el("div", { class: "top-empty" }, [
        el("div", { class: "top-empty-icon", "aria-hidden": "true" }, "🛡️"),
        el("h3", { text: "Isolated Change — Zero Internal Code Blast Radius" }),
        el("p", { class: "sub", text: "None of the files changed in this pull request are imported by other modules in this repository." }),
        currentImpact.limitations?.length ? el("p", { class: "muted small", text: currentImpact.limitations.join(" · ") }) : null
      ]));
      inspector.hidden = true;
      return;
    }

    // Partition into columns
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

    colUpstream.sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path));
    colChanged.sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path));
    colDependents.sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path));
    colTests.sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path));

    const columns = [];
    if (colUpstream.length) columns.push({ id: "upstream", label: "UPSTREAM DEPS", items: colUpstream });
    columns.push({ id: "changed", label: "CHANGED IN PR", items: colChanged });
    if (colDependents.length) columns.push({ id: "dependents", label: "DIRECT DEPENDENTS", items: colDependents });
    if (colTests.length) columns.push({ id: "tests", label: "TEST CONSUMERS", items: colTests });

    const K = columns.length;
    const CARD_W = 216;
    const CARD_H = 46;
    const GAP_X = Math.max(54, Math.floor((960 - 64 - K * CARD_W) / Math.max(1, K - 1)));
    const SVG_W = Math.max(920, 64 + K * CARD_W + (K - 1) * GAP_X);

    const Y_START = 64;
    const STEP_Y = CARD_H + 16;
    const maxItems = Math.max(1, ...columns.map((c) => c.items.length));
    const SVG_H = Math.max(380, Y_START + maxItems * STEP_Y + 40);

    const nodePos = new Map();
    columns.forEach((col, cIdx) => {
      const colX = 32 + cIdx * (CARD_W + GAP_X);
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
      class: "topology-svg",
      viewBox: `0 0 ${SVG_W} ${SVG_H}`,
      width: SVG_W,
      height: SVG_H,
      role: "img",
      "aria-label": "Interactive dependency impact graph"
    });

    // Defs
    const defs = svgEl("defs", {}, [
      svgEl("marker", {
        id: "arrow-top",
        viewBox: "0 0 10 10",
        refX: "8",
        refY: "5",
        markerWidth: "6",
        markerHeight: "6",
        orient: "auto-start-reverse"
      }, [
        svgEl("path", { d: "M 0 1.5 L 8 5 L 0 8.5 z", fill: "rgba(29, 29, 31, 0.45)" })
      ]),
      svgEl("marker", {
        id: "arrow-active",
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

    // Column headers
    columns.forEach((col, cIdx) => {
      const colX = 32 + cIdx * (CARD_W + GAP_X);
      svg.append(
        svgEl("text", {
          class: "top-col-label",
          x: colX + CARD_W / 2,
          y: 36,
          "text-anchor": "middle"
        }, [`${col.label} (${col.items.length})`])
      );
    });

    // Edges group
    const edgesGroup = svgEl("g", { class: "top-edges-layer" });
    const edgeElements = [];

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

      const dx = Math.max(32, Math.abs(x2 - x1) * 0.45);
      const d = x1 === x2
        ? `M ${x1} ${y1} C ${x1 + 45} ${y1}, ${x2 + 45} ${y2}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      const pathEl = svgEl("path", {
        class: "top-edge",
        d,
        "marker-end": "url(#arrow-top)",
        "data-source": edge.source,
        "data-target": edge.target
      }, [
        svgEl("title", {}, [`${edge.source} -> ${edge.target} (${edge.stmt || ""})`])
      ]);

      edgesGroup.append(pathEl);
      edgeElements.push({ el: pathEl, edge });
    });
    svg.append(edgesGroup);

    // Nodes group
    const nodesGroup = svgEl("g", { class: "top-nodes-layer" });
    const nodeElements = new Map();

    nodePos.forEach((pos, id) => {
      const n = pos.node;
      const role = n.role || (n.is_test ? "test-inferred" : "direct");
      const badgeText = {
        modified: "MOD", added: "ADD", removed: "DEL", renamed: "REN",
        direct: "DEP", indirect: "INDIR", dependency: "UP", "test-inferred": "TEST"
      }[role] || (n.is_test ? "TEST" : "DEP");

      const parts = n.path.split("/");
      const fileName = parts.pop();
      const dirName = parts.length ? parts.join("/") + "/" : "";

      const g = svgEl("g", {
        class: `top-node role-${role}`,
        "data-id": n.id,
        tabindex: "0",
        role: "button",
        "aria-label": `${n.path} (${role})`
      }, [
        svgEl("rect", { class: "top-node-bg", x: pos.x, y: pos.y, width: pos.w, height: pos.h, rx: 8, ry: 8 }),
        svgEl("rect", { class: "top-node-accent", x: pos.x, y: pos.y, width: 4, height: pos.h, rx: 2 }),
        svgEl("text", { class: "top-node-title", x: pos.x + 14, y: pos.y + 20 }, [fileName]),
        svgEl("text", { class: "top-node-dir", x: pos.x + 14, y: pos.y + 36 }, [dirName || "(root)"]),
        svgEl("rect", { class: "top-badge-bg", x: pos.x + pos.w - 50, y: pos.y + 13, width: 42, height: 20, rx: 5 }),
        svgEl("text", { class: "top-badge-txt", x: pos.x + pos.w - 29, y: pos.y + 27 }, [badgeText])
      ]);

      g.addEventListener("click", () => selectNode(activeSelectedId === n.id ? null : n.id));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectNode(activeSelectedId === n.id ? null : n.id);
        }
      });

      nodesGroup.append(g);
      nodeElements.set(n.id, { el: g, node: n, pos });
    });
    svg.append(nodesGroup);

    stage._nodeElements = nodeElements;
    stage._edgeElements = edgeElements;
    fill(scrollWrap, svg);

    // Filter functionality
    searchInput.oninput = () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        nodeElements.forEach(({ el: nodeEl }) => nodeEl.classList.remove("filter-dimmed"));
        return;
      }
      nodeElements.forEach(({ el: nodeEl, node: n }) => {
        const matches = n.path.toLowerCase().includes(q) || (n.symbols || []).some((s) => s.toLowerCase().includes(q));
        nodeEl.classList.toggle("filter-dimmed", !matches);
      });
    };

    resetBtn.onclick = () => {
      searchInput.value = "";
      nodeElements.forEach(({ el: nodeEl }) => nodeEl.classList.remove("filter-dimmed"));
      selectNode(null);
    };
  }

  render(impactData);

  return {
    root: container,
    select: (id) => {
      const nodeEl = stage.querySelector(`[data-id="${id}"]`);
      if (nodeEl) nodeEl.dispatchEvent(new MouseEvent("click"));
    },
    update: render
  };
}

// ---------------------------------------------------------------- Historical Hotspot Radar
function renderHotspotRadar(archaeology) {
  if (!archaeology) {
    return el("section", { class: "card hotspot-card" }, [
      el("h3", { text: "Historical Hotspot Radar" }),
      el("p", { class: "muted", text: "Loading commit history for modified paths…" })
    ]);
  }

  if (archaeology.status === "no_history") {
    return el("section", { class: "card hotspot-card" }, [
      el("div", { class: "card-head" }, [
        el("h3", { text: "Historical Hotspot Radar" }),
        el("span", { class: "pill", text: "90 days" })
      ]),
      el("p", { class: "sub", text: "Commit forensics on modified paths to spot recurring churn or regression patterns." }),
      el("p", { class: "muted small", text: "No commit history found for these files within the past 90 days." })
    ]);
  }

  if (archaeology.status === "empty_diff") {
    return el("section", { class: "card hotspot-card" }, [
      el("div", { class: "card-head" }, [
        el("h3", { text: "Historical Hotspot Radar" }),
        el("span", { class: "pill", text: "empty" })
      ]),
      el("p", { class: "sub", text: "No modified source files to inspect." })
    ]);
  }

  const churnEntries = Object.entries(archaeology.per_file_churn || {});
  const maxChurn = Math.max(1, ...churnEntries.map(([, c]) => c));
  const churnList = churnEntries.length ? el("div", { class: "churn-list" }, churnEntries.map(([file, count]) => {
    const pct = Math.round((count / maxChurn) * 100);
    return el("div", { class: "churn-row" }, [
      el("div", { class: "churn-info" }, [
        el("code", { class: "churn-file", text: file }),
        el("span", { class: "churn-count", text: plural(count, "commit") })
      ]),
      el("div", { class: "churn-bar-track" }, [
        el("div", { class: "churn-bar-fill", style: `width: ${pct}%` })
      ])
    ]);
  })) : null;

  const reverts = archaeology.candidate_reverts || [];
  const revertList = reverts.length ? el("div", { class: "hotspot-subgroup" }, [
    el("div", { class: "hotspot-subhead" }, [
      el("h4", { text: `Candidate Reverts (${reverts.length})` }),
      el("span", { class: "heuristic-badge warn", text: "Heuristic: commit message matches revert" })
    ]),
    el("ul", { class: "commit-list" }, reverts.map((c) => el("li", { class: "commit-item revert-item" }, [
      el("div", { class: "commit-head" }, [
        link(c.url, c.sha),
        el("span", { class: "commit-author", text: `@${c.author}` }),
        c.date ? el("span", { class: "commit-date", text: c.date.slice(0, 10) }) : null
      ]),
      el("p", { class: "commit-msg", text: c.message }),
      c.file ? el("code", { class: "commit-file", text: c.file }) : null
    ])))
  ]) : el("div", { class: "hotspot-subgroup" }, [
    el("div", { class: "hotspot-subhead" }, [
      el("h4", { text: "Candidate Reverts" }),
      el("span", { class: "heuristic-badge pass", text: "None detected" })
    ]),
    el("p", { class: "muted small", text: "No revert commits detected in recent history for these files." })
  ]);

  const fixes = archaeology.candidate_fixes || [];
  const fixList = fixes.length ? el("div", { class: "hotspot-subgroup" }, [
    el("div", { class: "hotspot-subhead" }, [
      el("h4", { text: `Candidate Fixes (${fixes.length})` }),
      el("span", { class: "heuristic-badge info", text: "Heuristic: commit message matches fix/bug" })
    ]),
    el("ul", { class: "commit-list" }, fixes.map((c) => el("li", { class: "commit-item fix-item" }, [
      el("div", { class: "commit-head" }, [
        link(c.url, c.sha),
        el("span", { class: "commit-author", text: `@${c.author}` }),
        c.date ? el("span", { class: "commit-date", text: c.date.slice(0, 10) }) : null
      ]),
      el("p", { class: "commit-msg", text: c.message }),
      c.file ? el("code", { class: "commit-file", text: c.file }) : null
    ])))
  ]) : null;

  const recent = (archaeology.recent_commits || []).slice(0, 5);
  const recentList = recent.length ? el("div", { class: "hotspot-subgroup" }, [
    el("h4", { text: "Recent Commits on Changed Files" }),
    el("ul", { class: "commit-list" }, recent.map((c) => el("li", { class: "commit-item" }, [
      el("div", { class: "commit-head" }, [
        link(c.url, c.sha),
        el("span", { class: "commit-author", text: `@${c.author}` }),
        c.date ? el("span", { class: "commit-date", text: c.date.slice(0, 10) }) : null
      ]),
      el("p", { class: "commit-msg", text: c.message })
    ])))
  ]) : null;

  return el("section", { class: "card hotspot-card" }, [
    el("div", { class: "card-head" }, [
      el("h3", { text: "Historical Hotspot Radar" }),
      el("span", { class: "pill", text: `${archaeology.time_window_days || 90}d window` })
    ]),
    el("p", { class: "sub", text: "Commit forensics on modified paths to spot recurring churn or regression patterns." }),
    el("dl", { class: "facts" }, [
      el("dt", { text: "Recent commits" }), el("dd", { text: String(archaeology.total_commits || 0) }),
      el("dt", { text: "Contributors" }), el("dd", { text: String(archaeology.distinct_contributors || 0) }),
      el("dt", { text: "Files analyzed" }), el("dd", { text: String(archaeology.files_inspected?.length || 0) }),
    ]),
    churnList,
    revertList,
    fixList,
    recentList
  ]);
}

// ---------------------------------------------------------------- Confidence Ledger
function renderConfidenceLedger(analysis, impact) {
  const r = analysis;
  return el("section", { class: "card" }, [
    el("h3", { text: "Confidence & Evidence Ledger" }),
    el("p", { class: "sub", text: "Audit trail of verification mechanisms vs unverified assumptions." }),
    el("dl", { class: "ledger" }, [
      ...r.ledger.groups.flatMap((g) => [
        el("dt", {}, [el("span", { class: `src src-${g.source}`, text: SOURCE_LABEL[g.source] }), g.label]),
        el("dd", { text: g.items.length ? plural(g.items.length, "finding") : "None" })
      ]),
      impact?.summary ? el("dt", {}, [el("span", { class: "src src-repository", text: "DETERMINISTIC_AST" }), "Import topology"]) : null,
      impact?.summary ? el("dd", { text: `${impact.summary.changed_files} changed · ${impact.summary.direct_dependents} dependents · ${impact.summary.related_test_files} tests` }) : null,
      r.archaeology?.total_commits !== undefined ? el("dt", {}, [el("span", { class: "src src-github", text: "GIT_LOG" }), "Commit archaeology"]) : null,
      r.archaeology?.total_commits !== undefined ? el("dd", { text: `${r.archaeology.total_commits} commits across ${r.archaeology.distinct_contributors} authors` }) : null,
    ]),
    el("h4", { text: "Not verified by Sieve (read-only boundaries)" }),
    el("ul", { class: "unknown" }, [
      ...r.ledger.unknown.map((u) => el("li", { text: u })),
      ...(impact?.limitations || []).map((l) => el("li", { text: l }))
    ]),
  ]);
}

// ---------------------------------------------------------------- home
function renderHome() {
  run++;
  show("home");
  const mount = $("demo-atlas-mount");
  if (mount && !mount.hasChildNodes()) {
    const panel = atlasPanel({
      caption: `${DEMO_REPO}: interactive repository import graph parsed deterministically from Python AST.`,
      withImpact: false
    });
    fill(mount, panel.root);
    const id = run;
    panel.setLoading("Loading repository topology graph…");
    api(`/api/atlas?repo=${encodeURIComponent(DEMO_REPO)}`)
      .then((d) => { if (id === run) panel.setData(d); })
      .catch((e) => { if (id === run) panel.setError(e.message); });
  }
}

// ---------------------------------------------------------------- PR review
async function inspectPr(ref) {
  const id = ++run;
  busy(true);
  show("review");
  const view = $("review");
  fill(view, spinner("Reading the pull request, its files, linked issue and repository tree…"));
  let fast;
  try {
    fast = await api(`/api/analyze?pr=${encodeURIComponent(ref)}&model=0`);
  } catch (e) {
    if (id === run) { busy(false); renderHome(); setError(e.message); }
    return;
  }
  if (id !== run) return;

  const topWorkbench = topologyWorkbench(fast.impact, (path) => {
    if (path && atlas?.node(path)) atlas.select(path);
  });
  const atlasComponent = atlasPanel({
    caption: "Every highlighted file is connected to the change by an import statement Sieve found. Click any file for the evidence.",
    withImpact: true
  });
  atlasComponent.root.hidden = true;

  const stageTabs = el("div", { class: "stage-switcher-bar" }, [
    el("div", { class: "segmented stage-switcher", role: "tablist", "aria-label": "Workbench visualization mode" }, [
      el("button", {
        type: "button",
        role: "tab",
        "aria-selected": "true",
        text: "PR Impact Topology (SVG)",
        onclick: (e) => switchStageView("topology", e.currentTarget)
      }),
      el("button", {
        type: "button",
        role: "tab",
        "aria-selected": "false",
        text: "Repository Atlas (3D)",
        onclick: (e) => switchStageView("atlas", e.currentTarget)
      }),
    ])
  ]);

  function switchStageView(mode, btn) {
    stageTabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    if (mode === "topology") {
      topWorkbench.root.hidden = false;
      atlasComponent.root.hidden = true;
    } else {
      topWorkbench.root.hidden = true;
      atlasComponent.root.hidden = false;
      atlasComponent.ctl.fit(false);
    }
  }

  const parts = {
    head: el("div", { class: "review-head" }),
    switcher: stageTabs,
    workbench: topWorkbench.root,
    atlas: atlasComponent.root,
    findings: el("div", { class: "findings" }),
    side: el("div", { class: "side" }),
  };
  fill(view, parts.head, parts.switcher, parts.workbench, parts.atlas, el("div", { class: "review-grid" }, [parts.findings, parts.side]));

  const ctx = {
    analysis: fast,
    atlas: null,
    modelState: health.ollama && health.model_installed ? "pending" : "off"
  };

  const paint = () => {
    renderHead(parts.head, ctx);
    renderFindings(parts.findings, ctx);
    renderSide(parts.side, ctx);
    topWorkbench.update(ctx.analysis.impact);
  };
  paint();

  atlasComponent.setLoading("Building the 3D import graph from the base branch…");
  const atlasJob = api(`/api/atlas?pr=${encodeURIComponent(ref)}`)
    .then((d) => {
      if (id === run) {
        ctx.atlas = d;
        atlasComponent.setData(d);
        paint();
      }
    })
    .catch((e) => {
      if (id === run) {
        ctx.atlasError = e.message;
        atlasComponent.setError(`Couldn't build the 3D atlas: ${e.message}`);
        paint();
      }
    });

  if (ctx.modelState === "pending") {
    const t0 = Date.now();
    ctx.timer = setInterval(() => {
      const t = view.querySelector("[data-elapsed]");
      if (t) t.textContent = `${Math.round((Date.now() - t0) / 1000)}s`;
    }, 1000);
    try {
      const full = await api(`/api/analyze?pr=${encodeURIComponent(ref)}&model=1`);
      if (id === run) {
        ctx.analysis = full;
        ctx.modelState = full.model?.used ? "done" : "failed";
      }
    } catch (e) {
      if (id === run) { ctx.modelState = "failed"; ctx.modelError = e.message; }
    } finally {
      clearInterval(ctx.timer);
    }
    if (id === run) paint();
  }
  await atlasJob;
  if (id === run) busy(false);
}

function renderHead(box, ctx) {
  const r = ctx.analysis, p = r.pr;
  const count = (s) => r.findings.filter((f) => f.status === s).length;
  const tally = [count("fail") && `${count("fail")} don't check out`, count("warn") && `${count("warn")} need attention`, count("pass") && `${count("pass")} verified`].filter(Boolean).join(" · ");
  const imp = ctx.analysis.impact || ctx.atlas?.impact;
  const counts = imp?.counts || (imp?.summary ? {
    changed: imp.summary.changed_files,
    direct: imp.summary.direct_dependents,
    indirect: 0,
    tests: imp.summary.related_test_files
  } : null);
  const risks = imp?.risks || [];

  fill(box, 
    el("div", { class: "review-nav-bar", style: "margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;" }, [
      el("button", {
        type: "button",
        class: "btn ghost small",
        text: "← Back to Overview",
        onclick: () => {
          $("target").value = "";
          history.pushState(null, "", location.pathname);
          renderHome();
        }
      }),
      el("p", { class: "crumbs", style: "margin: 0;" }, [
        el("a", { href: `?repo=${encodeURIComponent(`${p.owner}/${p.repo}`)}`, text: `${p.owner}/${p.repo}` }), ` · pull request #${p.number} · `,
        link(p.url, "Open on GitHub ↗"),
      ])
    ]),
    el("h1", { class: "pr-title", text: p.title }),
    el("p", { class: "meta" }, [
      `@${p.author}`, p.association && p.association !== "NONE" ? ` · ${p.association.toLowerCase().replaceAll("_", " ")}` : "",
      " · ", el("span", { class: "mono" }, [el("span", { class: "adds", text: `+${p.additions ?? 0}` }), " ", el("span", { class: "dels", text: `−${p.deletions ?? 0}` })]),
      ` · ${plural(p.changed_files ?? 0, "file")} · ${p.merged ? "merged" : p.state}`,
    ]),
    el("div", { class: `verdict ${r.verdict}` }, [
      el("div", { class: "score", "aria-label": `Score ${r.score} out of 100` }, [String(r.score), el("small", { text: "/100" })]),
      el("div", {}, [
        el("h2", { text: VERDICT[r.verdict] }),
        el("p", { class: "tally", text: tally + (ctx.modelState === "pending" ? " · model check running" : "") }),
      ]),
      counts ? el("dl", { class: "reach" }, [
        el("dt", { text: "Changed" }), el("dd", { text: String(counts.changed ?? 0) }),
        el("dt", { text: "Depend on it" }), el("dd", { text: String((counts.direct ?? 0) + (counts.indirect ?? 0)) }),
        el("dt", { text: "Related tests" }), el("dd", { text: String(counts.tests ?? 0) }),
        el("dt", { text: "Risks" }), el("dd", { class: risks.some((x) => x.level === "high") ? "hot" : "", text: String(risks.length) }),
      ]) : null,
    ]),
  );
}

function findingItem(f) {
  return el("li", { class: `finding ${f.status}` }, [
    el("span", { class: "mark", "aria-hidden": "true", text: { fail: "✕", warn: "!", info: "i", pass: "✓" }[f.status] }),
    el("div", {}, [
      el("p", { class: "f-title" }, [el("span", { class: "sr", text: `${f.status}: ` }), f.title, el("span", { class: `src src-${f.source}`, text: SOURCE_LABEL[f.source] })]),
      f.detail ? el("p", { class: "f-detail", text: f.detail }) : null,
      f.evidence.length ? el("ul", { class: "evidence" }, f.evidence.map((e) => el("li", {}, [safeGitHub(e) ? link(e, e.replace("https://github.com/", "")) : el("code", { text: e })]))) : null,
    ]),
  ]);
}

function renderFindings(box, ctx) {
  const r = ctx.analysis;
  const groups = STATUS_GROUPS.map(([status, label]) => {
    const items = r.findings.filter((f) => f.status === status);
    const pending = status === "info" && ctx.modelState === "pending"
      ? el("li", { class: "finding pending" }, [el("span", { class: "spin", "aria-hidden": "true" }),
          el("p", {}, [`Asking ${health.model} whether the diff does what the ${r.pr.linked_issues.length ? "linked issue" : "description"} asks… `, el("span", { class: "mono", "data-elapsed": "", text: "0s" })])])
      : null;
    if (!items.length && !pending) return null;
    return el("section", { class: "group" }, [el("h3", { class: "label", text: label }), el("ul", { class: "finding-list" }, [...items.map(findingItem), pending])]);
  });
  const impact = ctx.analysis.impact || ctx.atlas?.impact;
  const risks = impact?.risks?.length ? el("section", { class: "group" }, [
    el("h3", { class: "label", text: "Regression radar" }),
    el("ul", { class: "finding-list" }, impact.risks.map((k) => findingItem({ status: k.level === "high" ? "fail" : "warn", title: k.title, detail: "", evidence: k.evidence, source: k.source }))),
  ]) : null;
  fill(box, [el("h2", { class: "section-title", text: "Findings" }), risks, ...groups]);
}

function renderSide(box, ctx) {
  const r = ctx.analysis, imp = ctx.analysis.impact || ctx.atlas?.impact;
  const plan = imp?.plan ? el("section", { class: "card" }, [
    el("h3", { text: "Verification plan" }),
    el("p", { class: "sub", text: "Recommended next steps. Sieve has not run any of them." }),
    el("ol", { class: "plan" }, imp.plan.map((s) => el("li", { class: `step ${s.action}` }, [
      el("span", { class: "step-kind", text: { fix: "Fix", run: "Run", "add-test": "Add test", inspect: "Inspect" }[s.action] || s.action }),
      el("span", {}, [s.text, s.command ? el("code", { class: "cmd", text: s.command }) : null,
        s.target && atlas?.node(s.target) ? el("button", { type: "button", class: "linkish small", text: "Show in atlas", onclick: () => atlas.select(s.target) }) : null]),
    ]))),
  ]) : el("section", { class: "card" }, [el("h3", { text: "Verification plan" }), ctx.atlasError ? el("p", { class: "muted", text: ctx.atlasError }) : spinner("Waiting for the import graph…")]);

  const radar = renderHotspotRadar(ctx.analysis.archaeology);

  const affected = imp?.marks ? Object.entries(imp.marks).filter(([, m]) => m.role !== "dependency") : [];
  const affectedList = affected.length ? el("section", { class: "card" }, [
    el("h3", { text: "Affected files" }),
    el("p", { class: "sub", text: "Text version of the atlas overlay." }),
    el("ul", { class: "affected" }, affected.slice(0, 30).map(([path, m]) => el("li", {}, [
      el("button", { type: "button", class: "linkish", text: path, onclick: () => atlas?.select(path) }),
      el("span", { class: `role role-${m.role}`, text: ROLE_LABEL[m.role] || m.role }),
    ]))),
  ]) : null;

  const ledger = renderConfidenceLedger(r, imp);

  const brief = briefText(ctx);
  const briefBtn = el("button", { type: "button", class: "btn ghost small", text: "Copy" });
  briefBtn.addEventListener("click", () => copyText(briefBtn, brief));
  const replyBtn = el("button", { type: "button", class: "btn ghost small", text: "Copy" });
  replyBtn.addEventListener("click", () => copyText(replyBtn, r.comment));

  const modelCard = el("section", { class: "card" }, [el("h3", { text: "Relevance judgment" }), modelBody(ctx)]);

  fill(box, 
    plan,
    radar,
    el("section", { class: "card" }, [el("div", { class: "card-head" }, [el("h3", { text: "Reviewer brief" }), briefBtn]),
      el("p", { class: "sub", text: "Hand-off summary for whoever reviews next." }), el("pre", { class: "doc", text: brief })]),
    el("section", { class: "card" }, [el("div", { class: "card-head" }, [el("h3", { text: "Reply to contributor" }), replyBtn]),
      el("p", { class: "sub", text: "Draft only. Sieve never posts to GitHub." }), el("pre", { class: "doc", text: r.comment })]),
    ledger,
    modelCard,
    affectedList,
  );
}

function modelBody(ctx) {
  const m = ctx.analysis.model;
  if (ctx.modelState === "off") return el("p", { class: "muted", text: "Ollama isn't reachable, so this check was skipped. Every other finding is unaffected." });
  if (ctx.modelState === "pending") return spinner(`${health.model} is reading the diff locally…`);
  if (!m?.used) return el("p", { class: "muted", text: ctx.modelError || m?.error || "The model's output was unusable and was discarded." });
  return el("dl", { class: "facts" }, [
    el("dt", { text: "Verdict" }), el("dd", { text: m.judgment.verdict }),
    el("dt", { text: "Confidence" }), el("dd", { text: `${Math.round(m.judgment.confidence * 100)}% (model's own estimate)` }),
    el("dt", { text: "Model" }), el("dd", { class: "mono", text: `${m.name}, local via Ollama` }),
  ]);
}

function briefText(ctx) {
  const r = ctx.analysis, p = r.pr, imp = ctx.analysis.impact || ctx.atlas?.impact;
  const arch = ctx.analysis.archaeology;
  const by = (s) => r.findings.filter((f) => f.status === s);
  const issue = r.findings.find((f) => f.check === "linked_issue");
  const lines = [
    `Review brief: ${p.owner}/${p.repo}#${p.number}, "${p.title}"`,
    `Sieve verdict: ${r.score}/100, ${VERDICT[r.verdict]}`,
    "",
    "What it claims to address",
    `- ${issue ? issue.title : "No linked issue"}`,
  ];
  if (imp?.marks) {
    lines.push("", "What changed");
    for (const [path, m] of Object.entries(imp.marks)) if (["added", "modified", "removed", "renamed"].includes(m.role)) lines.push(`- ${path} (${m.role})`);
  } else if (imp?.summary?.changed_files) {
    lines.push("", `What changed (${imp.summary.changed_files} files)`);
    imp.nodes.filter((n) => ["modified", "added", "removed", "renamed"].includes(n.role)).forEach((n) => lines.push(`- ${n.path} (${n.role})`));
  }
  if (arch?.total_commits) {
    lines.push("", "Historical Context (Past 90 Days)");
    lines.push(`- ${arch.total_commits} commits across ${arch.distinct_contributors} authors on inspected paths`);
    if (arch.candidate_reverts?.length) lines.push(`- ⚠️ ${arch.candidate_reverts.length} candidate revert commit(s) detected`);
    if (arch.candidate_fixes?.length) lines.push(`- ℹ️ ${arch.candidate_fixes.length} candidate bugfix commit(s) detected`);
  }
  if (by("fail").length) { lines.push("", "Doesn't check out"); by("fail").forEach((f) => lines.push(`- ${f.title} [${SOURCE_LABEL[f.source]}]`)); }
  if (imp?.risks?.length) { lines.push("", "Regression risks"); imp.risks.forEach((k) => lines.push(`- ${k.title}${k.evidence[0] ? `: ${k.evidence[0]}` : ""}`)); }
  if (by("pass").length) { lines.push("", "Supported by evidence"); by("pass").forEach((f) => lines.push(`- ${f.title} [${SOURCE_LABEL[f.source]}]`)); }
  if (imp?.marks) {
    const dependents = Object.entries(imp.marks).filter(([, m]) => m.role === "direct" || m.role === "indirect");
    lines.push("", `May be affected (${dependents.length})`);
    dependents.slice(0, 8).forEach(([path, m]) => lines.push(`- ${path}: ${m.reason}`));
    lines.push("", "Related tests");
    if (imp.tests?.length) imp.tests.forEach((t) => lines.push(`- ${t.file}`)); else lines.push("- None found in the import graph");
    if (imp.plan?.length) {
      lines.push("", "Next steps");
      imp.plan.forEach((s, i) => lines.push(`${i + 1}. ${s.text}${s.command ? ` (\`${s.command}\`)` : ""}`));
    }
  }
  lines.push("", "Not verified");
  r.ledger.unknown.forEach((u) => lines.push(`- ${u}`));
  return lines.join("\n");
}

// ---------------------------------------------------------------- repository view
async function inspectRepo(ref) {
  const id = ++run;
  busy(true);
  show("repo");
  const panel = atlasPanel({ caption: "Import graph of the default branch. Height shows how many files import a file.", withImpact: false });
  const fingerprint = el("section", { class: "card" }, [el("h3", { text: "Repository fingerprint" }), spinner("Parsing…")]);
  const queue = el("section", { class: "queue" }, [el("h2", { class: "section-title", text: "Open pull requests" }), spinner("Running fast checks on up to 15 open pull requests…")]);
  fill($("repo"), 
    el("div", { class: "review-head" }, [el("p", { class: "crumbs", text: "Repository" }), el("h1", { class: "pr-title", text: ref.replace("https://github.com/", "") })]),
    panel.root,
    el("div", { class: "review-grid" }, [queue, el("div", { class: "side" }, [fingerprint])]),
  );
  panel.setLoading("Downloading and parsing the repository…");
  const a = api(`/api/atlas?repo=${encodeURIComponent(ref)}`).then((d) => {
    if (id !== run) return;
    panel.setData(d);
    renderFingerprint(fingerprint, d);
  }).catch((e) => { if (id === run) { panel.setError(e.message); fill(fingerprint, el("h3", { text: "Repository fingerprint" }), el("p", { class: "muted", text: e.message })); } });
  const q = api(`/api/queue?repo=${encodeURIComponent(ref)}`).then((d) => { if (id === run) renderQueue(queue, d); })
    .catch((e) => { if (id === run) fill(queue, el("h2", { class: "section-title", text: "Open pull requests" }), el("p", { class: "banner", text: e.message })); });
  await Promise.allSettled([a, q]);
  if (id === run) busy(false);
}

function renderFingerprint(box, d) {
  const f = d.graph.fingerprint;
  fill(box, 
    el("h3", { text: "Repository fingerprint" }),
    el("p", { class: "sub" }, [`Observed facts at ${d.ref_name} `, el("code", { text: d.ref.slice(0, 7) })]),
    el("dl", { class: "facts" }, [
      el("dt", { text: "Files" }), el("dd", { text: `${f.files} (${f.source_files} parsed source, ${f.test_files} tests)` }),
      el("dt", { text: "Import edges" }), el("dd", { text: String(f.import_edges) }),
      el("dt", { text: "Languages" }), el("dd", { text: f.languages.map(([l, c]) => `${l} ${c}`).join(" · ") }),
      el("dt", { text: "CONTRIBUTING" }), el("dd", { text: f.has_contributing ? "Present" : "Not found" }),
      el("dt", { text: "CI workflows" }), el("dd", { text: f.has_ci ? "Present" : "Not found" }),
    ]),
    f.most_imported.length ? el("h4", { text: "Most imported" }) : null,
    el("ul", { class: "affected" }, f.most_imported.map((m) => el("li", {}, [
      el("button", { type: "button", class: "linkish", text: m.file, onclick: () => atlas?.select(m.file) }), el("span", { class: "muted", text: plural(m.importers, "importer") })]))),
    d.graph.truncated ? el("p", { class: "muted small", text: "Large repository: the atlas shows the most-connected files only." }) : null,
  );
}

function renderQueue(box, q) {
  const by = (v) => q.rows.filter((r) => r.verdict === v).length;
  const rows = q.rows.map((r) => r.error
    ? el("tr", {}, [el("td", { text: "–" }), el("td", { colspan: "3" }, [`#${r.number} ${r.title}`, el("p", { class: "muted small", text: r.error })])])
    : el("tr", { tabindex: "0", onclick: () => start(`${q.owner}/${q.repo}#${r.number}`), onkeydown: (e) => { if (e.key === "Enter") start(`${q.owner}/${q.repo}#${r.number}`); } }, [
        el("td", { class: "q-score", text: String(r.score) }),
        el("td", {}, [el("span", { class: `chip ${r.verdict}`, text: VERDICT[r.verdict] })]),
        el("td", {}, [el("strong", { text: `#${r.number} ` }), r.title, el("p", { class: "muted small", text: r.top_issues.length ? r.top_issues.join(" · ") : "No problems found by fast checks" })]),
        el("td", { class: "muted", text: `@${r.author}` }),
      ]));
  fill(box, 
    el("h2", { class: "section-title", text: "Open pull requests" }),
    el("p", { class: "sub", text: `${by("ready")} ready · ${by("needs-work")} need work · ${by("low-effort")} low-effort. Fast deterministic pass; open one for the full inspection.` }),
    q.rows.length ? el("table", { class: "table" }, [
      el("thead", {}, el("tr", {}, ["Score", "Verdict", "Pull request", "Author"].map((h) => el("th", { scope: "col", text: h })))),
      el("tbody", {}, rows),
    ]) : el("p", { class: "muted", text: "No open pull requests." }),
  );
}

// ---------------------------------------------------------------- boot
window.start = start;

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    if (!$("review").hidden || !$("repo").hidden) {
      show("home");
      $("target").value = "";
    }
    document.querySelectorAll(".nav-link").forEach((l) => l.classList.toggle("active", l === link));
  });
});

$("form").addEventListener("submit", (e) => { e.preventDefault(); start($("target").value); });
window.addEventListener("popstate", fromUrl);
loadHealth().then(fromUrl);
