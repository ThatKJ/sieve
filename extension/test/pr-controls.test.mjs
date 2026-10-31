// Unit tests for the PR Control Center UI lifecycle (ui/pr-controls.js) with a minimal fake DOM.
// Run with: node --test extension/test/pr-controls.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../ui/pr-controls.js", import.meta.url), "utf8");

class Node {
  constructor(tag) { Object.assign(this, { tagName: tag, children: [], attrs: {}, listeners: {}, textContent: "", value: "", disabled: false }); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "disabled") this.disabled = true; if (k === "value") this.value = String(v); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  append(...n) {
    for (const x of n) this.children.push(x instanceof Node ? x : Object.assign(new Node("#text"), { textContent: String(x) }));
    if (this.tagName === "SELECT" && !this.value && this.children[0]) this.value = this.children[0].value;
  }
  replaceChildren(...n) { this.children = []; this.append(...n); }
  focus() {}
  get selectedOptions() { return this.children.filter((o) => o.value === this.value); }
  click() { for (const fn of this.listeners.click || []) fn({}); }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  text() { return this.all().map((n) => n.textContent).join(" "); }
}
Object.defineProperty(Node.prototype, "className", { set(v) { this.attrs.class = v; }, get() { return this.attrs.class; } });

function load() {
  const ctx = { window: {}, document: { createElement: (t) => new Node(t.toUpperCase()), createTextNode: (s) => Object.assign(new Node("#text"), { textContent: s }) }, Node, crypto: { randomUUID: () => "11111111-2222" }, chrome: {} };
  ctx.globalThis = ctx;
  vm.runInNewContext(SRC, ctx);
  return ctx.window.SievePRControls;
}

const SHA = "a".repeat(40);
const ALL = ["merge", "close", "reopen", "approve", "request_changes", "review_comment", "comment", "inline_comment", "add_labels", "remove_labels",
  "add_assignees", "remove_assignees", "request_reviewers", "remove_reviewers", "set_milestone", "clear_milestone", "ready_for_review",
  "convert_to_draft", "update_branch"];
function controls(available = {}, pr = {}) {
  return {
    pr: { owner: "o", repo: "r", number: 7, title: "Fix", state: "open", draft: false, head_sha: SHA, head: "fix", base: "main", ...pr },
    viewer: { login: "maint", permission: "WRITE" }, access: { mode: "write", source: "GITHUB_TOKEN", write_capable: "yes" },
    merge: { methods: ["squash"], mergeable: "MERGEABLE", state: "CLEAN", state_text: "Mergeable.", review_decision: null,
      checks_state: "SUCCESS", checks: [], queue: { enabled: false } },
    labels: [], repo_labels: ["bug"], milestone: null, repo_milestones: [], assignees: [], requested_reviewers: [], reviews: [], files: [],
    available: Object.fromEntries(ALL.map((a) => [a, available[a] ?? null])),
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const byAttr = (root, k, v) => root.all().find((n) => n.attrs[k] === v);

test("merge requires confirmation and a double click sends exactly once", async () => {
  const sent = [];
  let release;
  const send = (msg) => { sent.push(msg); return msg.type === "GET_PR_CONTROLS" ? Promise.resolve({ ok: true, data: controls() }) : new Promise((r) => { release = r; }); };
  const host = new Node("DIV");
  load().mount(host, "o/r#7", send);
  await tick();
  byAttr(host, "data-action", "merge").click();
  assert.equal(sent.filter((m) => m.type === "PR_ACTION").length, 0, "opening the confirmation sends nothing");
  assert.match(host.text(), /o\/r #7/);
  assert.match(host.text(), /Squash and merge/);
  const yes = byAttr(host, "data-confirm", "merge");
  yes.click();
  yes.click();
  const actions = sent.filter((m) => m.type === "PR_ACTION");
  assert.equal(actions.length, 1);
  assert.deepEqual([actions[0].action, actions[0].params.method, actions[0].expected_head_sha], ["merge", "squash", SHA]);
  assert.ok(actions[0].request_id.length >= 8);
  assert.equal(yes.disabled, true);
  assert.doesNotMatch(host.text(), /Verified/, "no success before GitHub answers");
  release({ ok: true, data: { message: "Merged #7 (squash) as ccccccc.", verified: true, evidence: null, controls: controls({}, { state: "merged" }) } });
  await tick();
  assert.match(host.text(), /Verified: GitHub now shows this change/);
});

test("disabled actions show the engine's reason", async () => {
  const host = new Node("DIV");
  load().mount(host, "o/r#7", () => Promise.resolve({ ok: true, data: controls({ merge: { status: 403, reason: "Sieve is in read-only mode." } }) }));
  await tick();
  assert.equal(byAttr(host, "data-action", "merge").disabled, true);
  assert.match(host.text(), /read-only mode/);
});

test("failure is reported without claiming success", async () => {
  const send = (msg) => Promise.resolve(msg.type === "GET_PR_CONTROLS" ? { ok: true, data: controls() } : { ok: false, error: "The pull request changed since you loaded it" });
  const host = new Node("DIV");
  load().mount(host, "o/r#7", send);
  await tick();
  byAttr(host, "data-action", "close").click();
  byAttr(host, "data-confirm", "close").click();
  await tick();
  assert.match(host.text(), /GitHub did not apply this/);
  assert.doesNotMatch(host.text(), /Verified/);
});

test("load failure shows an error and retry", async () => {
  const host = new Node("DIV");
  load().mount(host, "o/r#7", () => Promise.resolve({ ok: false, error: "GitHub rejected the token (expired or revoked)." }));
  await tick();
  assert.match(host.text(), /Couldn't load pull request controls/);
  assert.match(host.text(), /expired/);
});
