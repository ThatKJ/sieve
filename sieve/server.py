"""Tiny stdlib web server: static UI + JSON API. Binds to localhost only.

Request trust (see SECURITY.md):
  * Host must name this engine (127.0.0.1 / localhost / [::1] on its port, or SIEVE_ALLOWED_HOSTS):
    defeats DNS rebinding.
  * Origin, when present, must exactly match the pinned Sieve extension, the engine's own origin, or
    SIEVE_DEV_ORIGINS. Any other extension, port, scheme, "null" or malformed origin is refused.
  * Write routes additionally require an Origin (browsers always send one on POST), so only the
    Sieve extension or the engine's own page can trigger a GitHub write.
"""
import json
import os
import re
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import actions, atlas, core, gemma, github, llm

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
ENGINE_PORT = 8787
# The ID Chrome derives from the public "key" in extension/manifest.json (identical on every machine).
SIEVE_EXTENSION_ID = "nffobfkdjlmdldapfdajnignlciihlab"
EXTENSION_ORIGIN_RE = re.compile(r"chrome-extension://([a-p]{32})")


def _env_list(name):
    return {v.strip() for v in os.environ.get(name, "").split(",") if v.strip()}


def trusted_extension_ids():
    return {SIEVE_EXTENSION_ID} | _env_list("SIEVE_EXTENSION_IDS")


def _is_allowed_origin(origin, port=None):
    """Exact-match origin policy. A missing Origin (curl, same-origin GET) is allowed for reads only."""
    if origin is None or origin == "":
        return True
    port = port or ENGINE_PORT
    m = EXTENSION_ORIGIN_RE.fullmatch(origin)
    if m:
        return m.group(1) in trusted_extension_ids()
    return origin in {f"http://127.0.0.1:{port}", f"http://localhost:{port}", f"http://[::1]:{port}"} | _env_list("SIEVE_DEV_ORIGINS")


def _is_allowed_host(values, port=None):
    """`values` is every Host header sent. Exactly one, naming this engine, is accepted."""
    port = port or ENGINE_PORT
    if len(values) != 1 or not isinstance(values[0], str):
        return False
    allowed = {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"} | {h.lower() for h in _env_list("SIEVE_ALLOWED_HOSTS")}
    if port == 80:
        allowed |= {"127.0.0.1", "localhost", "[::1]"}
    return values[0].strip().lower() in allowed


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
        "github_auth_source": github.token_source(),
        "writes_enabled": actions.writes_enabled(),
        "gemma_configured": gemma.is_configured(),
        "gemma_model": gemma.MODEL_ID,
    }


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # always serve the current web/ files
        super().end_headers()

    def log_message(self, fmt, *args):
        try:
            rendered = (fmt % args) if args else fmt
            if "/api/" in str(rendered):
                super().log_message(fmt, *args)
        except Exception:
            super().log_message(fmt, *args)

    def _port(self):
        server = getattr(self, "server", None)
        return server.server_address[1] if server else ENGINE_PORT

    def _deny(self, message):
        self.send_response(403)
        self.send_header("Content-Type", "application/json")
        body = json.dumps({"error": message}).encode()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return False

    def _check_origin(self, require_origin=False):
        """Host, then Origin. Named for its original role; every request passes through it first."""
        get_all = getattr(self.headers, "get_all", None)
        hosts = (get_all("Host") or []) if get_all else ([self.headers["Host"]] if "Host" in self.headers else [])
        if not _is_allowed_host(hosts, self._port()):
            return self._deny("Forbidden: unexpected Host header")
        origin = self.headers.get("Origin")
        if require_origin and not origin:
            return self._deny("Forbidden: write requests must come from the Sieve extension")
        if origin is not None and not _is_allowed_origin(origin, self._port()):
            return self._deny("Forbidden: unauthorized origin")
        return True

    def _cors_headers(self):
        origin = self.headers.get("Origin")
        if origin and _is_allowed_origin(origin, self._port()):
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
        url = urllib.parse.urlparse(self.path)
        if not self._check_origin(require_origin=url.path == "/api/pr/action"):
            return
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

        if url.path == "/api/pr/action":
            return self._pr_action(body)

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
                repo_ref = body.get("repo_ref") or body.get("repo")
                pr_number = body.get("pr_number") or body.get("number")
                head_sha = body.get("head_sha")
                message = body.get("message")
                pr_ref = body.get("pr_ref")

                if pr_ref and not (repo_ref and pr_number):
                    try:
                        owner, repo, num = core.parse_pr_ref(pr_ref)
                        repo_ref = f"{owner}/{repo}"
                        pr_number = num
                    except ValueError:
                        pass

                if not repo_ref or not pr_number or not head_sha or not message:
                    return self._json(400, {"error": "Missing required fields: repo_ref, pr_number, head_sha, message."})

                result = gemma.chat_visual_architecture(repo_ref, pr_number, head_sha, message)
                return self._json(200, {"ok": True, "data": result})

            return self._json(404, {"error": "Unknown endpoint"})

        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except RuntimeError as e:
            self.log_error("Gemma request error: %s", str(e)[:300])
            return self._json(502, {"error": str(e)})
        except Exception as e:
            self.log_error("Gemma analysis failed: %r", e)
            return self._json(500, {"error": "Analysis failed unexpectedly. Check the server log."})

    def _pr_action(self, body):
        """One human-confirmed GitHub write. Every field is re-validated here; the extension is not trusted."""
        if not isinstance(body, dict):
            return self._json(400, {"error": "Expected a JSON object."})
        try:
            owner, repo, number = core.parse_pr_ref(body.get("pr") if isinstance(body.get("pr"), str) else "")
            result = actions.perform(owner, repo, number, body.get("action"), body.get("params", {}),
                                     body.get("expected_head_sha"), body.get("request_id"))
            self.log_message("/api/pr/action %s on %s/%s#%s: done", result["action"], owner, repo, number)
            return self._json(200, result)
        except actions.ActionError as e:
            return self._json(e.status, {"error": str(e)})
        except github.GitHubError as e:
            return self._json(e.status or 502, {"error": str(e)})
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:  # never leak a traceback (or anything else) to the page
            self.log_error("pr action failed: %r", type(e).__name__)
            return self._json(500, {"error": "The action failed unexpectedly. Refresh to see GitHub's current state."})

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
            if url.path == "/api/pr/controls":
                return self._json(200, actions.controls(*core.parse_pr_ref(q.get("pr", ""))))
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
                return self._json(200, {"owner": owner, "repo": repo, "summary": summary, "rows": rows, "lifecycle": getattr(rows, "meta", {})})
            return self._json(404, {"error": "Unknown endpoint"})
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except github.GitHubError as e:
            return self._json(e.status or 502, {"error": str(e)})
        except Exception as e:  # last resort: never leak a traceback to the page
            self.log_error("analysis failed: %r", e)
            return self._json(500, {"error": "Analysis failed unexpectedly. Check the server log."})


def run(port=8787):
    global ENGINE_PORT
    ENGINE_PORT = port
    host = os.environ.get("SIEVE_HOST", "127.0.0.1")
    print(f"Sieve running at http://{host}:{port}  (model: {llm.MODEL}, offline: {github.OFFLINE}, "
          f"GitHub auth: {github.token_source()}, writes: {'ENABLED' if actions.writes_enabled() else 'off (read-only)'})")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
