// Maintainer-only activation: access-gate.js decisions and lifecycle. Run: node --test extension/test/*.mjs
// All permission data is mocked; nothing here talks to GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../access-gate.js", import.meta.url), "utf8");
function load() {
  const window = {};
  vm.runInNewContext(SRC, { window, Promise, Set });
  return window.SieveAccess;
}
const { decide, createGate } = load();
const reply = (permission, login = "maint", extra = {}) => ({
  ok: true,
  data: { status: ["admin", "maintain", "write"].includes(permission) ? "granted" : "denied",
    eligible: ["admin", "maintain", "write"].includes(permission), permission, login, ...extra },
});
const tick = () => new Promise((r) => setTimeout(r, 0));

for (const role of ["admin", "maintain", "write"]) {
  test(`${role} permission activates Sieve`, () => {
    assert.equal(decide("maint", reply(role)).status, "granted");
  });
}

for (const role of ["triage", "read", "none"]) {
  test(`${role} permission does not activate Sieve`, () => {
    assert.equal(decide("maint", reply(role)).status, "denied");
  });
}

test("an unknown or missing role fails closed, even if the engine claimed eligible", () => {
  assert.equal(decide("maint", { ok: true, data: { eligible: true, permission: "superuser", login: "maint" } }).status, "denied");
  assert.equal(decide("maint", { ok: true, data: { eligible: true, login: "maint" } }).status, "denied");
  assert.equal(decide("maint", { ok: true, data: { permission: "admin", login: "maint" } }).status, "denied"); // no eligible flag
});

test("signed-out viewer does not activate", () => {
  assert.equal(decide(null, reply("admin")).status, "signed_out");
});

test("engine without a GitHub token does not activate", () => {
  assert.equal(decide("maint", { ok: true, data: { status: "unauthenticated", eligible: false } }).status, "unauthenticated");
});

test("permission API failure fails closed and is distinct from denial", () => {
  const d = decide("maint", { ok: false, error: "GitHub returned HTTP 502" });
  assert.equal(d.status, "error");
  assert.match(d.error, /502/);
  assert.equal(decide("maint", undefined).status, "error");
});

test("engine token for another account never grants this viewer", () => {
  const d = decide("visitor", reply("admin", "maint"));
  assert.equal(d.status, "account_mismatch");
  assert.equal(decide("MAINT", reply("admin", "maint")).status, "granted"); // logins are case-insensitive
});

test("gate reports checking, then the answer, and never mounts early", async () => {
  const changes = [];
  const gate = createGate({ fetchAccess: async () => reply("write"), onChange: (d) => changes.push(d.status) });
  assert.equal(gate.get("o/r", "maint").status, "checking");
  await tick();
  assert.deepEqual(changes, ["granted"]);
  assert.equal(gate.get("o/r", "maint").status, "granted");
});

test("navigating eligible -> ineligible repository drops access", async () => {
  const roles = { "o/eligible": "admin", "o/other": "read" };
  const gate = createGate({ fetchAccess: async (repo) => reply(roles[repo]), onChange() {} });
  gate.get("o/eligible", "maint"); await tick();
  assert.equal(gate.get("o/eligible", "maint").status, "granted");
  assert.equal(gate.get("o/other", "maint").status, "checking"); // the previous repository's answer is not reused
  await tick();
  assert.equal(gate.get("o/other", "maint").status, "denied");
});

test("navigating between two eligible repositories checks each one", async () => {
  const asked = [];
  const gate = createGate({ fetchAccess: async (repo) => { asked.push(repo); return reply("write"); }, onChange() {} });
  gate.get("o/a", "maint"); await tick();
  gate.get("o/b", "maint"); await tick();
  const d = gate.get("o/b", "maint");
  assert.equal(d.status, "granted");
  assert.equal(d.repo, "o/b");
  assert.deepEqual(asked, ["o/a", "o/b"]);
});

test("a slow answer for a repository the user already left is ignored", async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const gate = createGate({
    fetchAccess: (repo) => (repo === "o/slow" ? slow : Promise.resolve(reply("read"))),
    onChange() {},
  });
  gate.get("o/slow", "maint");
  gate.get("o/fast", "maint"); await tick();
  release(reply("admin")); await tick();
  const d = gate.current();
  assert.equal(d.repo, "o/fast");
  assert.equal(d.status, "denied");
});

test("changing GitHub account re-checks permission", async () => {
  const asked = [];
  const gate = createGate({
    fetchAccess: async (repo, viewer) => { asked.push(viewer); return reply(viewer === "maint" ? "admin" : "read", viewer); },
    onChange() {},
  });
  gate.get("o/r", "maint"); await tick();
  assert.equal(gate.get("o/r", "maint").status, "granted");
  assert.equal(gate.get("o/r", "visitor").status, "checking");
  await tick();
  assert.equal(gate.get("o/r", "visitor").status, "denied");
  assert.deepEqual(asked, ["maint", "visitor"]);
});

test("retry after an error asks again; a rejected fetch is an error, not a grant", async () => {
  let fail = true;
  const gate = createGate({
    fetchAccess: async () => { if (fail) throw new Error("engine offline"); return reply("maintain"); },
    onChange() {},
  });
  gate.get("o/r", "maint"); await tick();
  assert.equal(gate.get("o/r", "maint").status, "error");
  fail = false;
  gate.refresh(true);
  assert.equal(gate.get("o/r", "maint").status, "checking");
  await tick();
  assert.equal(gate.get("o/r", "maint").status, "granted");
});

test("reset (master switch off) forgets the decision", async () => {
  const gate = createGate({ fetchAccess: async () => reply("admin"), onChange() {} });
  gate.get("o/r", "maint"); await tick();
  gate.reset();
  assert.equal(gate.current(), null);
  assert.equal(gate.get("o/r", "maint").status, "checking");
});
