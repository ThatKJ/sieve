"""Tiny stdlib web server: static UI + JSON API. Binds to localhost only."""
import json
import os
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import atlas, core, gemma, github, llm

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def _is_allowed_origin(origin):
    if not origin:
        return True
    origin = origin.strip().rstrip("/")
    if origin.startswith("chrome-extension://"):
        return True
    parsed = urllib.parse.urlparse(origin)
    return parsed.hostname in ("localhost", "127.0.0.1")


def health():
    try:
        with urllib.request.urlopen(llm.OLLAMA_URL + "/api/tags", timeout=2) as r:
            models = [m["name"] for m in json.loads(r.read()).get("models", [])]
    except OSError:
        models = None
    return {
        "model": llm.MODEL,
        "ollama": models is not None,
        "model_installed": bool(models and llm.MODEL in models),
        "offline": github.OFFLINE,
        "github_auth": bool(github._get_token()),
        "gemma_configured": gemma.is_configured(),
        "gemma_model": gemma.MODEL_ID,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # always serve the current web/ files
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def _check_origin(self):
        origin = self.headers.get("Origin")
        if origin and not _is_allowed_origin(origin):
            self.send_response(403)
            self.send_header("Content-Type", "application/json")
            body = json.dumps({"error": "Forbidden: unauthorized origin"}).encode()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return False
        return True

    def _cors_headers(self):
        origin = self.headers.get("Origin")
        if origin and _is_allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
            self.send_header("Vary", "Origin")

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self._check_origin():
            return
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        if not self._check_origin():
            return
        url = urllib.parse.urlparse(self.path)
        if not url.path.startswith("/api/"):
            return self._json(404, {"error": "Unknown endpoint"})

        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (ValueError, TypeError):
            return self._json(400, {"error": "Invalid Content-Length"})

        # Guard against DOS / payload bombs (10 MB limit)
        if content_length > 10 * 1024 * 1024:
            return self._json(413, {"error": "Payload exceeds 10MB limit"})

        try:
            body_bytes = self.rfile.read(content_length)
            body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception as e:
            return self._json(400, {"error": f"Invalid JSON payload: {e}"})

        try:
            if url.path == "/api/gemma/analyze":
                image_b64 = body.get("image_b64") or body.get("image")
                pr_ref = body.get("pr_ref") or body.get("pr")
                question = body.get("question")
                evidence = body.get("evidence")

                if not image_b64:
                    return self._json(400, {"error": "Missing required 'image_b64' parameter."})

                if not evidence and pr_ref:
                    owner, repo, number = core.parse_pr_ref(pr_ref)
                    analysis = core.analyze(owner, repo, number, use_model=False)
                    evidence = gemma.build_structured_evidence(
                        analysis.get("pr", {}),
                        analysis.get("impact", {}),
                        analysis.get("findings", [])
                    )

                if not evidence:
                    return self._json(400, {"error": "Missing required 'evidence' or valid 'pr_ref'."})

                result = gemma.analyze_visual_architecture(image_b64, evidence, user_question=question)
                return self._json(200, {"ok": True, "data": result})

            if url.path == "/api/gemma/chat":
                repo_ref = body.get("repo_ref") or body.get("pr_ref")
                head_sha = body.get("head_sha")
                message = body.get("message")

                if not repo_ref or not head_sha or not message:
                    return self._json(400, {"error": "Missing required fields: repo_ref, head_sha, message."})

                result = gemma.chat_visual_architecture(repo_ref, head_sha, message)
                return self._json(200, {"ok": True, "data": result})

            return self._json(404, {"error": "Unknown endpoint"})

        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except RuntimeError as e:
            return self._json(502, {"error": str(e)})
        except Exception as e:
            self.log_error("Gemma analysis failed: %r", e)
            return self._json(500, {"error": "Analysis failed unexpectedly. Check the server log."})

    def do_GET(self):
        if not self._check_origin():
            return
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
                rows = core.queue(owner, repo)
                summary = {
                    "total_open": len(rows),
                    "needs_attention": sum(1 for r in rows if r.get("category") == "needs_attention"),
                    "ready_for_review": sum(1 for r in rows if r.get("category") == "ready_for_review"),
                    "potentially_risky": sum(1 for r in rows if r.get("category") == "potentially_risky"),
                    "drafts": sum(1 for r in rows if r.get("draft")),
                }
                return self._json(200, {"owner": owner, "repo": repo, "summary": summary, "rows": rows})
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
