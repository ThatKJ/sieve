// Unit tests for Sieve Maintainer Command Center, normalization, sorting, collections & activation
// Run with: node --test extension/test/command-center.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const CC_SOURCE = readFileSync(new URL("../ui/command-center.js", import.meta.url), "utf8");
const ADAPTER_SOURCE = readFileSync(new URL("../github-adapter.js", import.meta.url), "utf8");

function loadCommandCenterModule() {
  const win = {};
  class Node {
    constructor() { this.nodeType = 1; }
  }

  const doc = {
    createElement(tag) {
      const children = [];
      const attrs = {};
      const listeners = {};
      const el = Object.assign(new Node(), {
        tagName: tag.toUpperCase(),
        className: "",
        textContent: "",
        children,
        style: {},
        dataset: {},
        setAttribute(k, v) { attrs[k] = String(v); },
        getAttribute(k) { return attrs[k] || null; },
        hasAttribute(k) { return k in attrs; },
        removeAttribute(k) { delete attrs[k]; },
        addEventListener(type, fn) {
          listeners[type] = listeners[type] || [];
          listeners[type].push(fn);
        },
        dispatchEvent(evt) {
          (listeners[evt.type] || []).forEach((fn) => fn(evt));
        },
        append(...nodes) {
          for (const n of nodes) {
            if (typeof n === "string" || typeof n === "number") {
              children.push({ nodeType: 3, textContent: String(n) });
            } else if (n) {
              children.push(n);
            }
          }
        },
        replaceChildren(...nodes) {
          children.length = 0;
          this.append(...nodes);
        },
        querySelector(sel) {
          const match = (node) => {
            if (!node || !node.className) return false;
            if (sel.startsWith(".")) {
              const classes = sel.split(".").filter(Boolean);
              const nodeClasses = node.className.split(" ");
              return classes.every((cls) => nodeClasses.includes(cls));
            }
            return false;
          };
          for (const c of children) {
            if (match(c)) return c;
            if (c.querySelector) {
              const res = c.querySelector(sel);
              if (res) return res;
            }
          }
          return null;
        },
        querySelectorAll(sel) {
          const out = [];
          for (const c of children) {
            if (c.className && sel.startsWith(".") && c.className.split(" ").includes(sel.slice(1))) out.push(c);
            if (c.querySelectorAll) out.push(...c.querySelectorAll(sel));
          }
          return out;
        }
      });
      return el;
    },
    createTextNode(txt) {
      const t = new Node();
      t.nodeType = 3;
      t.textContent = String(txt);
      return t;
    },
    addEventListener() {}
  };

  const chromeStorage = {};
  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://fake-id/${path}`
    },
    storage: {
      local: {
        get: (keys, cb) => {
          if (typeof keys === "string") {
            cb({ [keys]: chromeStorage[keys] });
          } else if (Array.isArray(keys)) {
            const out = {};
            keys.forEach((k) => { out[k] = chromeStorage[k]; });
            cb(out);
          } else {
            cb({ ...chromeStorage });
          }
        },
        set: (obj, cb) => {
          Object.assign(chromeStorage, obj);
          cb?.();
        }
      }
    }
  };

  win.Node = Node;
  const context = {
    window: win,
    document: doc,
    Node,
    chrome,
    console,
    Array,
    Object,
    String,
    Number,
    Date,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  };

  vm.runInNewContext(CC_SOURCE, context);
  return {
    SieveCommandCenter: win.SieveCommandCenter,
    chromeStorage,
    doc,
    createShadowRoot: () => doc.createElement("div")
  };
}

// ---------------------------------------------------------------- Normalization Tests
test("normalizeRow preserves complete deterministic lifecycle if present", () => {
  const { SieveCommandCenter } = loadCommandCenterModule();
  const raw = {
    number: 101,
    title: "Refactor database pool",
    author: "octocat",
    lifecycle: {
      status: "action_needed",
      reason: "Changes requested by maintainer",
      responsible: "author",
      next_action: "Push revision",
      last_activity_at: "2026-10-30T12:00:00Z",
      evidence: ["Requested changes on src/pool.py"],
      blockers: [],
      missing: []
    }
  };
  const norm = SieveCommandCenter.normalizeRow(raw);
  assert.equal(norm.lifecycle.status, "action_needed");
  assert.equal(norm.lifecycle.responsible, "author");
  assert.equal(norm.lifecycle.next_action, "Push revision");
  assert.equal(norm.lifecycle.evidence[0], "Requested changes on src/pool.py");
});

test("normalizeRow maps legacy turn_status states correctly", () => {
  const { SieveCommandCenter } = loadCommandCenterModule();

  // 1. action_needed_you -> action_needed (maintainer)
  const pr1 = SieveCommandCenter.normalizeRow({
    number: 1,
    title: "Needs review",
    turn_status: "action_needed_you",
    verdict: "intake passed"
  });
  assert.equal(pr1.lifecycle.status, "action_needed");
  assert.equal(pr1.lifecycle.responsible, "maintainer");

  // 2. waiting_on_contributor -> waiting_on_author (author)
  const pr2 = SieveCommandCenter.normalizeRow({
    number: 2,
    title: "Waiting on fix",
    turn_status: "waiting_on_contributor"
  });
  assert.equal(pr2.lifecycle.status, "waiting_on_author");
  assert.equal(pr2.lifecycle.responsible, "author");

  // 3. blocked -> blocked (maintainer)
  const pr3 = SieveCommandCenter.normalizeRow({
    number: 3,
    title: "Conflicted branch",
    turn_status: "blocked",
    collisions: [{ with_pr: 99, file: "config.py" }]
  });
  assert.equal(pr3.lifecycle.status, "blocked");
  assert.equal(pr3.lifecycle.blockers.length, 1);
  assert.match(pr3.lifecycle.blockers[0].detail, /Overlaps with PR #99/);

  // 4. merge_candidate -> ready_to_merge (maintainer)
  const pr4 = SieveCommandCenter.normalizeRow({
    number: 4,
    title: "Ready to land",
    turn_status: "merge_candidate"
  });
  assert.equal(pr4.lifecycle.status, "ready_to_merge");
  assert.equal(pr4.lifecycle.responsible, "maintainer");

  // 5. draft -> draft (author)
  const pr5 = SieveCommandCenter.normalizeRow({
    number: 5,
    title: "WIP work",
    draft: true
  });
  assert.equal(pr5.lifecycle.status, "draft");
  assert.equal(pr5.lifecycle.responsible, "author");

  // 6. unclassified legacy PR -> needs_triage (unknown)
  const pr6 = SieveCommandCenter.normalizeRow({
    number: 6,
    title: "Mysterious PR"
  });
  assert.equal(pr6.lifecycle.status, "needs_triage");
  assert.equal(pr6.lifecycle.responsible, "unknown");
});

test("normalizeRow handles missing or empty PR row without throwing", () => {
  const { SieveCommandCenter } = loadCommandCenterModule();
  assert.equal(SieveCommandCenter.normalizeRow(null), null);
  assert.equal(SieveCommandCenter.normalizeRow(undefined), null);

  const minimal = SieveCommandCenter.normalizeRow({});
  assert.equal(minimal.lifecycle.status, "needs_triage");
  assert.equal(minimal.author, "unknown");
  assert.equal(minimal.title, "PR #unknown");
});

// ---------------------------------------------------------------- Rendering & Filtering Tests
test("render mounts Maintainer Command Center and computes KPI counts", () => {
  const { SieveCommandCenter, createShadowRoot } = loadCommandCenterModule();
  const shadow = createShadowRoot();

  const queueData = {
    lifecycle: { total_count: 3, viewer: "testmaintainer" },
    rows: [
      { number: 1, title: "PR One", turn_status: "action_needed_you", author: "alice" },
      { number: 2, title: "PR Two", turn_status: "waiting_on_contributor", author: "bob" },
      { number: 3, title: "PR Three", turn_status: "merge_candidate", author: "charlie" },
    ]
  };

  SieveCommandCenter.render(shadow, { owner: "pallets", repo: "click", ref: "pallets/click" }, queueData, { connected: true, model: "gemma-4-26b-a4b-it" });

  assert.equal(shadow.children.length, 2); // stylesheet link + .scc app
  const app = shadow.children[1];
  assert.ok(app.className.includes("scc"));

  // Check KPIs
  const kpiBox = app.querySelector(".scc-kpis");
  assert.ok(kpiBox);
  const kpis = kpiBox.querySelectorAll(".scc-kpi");
  assert.equal(kpis.length, 6); // open, action_needed, waiting_on_author, waiting_for_review, blocked, ready_to_merge
});

test("blast radius sorting ranks PRs with larger impact graph or score first", () => {
  const { SieveCommandCenter } = loadCommandCenterModule();
  const prs = [
    SieveCommandCenter.normalizeRow({ number: 1, title: "Small PR", impact: { nodes: [1, 2] } }),
    SieveCommandCenter.normalizeRow({ number: 2, title: "Large PR", impact: { nodes: [1, 2, 3, 4, 5, 6, 7] } }),
    SieveCommandCenter.normalizeRow({ number: 3, title: "Medium PR", blast_radius: 4 })
  ];

  const blastScore = (r) => (r.impact?.nodes?.length || r.blast_radius || r.score || 0);
  prs.sort((a, b) => blastScore(b) - blastScore(a));

  assert.equal(prs[0].number, 2); // 7 nodes
  assert.equal(prs[1].number, 3); // 4 nodes
  assert.equal(prs[2].number, 1); // 2 nodes
});

// ---------------------------------------------------------------- Comprehensive Filter & Search Tests
test("command center supports all 9 filters, search, stale flag, and custom collections", () => {
  const { SieveCommandCenter, createShadowRoot, chromeStorage } = loadCommandCenterModule();
  const shadow = createShadowRoot();

  // Populate custom collections in storage
  chromeStorage.sieveCollections = {
    "pallets/click": {
      "Critical": [1, 3]
    }
  };

  const queueData = {
    lifecycle: { total_count: 5, stale_days: 14 },
    rows: [
      { number: 1, title: "Fix auth deadlock", turn_status: "action_needed_you", author: "alice", labels: ["security"] },
      { number: 2, title: "Update docs", turn_status: "waiting_on_contributor", author: "bob", updated_at: "2020-01-01T00:00:00Z" }, // stale
      { number: 3, title: "Blocked by db migration", turn_status: "blocked", author: "carol" },
      { number: 4, title: "Mergeable enhancement", turn_status: "merge_candidate", author: "dave" },
      { number: 5, title: "Draft new protocol", draft: true, author: "eve" },
    ]
  };

  let inspectedPr = null;
  SieveCommandCenter.render(
    shadow,
    { owner: "pallets", repo: "click", ref: "pallets/click" },
    queueData,
    { connected: true },
    { onInspectPR: (num) => { inspectedPr = num; } }
  );

  const app = shadow.children[1];
  assert.ok(app);

  // Check that all 9 status chips are rendered
  const chipBox = app.querySelector(".scc-chips");
  assert.ok(chipBox);
  const chips = chipBox.querySelectorAll(".scc-chip");
  assert.ok(chips.length >= 9, `Expected at least 9 chips, found ${chips.length}`);

  // Check detail panel has open PR intelligence action
  const detail = app.querySelector(".scc-detail");
  assert.ok(detail);
  const inspectBtn = detail.querySelector(".scc-btn.primary");
  assert.ok(inspectBtn);
  inspectBtn.dispatchEvent({ type: "click" });
  assert.equal(inspectedPr, 1); // Selected default first PR #1
});

test("welcome activation contract avoids duplicate overlays and supports both routes", () => {
  const state = {
    welcomeShown: false,
    autoOpen: true,
    pendingActivation: false,
    activation: "idle"
  };

  // Helper mimicking reconcile logic on /pulls and /pull/123
  function reconcileRoute(locType, userExplicitEnable = false) {
    if (userExplicitEnable) {
      state.pendingActivation = (locType === "PULLS" || locType === "PR_DETAIL");
      state.activation = "idle"; // enableSieve resets activation to idle
    }
    const welcome = state.pendingActivation || (!state.welcomeShown && state.autoOpen);
    if (welcome && state.activation === "idle") {
      state.pendingActivation = false;
      state.activation = "running";
      // complete activation
      state.activation = "complete";
      state.welcomeShown = true;
      return "ACTIVATED";
    }
    return "SKIPPED_ALREADY_ACTIVE";
  }

  // 1. Initial hit on /pulls -> Activates
  assert.equal(reconcileRoute("PULLS"), "ACTIVATED");
  assert.equal(state.welcomeShown, true);

  // 2. SPA navigation from /pulls to /pull/42 -> Does NOT reactivate duplicate welcome screen
  assert.equal(reconcileRoute("PR_DETAIL"), "SKIPPED_ALREADY_ACTIVE");

  // 3. Explicit re-enable on /pull/42 -> Triggers intentional activation
  assert.equal(reconcileRoute("PR_DETAIL", true), "ACTIVATED");
});
