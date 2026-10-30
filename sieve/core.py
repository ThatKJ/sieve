"""Sieve's analysis engine: verify what a PR claims against what it contains.

Pure functions (check_*) take plain data so they can be tested without network.
`analyze()` fetches from GitHub, runs every check, asks the local model one
question, and scores the result.
"""
import posixpath
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from . import github, llm

# ---------------------------------------------------------------- findings

PASS, INFO, WARN, FAIL = "pass", "info", "warn", "fail"


def finding(check, status, title, detail="", evidence=None, fix=None, penalty=0):
    return {"check": check, "status": status, "title": title, "detail": detail,
            "evidence": evidence or [], "fix": fix, "penalty": penalty}


# ---------------------------------------------------------------- parsing helpers

CLOSING_RE = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s*(?:#(\d+)|https://github\.com/([\w.-]+)/([\w.-]+)/issues/(\d+))", re.I)
MENTION_RE = re.compile(r"(?<![\w/])#(\d+)\b")
TEST_CLAIM_RE = re.compile(r"\b(?:add(?:ed|s|ing)?|wr(?:ote|ite|itten)|includ(?:e|es|ed|ing)|new|with)\b[^.\n]{0,40}?\b(?:unit |integration |e2e )?tests?\b|\btest coverage\b|\btests? (?:added|included)\b", re.I)
TEST_PATH_RE = re.compile(r"(^|/)(tests?|__tests__|spec|specs)/|(^|/)test_[^/]+$|_test\.\w+$|\.(test|spec)\.\w+$", re.I)
DOC_EXT = (".md", ".rst", ".txt", ".adoc")
CODE_EXT = (".py", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".c", ".cc", ".cpp", ".h", ".cs", ".swift")
PATH_TOKEN_RE = re.compile(r"(?<![\w/.:-])((?:[\w.-]+/)*[\w-]+\.(?:py|js|ts|tsx|jsx|mjs|go|rs|java|kt|rb|php|c|cc|cpp|h|cs|swift|json|ya?ml|toml|md))\b")
PY_IMPORT_RE = re.compile(r"^\s*(?:from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)|import\s+([\w.]+))")
JS_IMPORT_RE = re.compile(r"""(?:from\s+|require\(\s*|import\(\s*|import\s+)['"](\.{1,2}/[^'"]+)['"]""")
JS_EXTS = ("", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".json", ".vue", ".svelte", ".css", ".scss",
           "/index.js", "/index.ts", "/index.tsx", "/index.jsx")


def linked_issues(body, owner, repo):
    """Issue numbers this PR says it closes (same repo only)."""
    nums = []
    for m in CLOSING_RE.finditer(body or ""):
        if m.group(1):
            nums.append(int(m.group(1)))
        elif m.group(2).lower() == owner.lower() and m.group(3).lower() == repo.lower():
            nums.append(int(m.group(4)))
    return sorted(set(nums))


def added_lines(patch):
    return [l[1:] for l in (patch or "").splitlines() if l.startswith("+") and not l.startswith("+++")]


def removed_lines(patch):
    return [l[1:] for l in (patch or "").splitlines() if l.startswith("-") and not l.startswith("---")]


def is_test_path(path):
    return bool(TEST_PATH_RE.search(path))


def is_doc_path(path):
    return path.lower().endswith(DOC_EXT) or path.lower().startswith("docs/")


# ---------------------------------------------------------------- deterministic checks

def check_description(body):
    text = (body or "").strip()
    stripped = re.sub(r"<!--.*?-->", "", text, flags=re.S).strip()
    if len(stripped) < 20:
        return finding("description", FAIL, "Description is empty",
                       "The PR body has no explanation of what changed or why.",
                       fix="Describe what the change does and why it's needed.", penalty=25)
    return finding("description", PASS, "Has a written description")


def check_linked_issue(issue_nums, issues):
    """issues: {num: issue json or None if missing}"""
    if not issue_nums:
        return [finding("linked_issue", WARN, "No linked issue",
                        "The PR doesn't say which issue it resolves (no 'Fixes #N').",
                        fix="Link the issue this PR resolves with `Fixes #<number>`, or explain why no issue exists.", penalty=10)]
    out = []
    for n in issue_nums:
        data = issues.get(n)
        if data is None:
            out.append(finding("linked_issue", FAIL, f"Links #{n}, which doesn't exist",
                               fix=f"Issue #{n} doesn't exist in this repo. Link the correct issue.", penalty=20))
        elif "pull_request" in data:
            out.append(finding("linked_issue", FAIL, f"#{n} is a pull request, not an issue", evidence=[data["html_url"]],
                               fix=f"#{n} is a PR. Link the issue you are fixing.", penalty=15))
        elif data.get("state") == "closed":
            out.append(finding("linked_issue", WARN, f"Linked issue #{n} is already closed", evidence=[data["html_url"]],
                               fix=f"#{n} is already closed. Check whether this change is still needed.", penalty=10))
        else:
            out.append(finding("linked_issue", PASS, f"Resolves open issue #{n}: {data['title'][:80]}", evidence=[data["html_url"]]))
    return out


def check_test_claim(body, files):
    paths = [f["filename"] for f in files]
    test_files = [p for p in paths if is_test_path(p)]
    code_files = [p for p in paths if p.endswith(CODE_EXT) and not is_test_path(p)]
    claim = TEST_CLAIM_RE.search(body or "")
    if claim and not test_files:
        return finding("tests", FAIL, "Claims tests were added, but the diff has no test files",
                       f"Description says “{claim.group(0).strip()}”, yet none of the {len(paths)} changed files is a test.",
                       fix="The description mentions tests but none are included. Add them or correct the description.", penalty=20)
    if test_files:
        return finding("tests", PASS, f"Includes {len(test_files)} test file(s)", evidence=test_files[:5])
    if code_files:
        return finding("tests", WARN, "Changes code without tests",
                       f"{len(code_files)} source file(s) changed, no test files.",
                       fix="Add a test that covers the change.", penalty=8)
    return finding("tests", INFO, "No code changes, so no tests expected")


def check_triviality(files):
    if not files:
        return finding("substance", FAIL, "PR changes no files", penalty=30)
    whitespace_only = all(
        sorted(l.strip() for l in added_lines(f.get("patch")) if l.strip()) ==
        sorted(l.strip() for l in removed_lines(f.get("patch")) if l.strip())
        for f in files if f.get("patch") is not None
    ) and any(f.get("patch") for f in files)
    if whitespace_only:
        return finding("substance", FAIL, "Whitespace/formatting-only change",
                       "Every changed line is identical apart from whitespace.",
                       fix="This PR only changes whitespace. Please pick an issue with a functional change.", penalty=30)
    changed = sum(f.get("additions", 0) + f.get("deletions", 0) for f in files)
    if all(is_doc_path(f["filename"]) for f in files) and changed <= 4:
        return finding("substance", WARN, f"Cosmetic docs edit ({changed} line(s))",
                       "Tiny documentation-only change. Often legitimate typo fixes, often drive-by.",
                       penalty=12)
    return finding("substance", PASS, f"{len(files)} file(s), {changed} changed line(s)")


def _python_module_exists(module, paths):
    base = module.replace(".", "/")
    return any(p in paths for p in (base + ".py", base + "/__init__.py")) or any(p.startswith(base + "/") for p in paths)


def resolve_import(src_file, spec, lang, paths, local_roots):
    """Return True/False if resolvable/unresolvable, None if not a repo-local import."""
    src_dir = posixpath.dirname(src_file)
    if lang == "js":
        target = posixpath.normpath(posixpath.join(src_dir, spec))
        return any(target + ext in paths for ext in JS_EXTS)
    module, names = spec
    if module.startswith("."):
        dots = len(module) - len(module.lstrip("."))
        base = src_dir
        for _ in range(dots - 1):
            base = posixpath.dirname(base)
        rest = module.lstrip(".")
        if not rest:
            return None  # `from . import x`: x may be a name in __init__, can't verify cheaply
        mod = posixpath.join(base, rest.replace(".", "/")) if base else rest.replace(".", "/")
        return _python_module_exists(mod.replace("/", "."), paths)
    top = module.split(".")[0]
    for root in local_roots:
        if top == root.rsplit("/", 1)[-1]:
            prefix = "src." if root.startswith("src/") else ""
            return _python_module_exists(prefix + module, paths)
    return None


def local_python_roots(paths):
    """Top-level importable packages/modules in the repo (incl. src/ layout)."""
    roots = set()
    for p in paths:
        parts = p.split("/")
        if parts[0] == "src" and len(parts) > 2 and parts[2] == "__init__.py":
            roots.add("src/" + parts[1])
        elif len(parts) == 2 and parts[1] == "__init__.py":
            roots.add(parts[0])
        elif len(parts) == 1 and p.endswith(".py"):
            roots.add(p[:-3])
    return roots


def check_imports(files, base_paths):
    """Flag imports added by the PR that point at repo files that don't exist."""
    removed = {f["filename"] for f in files if f.get("status") == "removed"}
    paths = (set(base_paths) | {f["filename"] for f in files}) - removed
    roots = local_python_roots(paths)
    unresolved, checked = [], 0
    for f in files:
        name = f["filename"]
        lang = "py" if name.endswith(".py") else "js" if name.endswith((".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".vue", ".svelte")) else None
        if not lang:
            continue
        for line in added_lines(f.get("patch")):
            if lang == "py":
                m = PY_IMPORT_RE.match(line)
                if not m:
                    continue
                spec = (m.group(1) or m.group(3), m.group(2))
            else:
                m = JS_IMPORT_RE.search(line)
                if not m:
                    continue
                spec = m.group(1)
            ok = resolve_import(name, spec, lang, paths, roots)
            if ok is None:
                continue
            checked += 1
            if not ok:
                shown = spec if lang == "js" else spec[0]
                unresolved.append(f"{name}: imports `{shown}`")
    if unresolved:
        return finding("imports", FAIL, f"{len(unresolved)} import(s) point at modules that don't exist",
                       "These repo-local imports resolve to no file in the base branch or this PR, which is a common sign of generated code that was never run.",
                       evidence=unresolved[:6], fix="Some imports reference modules that don't exist in the repo. Run the code locally and fix them.",
                       penalty=min(35, 20 + 5 * len(unresolved)))
    if checked:
        return finding("imports", PASS, f"All {checked} new local import(s) resolve")
    return finding("imports", INFO, "No new repo-local imports to verify")


def check_referenced_paths(body, files, base_paths):
    """Files named in the description must exist somewhere (repo or diff)."""
    changed = {f["filename"] for f in files}
    universe = set(base_paths) | changed
    text = re.sub(r"https?://\S+", "", body or "")
    missing = []
    for tok in sorted(set(PATH_TOKEN_RE.findall(text))):
        if not any(p == tok or p.endswith("/" + tok) for p in universe):
            missing.append(tok)
    if missing:
        return finding("references", FAIL, f"Description mentions {len(missing)} file(s) that don't exist",
                       "Neither the repository nor this PR contains these paths.", evidence=missing[:6],
                       fix="The description refers to files that aren't in the repo: " + ", ".join(f"`{m}`" for m in missing[:4]) + ". Please correct it.",
                       penalty=min(25, 10 + 5 * len(missing)))
    return finding("references", PASS, "Every file named in the description exists")


def check_layout(files, base_paths):
    """New source files dropped where the repo keeps no files of that type."""
    misplaced = []
    for f in files:
        name = f["filename"]
        if f.get("status") != "added" or not name.endswith(CODE_EXT) or is_test_path(name):
            continue
        folder, ext = posixpath.dirname(name), posixpath.splitext(name)[1]
        siblings = [p for p in base_paths if posixpath.dirname(p) == folder and p.endswith(ext)]
        if not siblings:
            misplaced.append(f"{name} (no other {ext} files in {folder or 'the repo root'})")
    if misplaced:
        return finding("layout", WARN, "New file placed outside the repo's existing structure",
                       "Maintainers usually expect new code next to similar code.", evidence=misplaced[:5],
                       fix="Move new files into the directory where similar code lives (see CONTRIBUTING).", penalty=10)
    return None


def check_checklist(body):
    boxes = re.findall(r"^\s*[-*]\s+\[( |x|X)\]", body or "", re.M)
    ticked = sum(1 for b in boxes if b.lower() == "x")
    if len(boxes) >= 3 and ticked <= 1:
        return finding("checklist", WARN, f"Template checklist left unticked ({ticked}/{len(boxes)})",
                       fix="Go through the PR checklist and tick what applies.", penalty=6)
    return None


def check_template(body, template):
    if not template:
        return None
    headings = [h.strip() for h in re.findall(r"^#{2,3}\s+(.+)$", template, re.M)]
    if not headings:
        return None
    present = [h for h in headings if h.lower() in (body or "").lower()]
    if len(present) < max(1, len(headings) // 2):
        return finding("template", WARN, "PR template not followed",
                       f"Found {len(present)} of {len(headings)} template sections.", evidence=headings[:6],
                       fix="Please fill in the repository's PR template sections: " + ", ".join(headings[:4]) + ".", penalty=10)
    return finding("template", PASS, f"Follows the PR template ({len(present)}/{len(headings)} sections)")


def check_author(pr, user_data, recent_pr_count):
    out = []
    assoc = pr.get("author_association", "NONE")
    login = pr["user"]["login"]
    if assoc in ("FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER"):
        out.append(finding("author", INFO, f"@{login} is a first-time contributor here",
                           "Not a negative signal on its own. Be welcoming if the work checks out."))
    if user_data:
        created = datetime.fromisoformat(user_data["created_at"].replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - created).days
        if age < 14:
            out.append(finding("author", INFO, f"Account is {age} day(s) old"))
    if recent_pr_count is not None and recent_pr_count >= 20:
        out.append(finding("author", WARN, f"@{login} opened {recent_pr_count} PRs across GitHub in the last 7 days",
                           "High-volume PR activity across many repos is typical of contribution farming.", penalty=10))
    return out


def check_competing(pr_number, issue_nums, competing):
    """competing: {issue_num: [pr numbers]} of other open PRs mentioning the issue."""
    out = []
    for n in issue_nums:
        others = [p for p in competing.get(n, []) if p != pr_number]
        if others:
            out.append(finding("competing", INFO, f"{len(others)} other open PR(s) also target #{n}",
                               evidence=[f"#{p}" for p in others[:5]]))
    return out


# ---------------------------------------------------------------- scoring

def score(findings):
    total = 100 - sum(f["penalty"] for f in findings)
    total = max(0, min(100, total))
    if total >= 75:
        verdict = "ready"
    elif total >= 45:
        verdict = "needs-work"
    else:
        verdict = "low-effort"
    return total, verdict


def contributor_comment(pr, findings, judgment):
    fixes = [f["fix"] for f in findings if f["fix"] and f["status"] in (WARN, FAIL)]
    if judgment and judgment["verdict"] in ("partial", "unrelated"):
        fixes += [g[0].upper() + g[1:] for g in judgment["gaps"]]
    if not fixes:
        return (f"Thanks @{pr['user']['login']}! Automated intake checks passed; a maintainer will review this soon.")
    lines = [f"Thanks for the contribution, @{pr['user']['login']}! Before a maintainer reviews this, could you take care of the following?", ""]
    lines += [f"- [ ] {fx}" for fx in dict.fromkeys(fixes)]
    lines += ["", "_These checks are automated and may be wrong. Reply here if something doesn't apply._"]
    return "\n".join(lines)


def build_diff(files, limit=7000):
    chunks, size = [], 0
    for f in sorted(files, key=lambda f: is_test_path(f["filename"])):  # source before tests
        piece = f"--- {f['filename']} ({f.get('status')})\n{f.get('patch') or '(binary or too large)'}\n"
        if size + len(piece) > limit:
            chunks.append(piece[: max(0, limit - size)] + "\n…(truncated)")
            break
        chunks.append(piece)
        size += len(piece)
    return "".join(chunks)


# ---------------------------------------------------------------- orchestration

PR_URL_RE = re.compile(r"(?:https?://github\.com/)?([\w.-]+)/([\w.-]+)(?:/pull/|#)(\d+)")
REPO_RE = re.compile(r"^(?:https?://github\.com/)?([\w.-]+)/([\w.-]+?)/?$")


def parse_pr_ref(ref):
    m = PR_URL_RE.search((ref or "").strip())
    if not m:
        raise ValueError("Expected a PR like https://github.com/owner/repo/pull/123 or owner/repo#123")
    return m.group(1), m.group(2), int(m.group(3))


def parse_repo_ref(ref):
    m = REPO_RE.match((ref or "").strip())
    if not m:
        raise ValueError("Expected a repository like owner/repo or https://github.com/owner/repo")
    return m.group(1), m.group(2)


def _safe(fn, *args, default=None):
    try:
        return fn(*args)
    except github.GitHubError:
        return default


def _find_template(owner, repo, paths, ref):
    for p in sorted(paths):
        if re.search(r"(^|/)pull_request_template\.md$", p, re.I):
            return _safe(github.file_text, owner, repo, p, ref)
    return None


def _find_guidelines(owner, repo, paths, ref):
    for candidate in ("CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"):
        if candidate in paths:
            text = _safe(github.file_text, owner, repo, candidate, ref)
            return rule_lines(text) if text else None
    return None


RULE_WORDS = re.compile(r"\b(must|should|please|do not|don't|never|always|required?|only|avoid|make sure|ensure)\b", re.I)


def rule_lines(text, limit=3000):
    """Keep the lines of a CONTRIBUTING file that state rules, so the model sees rules, not intro prose."""
    picked, size = [], 0
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#") or RULE_WORDS.search(line):
            if size + len(line) > limit:
                break
            picked.append(line)
            size += len(line) + 1
    return "\n".join(picked)


def analyze(owner, repo, number, use_model=True, deep=True):
    """Full analysis of one PR. deep=False skips per-author/competition searches (queue mode)."""
    started = time.time()
    pr = github.pull(owner, repo, number)
    files = github.pull_files(owner, repo, number)
    body = pr.get("body") or ""
    base_paths, truncated = _safe(github.tree_paths, owner, repo, pr["base"]["sha"], default=(set(), False))

    issue_nums = linked_issues(body, owner, repo)
    issues = {n: _safe(github.issue, owner, repo, n) for n in issue_nums}

    findings = [check_description(body), *check_linked_issue(issue_nums, issues),
                check_triviality(files), check_test_claim(body, files)]
    if base_paths and not truncated:
        findings += [check_imports(files, base_paths), check_referenced_paths(body, files, base_paths)]
    findings += [f for f in (check_template(body, _find_template(owner, repo, base_paths, pr["base"]["sha"])),
                             check_checklist(body), check_layout(files, base_paths) if base_paths else None) if f]

    user_data = recent = None
    competing = {}
    if deep:
        user_data = _safe(github.user, pr["user"]["login"])
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        res = _safe(github.search_issues, f"is:pr author:{pr['user']['login']} created:>={since}")
        recent = res.get("total_count") if res else None
        for n in issue_nums:
            res = _safe(github.search_issues, f"repo:{owner}/{repo} is:pr is:open {n} in:body")
            competing[n] = [i["number"] for i in res.get("items", [])] if res else []
    findings += check_author(pr, user_data, recent)
    findings += check_competing(number, issue_nums, competing)

    judgment, model_error = None, None
    if use_model:
        open_issue = next((issues[n] for n in issue_nums if issues.get(n) and "pull_request" not in issues[n]), None)
        if open_issue:
            intent, source = f"Issue #{open_issue['number']}: {open_issue['title']}\n\n{(open_issue.get('body') or '')}", "linked issue"
        else:
            intent, source = f"{pr['title']}\n\n{body}", "PR title and description (no linked issue)"
        guidelines = _find_guidelines(owner, repo, base_paths, pr["base"]["sha"])
        judgment, model_error = llm.judge(intent, source, pr["title"], body, build_diff(files), guidelines)
        if judgment:
            penalty = {"addresses": 0, "partial": 12, "unclear": 5, "unrelated": 30}[judgment["verdict"]]
            penalty = round(penalty * max(0.5, judgment["confidence"]))
            status = {"addresses": PASS, "partial": WARN, "unclear": INFO, "unrelated": FAIL}[judgment["verdict"]]
            title = {"addresses": "Diff implements the stated intent", "partial": "Diff only partly implements the stated intent",
                     "unclear": "Model couldn't tell whether the diff matches the intent",
                     "unrelated": "Diff doesn't implement the stated intent"}[judgment["verdict"]]
            findings.append(finding("model", status, title, judgment["reason"], evidence=judgment["gaps"], penalty=penalty))
            if judgment["guideline_issues"]:
                findings.append(finding("guidelines", WARN, f"Conflicts with CONTRIBUTING.md ({len(judgment['guideline_issues'])})",
                                        "Model's reading of the project's contribution guidelines.",
                                        evidence=judgment["guideline_issues"], penalty=min(15, 5 * len(judgment["guideline_issues"]))))

    total, verdict = score(findings)
    order = {FAIL: 0, WARN: 1, INFO: 2, PASS: 3}
    findings.sort(key=lambda f: order[f["status"]])
    return {
        "pr": {"owner": owner, "repo": repo, "number": number, "title": pr["title"], "url": pr["html_url"],
               "author": pr["user"]["login"], "author_avatar": pr["user"].get("avatar_url"),
               "association": pr.get("author_association"), "state": pr["state"], "merged": bool(pr.get("merged_at")),
               "created_at": pr["created_at"], "additions": pr.get("additions"), "deletions": pr.get("deletions"),
               "changed_files": pr.get("changed_files"), "linked_issues": issue_nums},
        "score": total, "verdict": verdict, "findings": findings,
        "model": {"name": llm.MODEL, "used": judgment is not None, "error": model_error, "judgment": judgment} if use_model else None,
        "comment": contributor_comment(pr, findings, judgment),
        "tree_truncated": truncated,
        "elapsed_s": round(time.time() - started, 1),
    }


def queue(owner, repo, limit=15):
    """Rank a repo's open PRs with the fast deterministic pass (no model, no searches)."""
    def fast(pr):
        try:
            return pr, analyze(owner, repo, pr["number"], use_model=False, deep=False)
        except github.GitHubError as e:
            return pr, e

    rows = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(fast, github.open_pulls(owner, repo, limit)))
    for pr, r in results:
        if isinstance(r, Exception):
            rows.append({"number": pr["number"], "title": pr["title"], "error": str(r)})
            continue
        fails = [f["title"] for f in r["findings"] if f["status"] == FAIL]
        warns = [f["title"] for f in r["findings"] if f["status"] == WARN]
        rows.append({"number": pr["number"], "title": pr["title"], "url": pr["html_url"], "author": pr["user"]["login"],
                     "association": pr.get("author_association"), "score": r["score"], "verdict": r["verdict"],
                     "top_issues": (fails + warns)[:3], "draft": pr.get("draft", False)})
    rows.sort(key=lambda r: r.get("score", -1), reverse=True)
    return rows
