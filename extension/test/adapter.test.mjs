// Unit tests for github-adapter.js route detection and navigation hooks. Run: node --test extension/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../github-adapter.js", import.meta.url), "utf8");

// Load the adapter into a minimal fake window and report which events it subscribed to.
function loadAdapter(pathname, { navigationApi = true } = {}) {
  const listeners = { document: [], window: [], navigation: [] };
  const history = { pushState() {}, replaceState() {} };
  const originalPush = history.pushState;
  const win = {
    location: { pathname },
    history,
    addEventListener: (type) => listeners.window.push(type),
    navigation: navigationApi ? { addEventListener: (type) => listeners.navigation.push(type) } : undefined,
  };
  const doc = { addEventListener: (type) => listeners.document.push(type), querySelector: () => null, querySelectorAll: () => [] };
  const context = { window: win, document: doc, history, console, Array };
  vm.runInNewContext(SOURCE, context);
  return { adapter: win.SieveAdapter, listeners, historyPatched: history.pushState !== originalPush };
}

test("detects a repository's pull request list", () => {
  const { adapter } = loadAdapter("/ThatKJ/sieve-demo-target/pulls");
  assert.deepEqual({ ...adapter.parseGitHubLocation() }, { type: "PULLS", owner: "ThatKJ", repo: "sieve-demo-target", ref: "ThatKJ/sieve-demo-target" });
});

test("detects filtered pull request lists", () => {
  const { adapter } = loadAdapter("/ThatKJ/sieve-demo-target/pulls/assigned/ThatKJ");
  assert.equal(adapter.parseGitHubLocation().type, "PULLS");
});

test("detects a pull request and its sub-tabs", () => {
  for (const path of ["/pallets/click/pull/3899", "/pallets/click/pull/3899/files", "/pallets/click/pull/3899/commits"]) {
    const loc = loadAdapter(path).adapter.parseGitHubLocation();
    assert.equal(loc.type, "PR_DETAIL", path);
    assert.equal(loc.number, 3899);
    assert.equal(loc.ref, "pallets/click#3899");
  }
});

test("does not treat GitHub's global pages as repositories", () => {
  for (const path of ["/pulls", "/notifications", "/settings/profile"]) {
    const { type } = loadAdapter(path).adapter.parseGitHubLocation();
    assert.notEqual(type, "PULLS", path);
    assert.notEqual(type, "PR_DETAIL", path);
  }
});

test("issues and code pages are not pull request routes", () => {
  for (const path of ["/pallets/click/issues/12", "/pallets/click", "/pallets/click/tree/main/src"]) {
    assert.equal(loadAdapter(path).adapter.parseGitHubLocation().type, "REPO_ROOT", path);
  }
});

test("listens to DOM-level navigation signals, including the Navigation API", () => {
  const { listeners } = loadAdapter("/a/b/pulls");
  assert.ok(listeners.document.includes("turbo:load"));
  assert.ok(listeners.document.includes("turbo:render"));
  assert.ok(listeners.window.includes("popstate"));
  assert.ok(listeners.navigation.includes("navigatesuccess"));
});

test("works without the Navigation API", () => {
  const { adapter } = loadAdapter("/a/b/pulls", { navigationApi: false });
  assert.equal(adapter.parseGitHubLocation().type, "PULLS");
});

test("does not monkey-patch history (it would never see GitHub's isolated-world calls)", () => {
  assert.equal(loadAdapter("/a/b/pulls").historyPatched, false);
});
