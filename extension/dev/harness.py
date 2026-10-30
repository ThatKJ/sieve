"""Dev harness for the extension UI without installing it in Chrome.

Serves the real extension scripts, unmodified, on a GitHub-shaped URL so content.js and the adapter run their
normal flow. A small chrome.* stub forwards messages to the local Sieve engine like background.js does.

    python3 extension/dev/harness.py      # then open http://localhost:8790/ThatKJ/sieve-demo-target/pulls
    ...?engine=http://127.0.0.1:9          # simulate the engine being offline

Not part of the extension: nothing in manifest.json references this folder.
"""
import http.server
import pathlib

EXT = pathlib.Path(__file__).resolve().parent.parent
PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Sieve harness</title>
<style>body{margin:0;font:14px -apple-system,system-ui,sans-serif;background:#fff;color:#1f2328}
header{padding:16px 24px;border-bottom:1px solid #d0d7de}main{padding:24px}.row{padding:10px 0;border-bottom:1px solid #eee}</style>
</head><body>
<header><div><h1>Pull requests</h1></div></header>
<main><div class="js-check-all-container"><div class="row">Native GitHub pull request list (stand-in)</div></div></main>
<script>
// chrome.* stub with the same message protocol as background.js, talking to the real engine
const ENGINE = new URLSearchParams(location.search).get("engine") || "http://127.0.0.1:8787";
const routes = {
  CHECK_HEALTH: () => "/api/health",
  GET_QUEUE: (m) => "/api/queue?repo=" + encodeURIComponent(m.repo),
  GET_ANALYZE: (m) => "/api/analyze?pr=" + encodeURIComponent(m.pr) + "&model=" + (m.useModel ? 1 : 0),
};
window.__sieveMessages = [];
window.chrome = {
  runtime: {
    getURL: (p) => "/ext/" + p,
    async sendMessage(m) {
      window.__sieveMessages.push(m.type);
      if (m.type === "CLEAR_CACHE") return { ok: true };
      try {
        const r = await fetch(ENGINE + routes[m.type](m));
        const data = await r.json();
        return r.ok ? { ok: true, data } : { ok: false, error: data.error };
      } catch (e) {
        return { ok: false, error: "Cannot connect to Sieve Engine. Is `python3 -m sieve --serve` running?" };
      }
    },
  },
  storage: { local: { get: (k, cb) => cb({}), set: () => {} } },
};
</script>
<script src="/ext/github-adapter.js"></script>
<script src="/ext/ui/topology-svg.js"></script>
<script src="/ext/ui/command-center.js"></script>
<script src="/ext/ui/pr-intelligence.js"></script>
<script src="/ext/ui/activation.js"></script>
<script src="/ext/content.js"></script>
</body></html>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(EXT), **kw)

    def do_GET(self):
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
