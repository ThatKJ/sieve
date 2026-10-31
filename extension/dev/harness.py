"""Dev harness for the extension UI without installing it in Chrome.

Serves the real extension scripts, unmodified, on a GitHub-shaped URL so content.js and the adapter run their
normal flow. A small chrome.* stub forwards messages to the local Sieve engine like background.js does.

    python3 extension/dev/harness.py      # then open http://localhost:8790/ThatKJ/sieve-demo-target/pulls
    ...?engine=http://127.0.0.1:9          # simulate the engine being offline
    ...?login=ThatKJ&perms={"ThatKJ/sieve-demo-target":"write","pallets/click":"read"}
                                           # mock the maintainer permission check (no GitHub involved);
                                           # a value of "error" or "unauthenticated" simulates those replies,
                                           # login= sets the signed-in account (empty = signed out)

Not part of the extension: nothing in manifest.json references this folder.
"""
import http.server
import pathlib

EXT = pathlib.Path(__file__).resolve().parent.parent
PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Sieve harness</title>
<style>body{margin:0;font:14px -apple-system,system-ui,sans-serif;background:#fff;color:#1f2328}
header{padding:16px 24px;border-bottom:1px solid #d0d7de}main{padding:24px}.row{padding:10px 0;border-bottom:1px solid #eee}</style>
</head><body>
<header><div id="subnav-wrap"><h1>Pull requests</h1></div></header>
<main id="main"></main>
<script>
// Signed-in account, as GitHub renders it. ?login= overrides; an empty value means signed out.
(() => {
  const login = new URLSearchParams(location.search).get("login");
  if (login === "") return;
  const m = document.createElement("meta"); m.name = "user-login"; m.content = login || "ThatKJ";
  document.head.append(m);
})();
// ?nodom=1 starts without GitHub's list, to simulate slow rendering; window.__renderList() adds it.
window.__renderList = () => {
  const list = document.createElement("div");
  list.className = "js-check-all-container";
  list.innerHTML = '<div class="row">Native GitHub pull request list (stand-in)</div>';
  document.getElementById("main").replaceChildren(list);
  return list;
};
if (!new URLSearchParams(location.search).has("nodom")) window.__renderList();
</script>
<script>
// chrome.* stub with the same message protocol as background.js, talking to the real engine
const ENGINE = new URLSearchParams(location.search).get("engine") || "http://127.0.0.1:8787";
const routes = {
  CHECK_HEALTH: () => "/api/health",
  GET_QUEUE: (m) => "/api/queue?repo=" + encodeURIComponent(m.repo),
  GET_REPO_ACCESS: (m) => "/api/permission?repo=" + encodeURIComponent(m.repo),
  GET_ANALYZE: (m) => "/api/analyze?pr=" + encodeURIComponent(m.pr) + "&model=" + (m.useModel ? 1 : 0),
};
window.__sieveMessages = [];
window.chrome = {
  runtime: {
    getURL: (p) => "/ext/" + p,
    async sendMessage(m) {
      window.__sieveMessages.push(m.type);
      if (m.type === "CLEAR_CACHE") return { ok: true };
      const mockPerms = new URLSearchParams(location.search).get("perms");
      if (m.type === "GET_REPO_ACCESS" && mockPerms) {
        const role = JSON.parse(mockPerms)[m.repo] || "none";
        await new Promise((r) => setTimeout(r, 40)); // a real check is never instant
        if (role === "error") return { ok: false, error: "GitHub returned HTTP 502 while checking repository permissions" };
        if (role === "unauthenticated") return { ok: true, data: { repo: m.repo, status: "unauthenticated", eligible: false, permission: null, login: null } };
        const engineLogin = new URLSearchParams(location.search).get("engineLogin") || m.viewer;
        const eligible = ["admin", "maintain", "write"].includes(role);
        return { ok: true, data: { repo: m.repo, status: eligible ? "granted" : "denied", eligible, permission: role, login: engineLogin } };
      }
      if (m.type === "ANALYZE_GEMMA_VISUAL") {
        try {
          const r = await fetch(ENGINE + "/api/gemma/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_b64: m.image_b64, pr_ref: m.pr_ref, evidence: m.evidence, question: m.question })
          });
          const json = await r.json();
          return r.ok && json.ok ? { ok: true, data: json.data } : { ok: false, error: json.error };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }
      if (m.type === "CHAT_GEMMA_VISUAL") {
        try {
          const r = await fetch(ENGINE + "/api/gemma/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pr_ref: m.pr_ref, message: m.message, history: m.history })
          });
          const json = await r.json();
          return r.ok && json.ok ? { ok: true, data: json.data } : { ok: false, error: json.error };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }
      try {
        const r = await fetch(ENGINE + routes[m.type](m));
        const data = await r.json();
        return r.ok ? { ok: true, data } : { ok: false, error: data.error };
      } catch (e) {
        return { ok: false, error: "Cannot connect to Sieve Engine. Is `python3 -m sieve --serve` running?" };
      }
    },
  },
  storage: (() => {
    // In-memory chrome.storage.local with onChanged, seeded from ?prefs=<json>
    const data = JSON.parse(new URLSearchParams(location.search).get("prefs") || "{}");
    const listeners = [];
    const emit = (changes) => listeners.forEach((fn) => fn(changes, "local"));
    return {
      local: {
        get: (keys, cb) => { const out = {}; [].concat(keys).forEach((k) => { if (k in data) out[k] = data[k]; }); setTimeout(() => cb(out), 30); },
        set: (obj, cb) => { const ch = {}; for (const [k, v] of Object.entries(obj)) { ch[k] = { oldValue: data[k], newValue: v }; data[k] = v; } emit(ch); cb && cb(); },
        remove: (k, cb) => { const ch = { [k]: { oldValue: data[k], newValue: undefined } }; delete data[k]; emit(ch); cb && cb(); },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    };
  })(),
};
window.chrome.runtime.id = "harness";
window.__sieveListeners = [];
window.chrome.runtime.onMessage = { addListener: (fn) => window.__sieveListeners.push(fn) };
// Ask the content script for its status, the way the popup does
window.__sieveStatus = () => new Promise((resolve) => window.__sieveListeners.forEach((fn) => fn({ type: "SIEVE_STATUS" }, {}, resolve)));
</script>
<script src="/ext/github-adapter.js"></script>
<script src="/ext/access-gate.js"></script>
<script src="/ext/ui/topology-svg.js"></script>
<script src="/ext/ui/command-center.js"></script>
<script src="/ext/ui/pr-controls.js"></script>
<script src="/ext/ui/pr-intelligence.js"></script>
<script src="/ext/ui/activation.js"></script>
<script src="/ext/content.js"></script>
</body></html>"""


POPUP_STUB = """<script>
// Popup harness: real popup.html/js, chrome.* stubbed. ?tab=<json SIEVE_STATUS reply> or ?tab=none
const P = new URLSearchParams(location.search);
const store = JSON.parse(P.get("prefs") || "{}");
window.__popupWrites = [];
window.chrome = {
  runtime: {
    lastError: undefined,
    sendMessage(msg, cb) {
      if (msg.type === "CLEAR_CACHE") return cb && cb({ ok: true });
      fetch((P.get("engine") || "http://127.0.0.1:8787") + "/api/health")
        .then((r) => r.json()).then((data) => cb({ ok: true, data }))
        .catch(() => cb({ ok: false, error: "Cannot connect to Sieve Engine." }));
    },
  },
  storage: { local: {
    get(keys, cb) { const out = {}; [].concat(keys).forEach((k) => { if (k in store) out[k] = store[k]; }); cb(out); },
    set(obj, cb) { Object.assign(store, obj); window.__popupWrites.push(obj); cb && cb(); },
    remove(k, cb) { delete store[k]; window.__popupWrites.push({ removed: k }); cb && cb(); },
  } },
  tabs: {
    query(q, cb) { cb([{ id: 1, url: P.get("url") || "https://github.com/ThatKJ/sieve-demo-target/pulls" }]); },
    sendMessage(id, msg, cb) {
      const t = P.get("tab");
      if (t === "none") { chrome.runtime.lastError = { message: "Receiving end does not exist." }; cb(undefined); chrome.runtime.lastError = undefined; return; }
      cb(JSON.parse(t || '{"present":true,"enabled":true,"activation":"complete","route":"PULLS","supported":true,"mounted":true,"mode":"sieve","contextValid":true,"events":[]}'));
    },
  },
};
</script>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(EXT), **kw)

    def do_GET(self):
        if self.path.startswith("/popup"):
            html = (EXT / "popup" / "popup.html").read_text()
            html = html.replace('href="popup.css"', 'href="/ext/popup/popup.css"')
            html = html.replace('<script src="popup.js"></script>', POPUP_STUB + '<script src="/ext/popup/popup.js"></script>')
            body = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/ext/"):
            self.path = self.path[4:]
            return super().do_GET()
        body = PAGE.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    print("Harness at http://localhost:8790/ThatKJ/sieve-demo-target/pulls")
    http.server.ThreadingHTTPServer(("127.0.0.1", 8790), Handler).serve_forever()
