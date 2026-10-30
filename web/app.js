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

const safeGitHub = (url) => typeof url === "string" && /^https:\/\/github\.com\//.test(url);
const link = (href, text) => (safeGitHub(href) ? el("a", { href, target: "_blank", rel: "noopener", text }) : el("span", { text }));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function api(path) {
  let res;
  try {
    res = await fetch(path);
  } catch {
    throw new Error("Can't reach the Sieve server. Is `python3 -m sieve --serve` still running?");
  }
  const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return data;
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
  fill($("status"), [
    el("span", { class: `pill ${ok ? "ok" : "off"}`, title: ok ? "Ollama is running locally" : "Ollama not reachable: the relevance check is skipped, everything else still works" },
      [el("span", { class: "dot", "aria-hidden": "true" }), `${health.model} · ${ok ? "local" : "offline"}`]),
    health.offline ? el("span", { class: "pill", title: "Serving cached GitHub data (SIEVE_OFFLINE=1)" }, [el("span", { class: "dot", "aria-hidden": "true" }), "cached"]) : null,
  ])
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

// ---------------------------------------------------------------- home
function renderHome() {
  run++;
  show("home");
  const panel = atlasPanel({ caption: `${DEMO_REPO}: a real repository, parsed live. Pick a pull request to see what it touches.`, withImpact: false });
  const examples = el("ol", { class: "examples" }, EXAMPLES.map((ex) => el("li", {}, [
    el("button", { type: "button", class: "example", onclick: () => start(ex.ref) }, [
      el("span", { class: "ex-title", text: ex.title }),
      el("span", { class: "ex-note", text: ex.note }),
      el("code", { text: ex.ref }),
    ]),
  ])));
  fill($("home"), 
    el("div", { class: "home-intro" }, [
      el("h1", { class: "display", text: "See what a pull request really changes." }),
      el("p", { class: "lede", text: "Sieve maps your repository's imports, overlays a pull request's reach, and checks every claim it makes against the code: linked issue, tests, files, imports, your CONTRIBUTING rules. Evidence is labelled by source. Nothing is posted to GitHub." }),
    ]),
    el("div", { class: "home-grid" }, [
      panel.root,
      el("aside", { class: "home-side" }, [
        el("h2", { class: "label", text: "Inspect a pull request" }),
        examples,
        el("h2", { class: "label", text: "Or a whole repository" }),
        el("button", { type: "button", class: "example", onclick: () => start(DEMO_REPO) }, [
          el("span", { class: "ex-title", text: "Rank every open pull request" }), el("code", { text: DEMO_REPO })]),
        el("p", { class: "muted small", text: `Relevance judgments come from ${health.model} running locally through Ollama and are always labelled as model opinion.` }),
      ]),
    ]),
  );
  const id = run;
  panel.setLoading("Downloading and parsing the repository…");
  api(`/api/atlas?repo=${encodeURIComponent(DEMO_REPO)}`)
    .then((d) => { if (id === run) panel.setData(d); })
    .catch((e) => { if (id === run) panel.setError(e.message); });
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

  const parts = {
    head: el("div", { class: "review-head" }),
    findings: el("div", { class: "findings" }),
    side: el("div", { class: "side" }),
  };
  const panel = atlasPanel({ caption: "Every highlighted file is connected to the change by an import statement Sieve found. Click any file for the evidence.", withImpact: true });
  fill(view, parts.head, panel.root, el("div", { class: "review-grid" }, [parts.findings, parts.side]));

  const ctx = { analysis: fast, atlas: null, modelState: health.ollama && health.model_installed ? "pending" : "off" };
  const paint = () => {
    renderHead(parts.head, ctx);
    renderFindings(parts.findings, ctx);
    renderSide(parts.side, ctx);
  };
  paint();

  panel.setLoading("Building the import graph from the base branch…");
  const atlasJob = api(`/api/atlas?pr=${encodeURIComponent(ref)}`)
    .then((d) => { if (id === run) { ctx.atlas = d; panel.setData(d); paint(); } })
    .catch((e) => { if (id === run) { ctx.atlasError = e.message; panel.setError(`Couldn't build the atlas: ${e.message}`); paint(); } });

  if (ctx.modelState === "pending") {
    const t0 = Date.now();
    ctx.timer = setInterval(() => {
      const t = view.querySelector("[data-elapsed]");
      if (t) t.textContent = `${Math.round((Date.now() - t0) / 1000)}s`;
    }, 1000);
    try {
      const full = await api(`/api/analyze?pr=${encodeURIComponent(ref)}&model=1`);
      if (id === run) { ctx.analysis = full; ctx.modelState = full.model?.used ? "done" : "failed"; }
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
  const imp = ctx.atlas?.impact;
  fill(box, 
    el("p", { class: "crumbs" }, [
      el("a", { href: `?repo=${encodeURIComponent(`${p.owner}/${p.repo}`)}`, text: `${p.owner}/${p.repo}` }), ` · pull request #${p.number} · `,
      link(p.url, "Open on GitHub ↗"),
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
      imp ? el("dl", { class: "reach" }, [
        el("dt", { text: "Changed" }), el("dd", { text: String(imp.counts.changed) }),
        el("dt", { text: "Depend on it" }), el("dd", { text: String(imp.counts.direct + imp.counts.indirect) }),
        el("dt", { text: "Related tests" }), el("dd", { text: String(imp.counts.tests) }),
        el("dt", { text: "Risks" }), el("dd", { class: imp.risks.some((x) => x.level === "high") ? "hot" : "", text: String(imp.risks.length) }),
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
  const impact = ctx.atlas?.impact;
  const risks = impact?.risks?.length ? el("section", { class: "group" }, [
    el("h3", { class: "label", text: "Regression radar" }),
    el("ul", { class: "finding-list" }, impact.risks.map((k) => findingItem({ status: k.level === "high" ? "fail" : "warn", title: k.title, detail: "", evidence: k.evidence, source: k.source }))),
  ]) : null;
  fill(box, [el("h2", { class: "section-title", text: "Findings" }), risks, ...groups])
}

function renderSide(box, ctx) {
  const r = ctx.analysis, imp = ctx.atlas?.impact;
  const plan = imp ? el("section", { class: "card" }, [
    el("h3", { text: "Verification plan" }),
    el("p", { class: "sub", text: "Recommended next steps. Sieve has not run any of them." }),
    el("ol", { class: "plan" }, imp.plan.map((s) => el("li", { class: `step ${s.action}` }, [
      el("span", { class: "step-kind", text: { fix: "Fix", run: "Run", "add-test": "Add test", inspect: "Inspect" }[s.action] || s.action }),
      el("span", {}, [s.text, s.command ? el("code", { class: "cmd", text: s.command }) : null,
        s.target && atlas?.node(s.target) ? el("button", { type: "button", class: "linkish small", text: "Show in atlas", onclick: () => atlas.select(s.target) }) : null]),
    ]))),
  ]) : el("section", { class: "card" }, [el("h3", { text: "Verification plan" }), ctx.atlasError ? el("p", { class: "muted", text: ctx.atlasError }) : spinner("Waiting for the import graph…")]);

  const affected = imp ? Object.entries(imp.marks).filter(([, m]) => m.role !== "dependency") : [];
  const affectedList = imp ? el("section", { class: "card" }, [
    el("h3", { text: "Affected files" }),
    el("p", { class: "sub", text: "Text version of the atlas overlay." }),
    el("ul", { class: "affected" }, affected.slice(0, 30).map(([path, m]) => el("li", {}, [
      el("button", { type: "button", class: "linkish", text: path, onclick: () => atlas?.select(path) }),
      el("span", { class: `role role-${m.role}`, text: ROLE_LABEL[m.role] || m.role }),
    ]))),
  ]) : null;

  const ledger = el("section", { class: "card" }, [
    el("h3", { text: "Confidence ledger" }),
    el("p", { class: "sub", text: "What Sieve knows, and how it knows it." }),
    el("dl", { class: "ledger" }, [
      ...r.ledger.groups.flatMap((g) => [el("dt", {}, [el("span", { class: `src src-${g.source}`, text: SOURCE_LABEL[g.source] }), g.label]), el("dd", { text: g.items.length ? plural(g.items.length, "finding") : "None" })]),
      imp ? el("dt", {}, [el("span", { class: "src src-repository", text: "Repository" }), "Import graph"]) : null,
      imp ? el("dd", { text: `${ctx.atlas.graph.fingerprint.import_edges} edges parsed from ${ctx.atlas.graph.fingerprint.source_files} files` }) : null,
    ]),
    el("h4", { text: "Not verified" }),
    el("ul", { class: "unknown" }, r.ledger.unknown.map((u) => el("li", { text: u }))),
  ]);

  const brief = briefText(ctx);
  const briefBtn = el("button", { type: "button", class: "btn ghost small", text: "Copy" });
  briefBtn.addEventListener("click", () => copyText(briefBtn, brief));
  const replyBtn = el("button", { type: "button", class: "btn ghost small", text: "Copy" });
  replyBtn.addEventListener("click", () => copyText(replyBtn, r.comment));

  const modelCard = el("section", { class: "card" }, [el("h3", { text: "Relevance judgment" }), modelBody(ctx)]);

  fill(box, 
    plan,
    el("section", { class: "card" }, [el("div", { class: "card-head" }, [el("h3", { text: "Reviewer brief" }), briefBtn]),
      el("p", { class: "sub", text: "Hand-off summary for whoever reviews next." }), el("pre", { class: "doc", text: brief })]),
    el("section", { class: "card" }, [el("div", { class: "card-head" }, [el("h3", { text: "Reply to contributor" }), replyBtn]),
      el("p", { class: "sub", text: "Draft only. Sieve never posts to GitHub." }), el("pre", { class: "doc", text: r.comment })]),
    ledger, modelCard, affectedList,
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
  const r = ctx.analysis, p = r.pr, imp = ctx.atlas?.impact;
  const by = (s) => r.findings.filter((f) => f.status === s);
  const issue = r.findings.find((f) => f.check === "linked_issue");
  const lines = [
    `Review brief: ${p.owner}/${p.repo}#${p.number}, "${p.title}"`,
    `Sieve verdict: ${r.score}/100, ${VERDICT[r.verdict]}`,
    "",
    "What it claims to address",
    `- ${issue ? issue.title : "No linked issue"}`,
  ];
  if (imp) {
    lines.push("", "What changed");
    for (const [path, m] of Object.entries(imp.marks)) if (["added", "modified", "removed", "renamed"].includes(m.role)) lines.push(`- ${path} (${m.role})`);
  }
  if (by("fail").length) { lines.push("", "Doesn't check out"); by("fail").forEach((f) => lines.push(`- ${f.title} [${SOURCE_LABEL[f.source]}]`)); }
  if (imp?.risks.length) { lines.push("", "Regression risks"); imp.risks.forEach((k) => lines.push(`- ${k.title}${k.evidence[0] ? `: ${k.evidence[0]}` : ""}`)); }
  if (by("pass").length) { lines.push("", "Supported by evidence"); by("pass").forEach((f) => lines.push(`- ${f.title} [${SOURCE_LABEL[f.source]}]`)); }
  if (imp) {
    const dependents = Object.entries(imp.marks).filter(([, m]) => m.role === "direct" || m.role === "indirect");
    lines.push("", `May be affected (${dependents.length})`);
    dependents.slice(0, 8).forEach(([path, m]) => lines.push(`- ${path}: ${m.reason}`));
    lines.push("", "Related tests");
    if (imp.tests.length) imp.tests.forEach((t) => lines.push(`- ${t.file}`)); else lines.push("- None found in the import graph");
    lines.push("", "Next steps");
    imp.plan.forEach((s, i) => lines.push(`${i + 1}. ${s.text}${s.command ? ` (\`${s.command}\`)` : ""}`));
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
$("form").addEventListener("submit", (e) => { e.preventDefault(); start($("target").value); });
window.addEventListener("popstate", fromUrl);
loadHealth().then(fromUrl);
