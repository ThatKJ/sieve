"""CLI: python -m sieve owner/repo#123 | python -m sieve --queue owner/repo | python -m sieve --serve"""
import argparse
import json
import sys

from . import core, github

ICON = {"fail": "✗", "warn": "!", "info": "·", "pass": "✓"}


def main():
    ap = argparse.ArgumentParser(prog="sieve", description="Evidence-based intake checks for a GitHub pull request.")
    ap.add_argument("target", nargs="?", help="PR (owner/repo#123 or URL), or repo with --queue")
    ap.add_argument("--queue", action="store_true", help="rank a repository's open PRs (fast, no model)")
    ap.add_argument("--no-model", action="store_true", help="skip the local-model relevance check")
    ap.add_argument("--json", action="store_true", help="print raw JSON")
    ap.add_argument("--serve", action="store_true", help="start the web app")
    ap.add_argument("--port", type=int, default=8787)
    a = ap.parse_args()

    if a.serve:
        from . import server
        return server.run(a.port)
    if not a.target:
        ap.error("give a PR or repository")
    try:
        if a.queue:
            rows = core.queue(*core.parse_repo_ref(a.target))
            if a.json:
                return print(json.dumps(rows, indent=2))
            for r in rows:
                print(f"{r.get('score', '--'):>4}  #{r['number']:<6} {r.get('verdict', 'error'):<11} {r['title'][:60]}")
            return
        result = core.analyze(*core.parse_pr_ref(a.target), use_model=not a.no_model)
    except (ValueError, github.GitHubError) as e:
        sys.exit(f"sieve: {e}")
    if a.json:
        return print(json.dumps(result, indent=2))
    p = result["pr"]
    print(f"\n{p['owner']}/{p['repo']}#{p['number']}  {p['title']}\nby @{p['author']}  ·  {result['score']}/100  ·  {result['verdict'].upper()}\n")
    for f in result["findings"]:
        print(f"  {ICON[f['status']]} {f['title']}")
        if f["detail"]:
            print(f"      {f['detail']}")
        for ev in f["evidence"]:
            print(f"      - {ev}")
    if result["model"] and result["model"]["error"]:
        print(f"\n  (model: {result['model']['error']})")
    print("\nDraft comment for the contributor (not posted):\n")
    print(result["comment"])


if __name__ == "__main__":
    main()
