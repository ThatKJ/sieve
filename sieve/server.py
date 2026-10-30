"""Tiny stdlib web server: static UI + JSON API. Binds to localhost only."""
import json
import os
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import atlas, core, github, llm

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def health():
    try:
        with urllib.request.urlopen(llm.OLLAMA_URL + "/api/tags", timeout=2) as r:
            models = [m["name"] for m in json.loads(r.read()).get("models", [])]
    except OSError:
        models = None
    return {"model": llm.MODEL, "ollama": models is not None, "model_installed": bool(models and llm.MODEL in models),
            "offline": github.OFFLINE, "github_auth": bool(github._get_token())}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # always serve the current web/ files
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if not url.path.startswith("/api/"):
            return super().do_GET()
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        try:
            if url.path == "/api/health":
                return self._json(200, health())
            if url.path == "/api/analyze":
                owner, repo, number = core.parse_pr_ref(q.get("pr", ""))
                return self._json(200, core.analyze(owner, repo, number, use_model=q.get("model") == "1"))
            if url.path == "/api/atlas":
                if q.get("pr"):
                    return self._json(200, atlas.atlas_for_pr(*core.parse_pr_ref(q["pr"])))
                return self._json(200, atlas.atlas_for_repo(*core.parse_repo_ref(q.get("repo", ""))))
            if url.path == "/api/queue":
                owner, repo = core.parse_repo_ref(q.get("repo", ""))
                return self._json(200, {"owner": owner, "repo": repo, "rows": core.queue(owner, repo)})
            return self._json(404, {"error": "Unknown endpoint"})
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except github.GitHubError as e:
            return self._json(e.status or 502, {"error": str(e)})
        except Exception as e:  # last resort: never leak a traceback to the page
            self.log_error("analysis failed: %r", e)
            return self._json(500, {"error": "Analysis failed unexpectedly. Check the server log."})


def run(port=8787):
    host = os.environ.get("SIEVE_HOST", "127.0.0.1")
    print(f"Sieve running at http://{host}:{port}  (model: {llm.MODEL}, offline: {github.OFFLINE})")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
