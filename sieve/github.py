"""Read-only GitHub REST client with an on-disk cache.

Sieve never writes to GitHub: every request here is a GET.
"""
import base64
import hashlib
import json
import os
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.github.com"
CACHE_DIR = Path(os.environ.get("SIEVE_CACHE", Path(__file__).resolve().parent.parent / ".cache" / "github"))
OFFLINE = os.environ.get("SIEVE_OFFLINE") == "1"
CACHE_TTL = int(os.environ.get("SIEVE_CACHE_TTL", "900"))  # seconds; offline mode ignores it


class GitHubError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def _ssl_context():
    # python.org macOS builds ship without a CA bundle; fall back to the system one.
    paths = ssl.get_default_verify_paths()
    if not (paths.cafile and os.path.exists(paths.cafile)) and os.path.exists("/etc/ssl/cert.pem"):
        return ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    return ssl.create_default_context()


SSL_CONTEXT = _ssl_context()
_token = None


def _get_token():
    global _token
    if _token is None:
        _token = os.environ.get("GITHUB_TOKEN") or ""
        if not _token:
            try:  # fall back to the gh CLI's login, if present
                _token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=5).stdout.strip()
            except (OSError, subprocess.TimeoutExpired):
                _token = ""
    return _token


def get(path, params=None):
    """GET an API path, returning parsed JSON. Cached by URL; offline mode reads cache only."""
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    cache_file = CACHE_DIR / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".json")
    if cache_file.exists() and (OFFLINE or time.time() - cache_file.stat().st_mtime < CACHE_TTL):
        return json.loads(cache_file.read_text())
    if OFFLINE:
        raise GitHubError(f"Offline mode and no cached copy of {path}", status=503)

    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "sieve-pr-intake",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    if _get_token():
        req.add_header("Authorization", f"Bearer {_get_token()}")
    try:
        with urllib.request.urlopen(req, timeout=20, context=SSL_CONTEXT) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise GitHubError(f"Not found on GitHub: {path}", status=404) from None
        if e.code in (403, 429):
            raise GitHubError("GitHub rate limit hit. Set GITHUB_TOKEN or log in with `gh auth login`.", status=429) from None
        raise GitHubError(f"GitHub returned HTTP {e.code} for {path}", status=502) from None
    except urllib.error.URLError as e:
        raise GitHubError(f"Could not reach GitHub ({e.reason}). Try SIEVE_OFFLINE=1 with a warmed cache.", status=503) from None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(data))
    return data


def pull(owner, repo, number):
    return get(f"/repos/{owner}/{repo}/pulls/{number}")


def pull_files(owner, repo, number):
    return get(f"/repos/{owner}/{repo}/pulls/{number}/files", {"per_page": 100})


def open_pulls(owner, repo, limit=15):
    return get(f"/repos/{owner}/{repo}/pulls", {"state": "open", "per_page": limit})


def issue(owner, repo, number):
    return get(f"/repos/{owner}/{repo}/issues/{number}")


def tree_paths(owner, repo, sha):
    data = get(f"/repos/{owner}/{repo}/git/trees/{sha}", {"recursive": 1})
    return {t["path"] for t in data.get("tree", [])}, data.get("truncated", False)


def file_text(owner, repo, path, ref):
    data = get(f"/repos/{owner}/{repo}/contents/{urllib.parse.quote(path)}", {"ref": ref})
    return base64.b64decode(data.get("content", "")).decode("utf-8", "replace")


MAX_TARBALL_BYTES = 80 * 1024 * 1024


def tarball(owner, repo, ref):
    """Gzipped snapshot of the repo at `ref` (immutable for a SHA, so cached forever)."""
    cache_file = CACHE_DIR / "tarballs" / f"{owner}_{repo}_{ref}.tar.gz".replace("/", "_")
    if cache_file.exists():
        return cache_file.read_bytes()
    if OFFLINE:
        raise GitHubError(f"Offline mode and no cached snapshot of {owner}/{repo}@{ref[:7]}", status=503)
    req = urllib.request.Request(f"{API}/repos/{owner}/{repo}/tarball/{ref}", headers={"User-Agent": "sieve-pr-intake"})
    if _get_token():
        req.add_header("Authorization", f"Bearer {_get_token()}")
    try:
        with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as resp:
            data = resp.read(MAX_TARBALL_BYTES + 1)
    except urllib.error.HTTPError as e:
        raise GitHubError(f"GitHub returned HTTP {e.code} downloading {owner}/{repo}", status=502 if e.code != 404 else 404) from None
    except urllib.error.URLError as e:
        raise GitHubError(f"Could not download {owner}/{repo} ({e.reason})", status=503) from None
    if len(data) > MAX_TARBALL_BYTES:
        raise GitHubError(f"{owner}/{repo} is too large to map (over {MAX_TARBALL_BYTES // 2**20} MB)", status=413)
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_bytes(data)
    return data


def user(login):
    return get(f"/users/{login}")


def search_issues(query):
    return get("/search/issues", {"q": query, "per_page": 10})


def commits(owner, repo, path=None, since=None, per_page=30, page=1):
    """List commits for a repository, optionally filtered by path or since date."""
    params = {"per_page": min(per_page, 50), "page": max(page, 1)}
    if path:
        params["path"] = path
    if since:
        params["since"] = since
    return get(f"/repos/{owner}/{repo}/commits", params)

