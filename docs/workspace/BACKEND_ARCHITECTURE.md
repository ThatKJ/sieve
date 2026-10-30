# Sieve Workspace — Backend & API Architecture

## 1. Existing Backend Assessment

The Sieve backend is built purely with Python's standard library. It requires zero external pip packages in production, guaranteeing fast startup, zero dependency vulnerabilities, and extreme portability.

### Current Modules:
- `sieve/server.py`: `ThreadingHTTPServer` on localhost.
- `sieve/core.py`: Deterministic claim verification, penalty scoring, confidence ledger, and hotspot radar.
- `sieve/atlas.py`: AST import topology extraction and blast radius computation.
- `sieve/github.py`: Read-only GitHub REST client with local on-disk JSON caching and tarball SHA caching.
- `sieve/llm.py`: Ollama integration for bounded intent/relevance checks.

---

## 2. API Contract Specification

All endpoints return JSON and include standard HTTP status codes:
- `200 OK`: Success.
- `400 Bad Request`: Malformed PR or repository reference.
- `404 Not Found`: Repository or PR does not exist on GitHub.
- `429 Too Many Requests`: GitHub API rate limit hit.
- `502 / 503 Bad Gateway`: GitHub API unreachable.
- `500 Internal Error`: Unexpected server failure (traceback withheld from client).

### 2.1 `GET /api/health`
Checks server, GitHub token, and local Ollama model status.
```json
{
  "model": "qwen3.5:9b",
  "ollama": true,
  "model_installed": true,
  "offline": false,
  "github_auth": true
}
```

### 2.2 `GET /api/queue?repo=:owner/:repo`
Returns open pull requests for the repository, enhanced with categorized maintainer triage buckets.
```json
{
  "owner": "ThatKJ",
  "repo": "sieve-demo-target",
  "summary": {
    "total_open": 3,
    "needs_attention": 1,
    "ready_for_review": 1,
    "potentially_risky": 1,
    "waiting_for_contributor": 0,
    "stale": 0
  },
  "rows": [
    {
      "number": 3,
      "title": "Show negative amounts as -$5.00 instead of $-5.00",
      "author": "ThatKJ",
      "score": 100,
      "verdict": "ready",
      "category": "ready_for_review",
      "changed_files": 2,
      "additions": 7,
      "deletions": 1,
      "top_issues": [],
      "created_at": "2026-10-30T19:48:14Z",
      "updated_at": "2026-10-30T19:48:14Z",
      "draft": false
    }
  ]
}
```

### 2.3 `GET /api/analyze?pr=:owner/:repo#:number&model=0|1`
Returns complete analysis of a single pull request:
```json
{
  "pr": {
    "owner": "ThatKJ",
    "repo": "sieve-demo-target",
    "number": 3,
    "title": "Show negative amounts as -$5.00 instead of $-5.00",
    "author": "ThatKJ",
    "changed_files": 2,
    "additions": 7,
    "deletions": 1,
    "linked_issues": [1]
  },
  "score": 100,
  "verdict": "ready",
  "findings": [],
  "impact": {
    "nodes": [],
    "edges": [],
    "summary": {
      "changed_files": 2,
      "direct_dependents": 2,
      "related_test_files": 1,
      "unresolved_imports": 0
    },
    "limitations": []
  },
  "archaeology": {
    "time_window_days": 90,
    "total_commits": 1,
    "distinct_contributors": 1,
    "per_file_churn": {},
    "candidate_reverts": [],
    "candidate_fixes": []
  },
  "ledger": {
    "groups": [],
    "unknown": []
  },
  "comment": "Draft contributor response..."
}
```

### 2.4 `GET /api/atlas?pr=:ref` or `?repo=:repo`
Returns full repository import graph and impact ripple structure.

---

## 3. CORS & Browser Extension Middleware

For the browser extension to interact with the local Sieve engine from `https://github.com`, the HTTP server must support Cross-Origin Resource Sharing (CORS):
1. **Response Headers on all `/api/*` endpoints:**
   - `Access-Control-Allow-Origin: *` (or matching extension origin)
   - `Access-Control-Allow-Methods: GET, OPTIONS`
   - `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`
2. **`OPTIONS` pre-flight support:** Responds with `204 No Content` and appropriate CORS headers.

---

## 4. Incremental Caching & Synchronization

1. **Commit Tarballs (`.cache/github/tarballs/`):**
   - Keyed by Git commit SHA (`{owner}-{repo}-{sha}.tar.gz`).
   - Because commit SHAs are immutable, tarball snapshots are permanently cached until explicitly pruned.
2. **REST API Cache (`.cache/github/`):**
   - Keyed by URL SHA-256.
   - Dynamic resources (PR list, open issues) have a default 15-minute TTL.
   - Re-analysis can be forced by passing `?force=1` or `Cache-Control: no-cache`.

