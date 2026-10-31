"""GitHub REST/GraphQL client with an on-disk cache for reads.

Reads are cached GETs (and GraphQL queries). The only writes are `write()` and `graphql_mutation()`,
which are never cached and are called exclusively from `sieve.actions` after a human confirms.
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


GRAPHQL_TTL = 60  # seconds: lifecycle data (reviews, checks) changes faster than repository contents
LIFECYCLE_QUERY = """
query($owner: String!, $repo: String!, $after: String) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequests(states: OPEN, first: 50, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url isDraft createdAt mergeable reviewDecision
        author { login }
        labels(first: 10) { nodes { name } }
        reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
        latestOpinionatedReviews(first: 20) { nodes { author { login } state submittedAt } }
        commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state
          contexts(first: 50) { nodes { ... on CheckRun { name conclusion } ... on StatusContext { context state } } } } } } }
      }
    }
  }
}"""


def graphql(query, variables, ttl=GRAPHQL_TTL):
    """Run a read-only GraphQL query. Returns (data, fetched_at_epoch).

    GraphQL is POST-only, but this sends queries, never mutations. Cached like GET responses, and the
    cache file's mtime is returned as fetched_at so callers never present cached data as fresh.
    """
    if not _get_token():
        raise GitHubError("GitHub's GraphQL API needs a token: set GITHUB_TOKEN or run `gh auth login`.", status=401)
    key = hashlib.sha256(json.dumps([query, variables], sort_keys=True).encode()).hexdigest()[:24]
    cache_file = CACHE_DIR / f"graphql-{key}.json"
    if cache_file.exists() and (OFFLINE or time.time() - cache_file.stat().st_mtime < ttl):
        return json.loads(cache_file.read_text()), cache_file.stat().st_mtime
    if OFFLINE:
        raise GitHubError("Offline mode and no cached lifecycle data", status=503)
    req = urllib.request.Request(f"{API}/graphql", data=json.dumps({"query": query, "variables": variables}).encode(),
                                 method="POST", headers={"User-Agent": "sieve-pr-intake", "Content-Type": "application/json",
                                                         "Authorization": f"Bearer {_get_token()}"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            raise GitHubError("GitHub rate limit hit on the GraphQL API.", status=429) from None
        raise GitHubError(f"GitHub GraphQL returned HTTP {e.code}", status=502) from None
    except urllib.error.URLError as e:
        raise GitHubError(f"Could not reach GitHub ({e.reason}).", status=503) from None
    if payload.get("errors") and not payload.get("data"):
        raise GitHubError("GitHub GraphQL error: " + "; ".join(err.get("message", "?") for err in payload["errors"][:3]), status=502)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(payload["data"]))
    return payload["data"], time.time()


def pull_lifecycle(owner, repo, max_prs=100):
    """Open PRs with reviews, review requests, merge state and checks: one query per 50 PRs (no N+1).

    Returns (nodes, meta) where meta has viewer, total_count, fetched_at and whether the list is truncated.
    """
    nodes, after, fetched = [], None, []
    viewer = total = None
    while True:
        data, at = graphql(LIFECYCLE_QUERY, {"owner": owner, "repo": repo, "after": after})
        fetched.append(at)
        viewer = (data.get("viewer") or {}).get("login")
        repo_data = data.get("repository")
        if repo_data is None:
            raise GitHubError(f"Repository {owner}/{repo} not found or not accessible with this token", status=404)
        prs = repo_data["pullRequests"]
        total = prs["totalCount"]
        nodes += [n for n in prs["nodes"] if n]
        page = prs["pageInfo"]
        if not page["hasNextPage"] or len(nodes) >= max_prs:
            break
        after = page["endCursor"]
    return nodes[:max_prs], {"viewer": viewer, "total_count": total, "fetched_at": min(fetched), "truncated": total > len(nodes[:max_prs])}


def _write_error(e):
    """Map a GitHub HTTPError on a write to a GitHubError carrying GitHub's own reason (never headers or the token)."""
    try:
        payload = json.loads(e.read() or b"{}")
    except (ValueError, OSError):
        payload = {}
    reason = str(payload.get("message") or f"HTTP {e.code}")[:300]
    details = "; ".join(str(x.get("message") or x.get("code") or "") for x in (payload.get("errors") or [])[:3]
                        if isinstance(x, dict))
    if details:
        reason += f" ({details[:300]})"
    if e.code == 401:
        return GitHubError("GitHub rejected the token (expired or revoked). Run `gh auth login` or update GITHUB_TOKEN.", status=401)
    if e.code == 429 or (e.code == 403 and (e.headers.get("X-RateLimit-Remaining") == "0" or "rate limit" in reason.lower())):
        return GitHubError("GitHub rate limit hit. Nothing was changed; try again later.", status=429)
    if e.code == 403:
        return GitHubError(f"GitHub denied this action for your token: {reason}", status=403)
    if e.code == 404:
        return GitHubError("Not found on GitHub, or this token cannot see the repository.", status=404)
    if e.code in (405, 409, 422):
        return GitHubError(f"GitHub refused: {reason}", status=409 if e.code != 422 else 422)
    return GitHubError(f"GitHub returned HTTP {e.code}: {reason}", status=502)


def write(method, path, body=None):
    """Send one uncached write (POST/PUT/PATCH/DELETE) and return GitHub's parsed JSON response (or {})."""
    if method not in ("POST", "PUT", "PATCH", "DELETE"):
        raise ValueError(f"Unsupported write method {method}")
    if OFFLINE:
        raise GitHubError("Offline mode: GitHub writes are unavailable.", status=503)
    if not _get_token():
        raise GitHubError("No GitHub token: set GITHUB_TOKEN or run `gh auth login`.", status=401)
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": "sieve-pr-intake",
                                          "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
                                          "Authorization": f"Bearer {_get_token()}"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        raise _write_error(e) from None
    except urllib.error.URLError as e:
        # The request may or may not have reached GitHub; callers re-read state instead of assuming either.
        raise GitHubError(f"Could not reach GitHub ({e.reason}). The action may not have been applied; refresh to check.", status=503) from None
    return json.loads(raw) if raw else {}


def graphql_mutation(query, variables):
    """Run one uncached GraphQL mutation (used for draft/ready, which REST cannot do)."""
    if not query.lstrip().startswith("mutation"):
        raise ValueError("graphql_mutation only sends mutations")
    payload = write("POST", "/graphql", {"query": query, "variables": variables})
    if payload.get("errors"):
        raise GitHubError("GitHub refused: " + "; ".join(str(err.get("message", "?")) for err in payload["errors"][:3]), status=409)
    return payload.get("data") or {}


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

