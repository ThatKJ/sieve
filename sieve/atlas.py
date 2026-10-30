"""Repository Atlas: a file-level import graph built from a repo snapshot.

One tarball download per commit, parsed in memory. Python is parsed with `ast`;
JS/TS imports are matched with regexes. Every edge records the file and line of
the import statement that justifies it. Contributor code is never executed.
"""
import ast
import io
import posixpath
import re
import tarfile
from collections import Counter, defaultdict

from . import github

SOURCE_EXT = {".py": "python", ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".ts": "ts", ".tsx": "ts"}
SKIP_DIRS = {"node_modules", ".git", "dist", "build", "vendor", "third_party", ".venv", "venv", "__pycache__", "site-packages", ".next", "coverage"}
MAX_FILE_BYTES = 300_000
MAX_NODES = 1200  # beyond this the graph keeps the most-connected files and says so
LANG_BY_EXT = {".py": "Python", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
               ".ts": "TypeScript", ".tsx": "TypeScript", ".go": "Go", ".rs": "Rust", ".java": "Java", ".rb": "Ruby",
               ".php": "PHP", ".c": "C", ".h": "C", ".cpp": "C++", ".cs": "C#", ".swift": "Swift", ".kt": "Kotlin",
               ".md": "Markdown", ".rst": "reStructuredText", ".html": "HTML", ".css": "CSS", ".sh": "Shell"}
CONFIG_RE = re.compile(r"(^|/)(package\.json|pyproject\.toml|setup\.(py|cfg)|requirements[^/]*\.txt|Pipfile|poetry\.lock|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|tsconfig[^/]*\.json|Dockerfile|docker-compose[^/]*\.ya?ml|\.github/workflows/[^/]+)$")
MIGRATION_RE = re.compile(r"(^|/)(migrations?|alembic)/|\.sql$")
TEST_RE = re.compile(r"(^|/)(tests?|__tests__|spec|specs)/|(^|/)test_[^/]+$|_test\.\w+$|\.(test|spec)\.\w+$", re.I)

JS_IMPORT_RE = re.compile(r"""(?:^|\s)(?:import\s[^'"]*?from\s*|import\s*|export\s[^'"]*?from\s*|require\(\s*|import\(\s*)['"](\.{1,2}/[^'"]+)['"]""")
JS_EXPORT_RE = re.compile(r"^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)", re.M)
JS_EXTS = ("", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx")
SHARED_MODULE_FAN_IN = 5  # a modified file imported by at least this many files is flagged as shared


def is_test(path):
    return bool(TEST_RE.search(path))


def _skipped(path):
    return any(part in SKIP_DIRS for part in path.split("/")[:-1])


# ---------------------------------------------------------------- snapshot

def snapshot(owner, repo, ref):
    """Return ({path: text} for parseable source files, [all paths])."""
    raw = github.tarball(owner, repo, ref)
    sources, paths = {}, []
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        for m in tar:
            if not m.isfile():
                continue
            path = m.name.split("/", 1)[1] if "/" in m.name else m.name
            if not path or _skipped(path):
                continue
            paths.append(path)
            if posixpath.splitext(path)[1] in SOURCE_EXT and m.size <= MAX_FILE_BYTES:
                f = tar.extractfile(m)
                if f:
                    sources[path] = f.read().decode("utf-8", "replace")
    return sources, paths


# ---------------------------------------------------------------- parsing

def python_imports(text):
    """([(module, names, level, lineno)], [top-level symbol], parsed_ok)."""
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        return [], [], False
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports += [(a.name, [], 0, node.lineno) for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            imports.append((node.module or "", [a.name for a in node.names], node.level, node.lineno))
    symbols = [n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
    return imports, symbols, True


def js_imports(text):
    out = [(m.group(1), i) for i, line in enumerate(text.splitlines(), 1) for m in JS_IMPORT_RE.finditer(line)]
    return out, JS_EXPORT_RE.findall(text)


def _py_module_file(module_path, files):
    for cand in (module_path + ".py", module_path + "/__init__.py"):
        if cand in files:
            return cand
    return None


def python_roots(files):
    """Directories absolute imports resolve from: the repo root, plus src/ for src layouts."""
    return {"", "src"} if any(p.startswith("src/") for p in files) else {""}


def resolve_python(src, module, names, level, files, roots):
    """[(target_file, imported_names)] for repo-local targets only; third-party imports resolve to nothing."""
    if level:
        base = posixpath.dirname(src)
        for _ in range(level - 1):
            base = posixpath.dirname(base)
        bases = [base]
    else:
        bases = sorted(roots)
    for base in bases:
        mod_path = posixpath.join(base, module.replace(".", "/")) if module else base
        target = _py_module_file(mod_path, files) if mod_path else None
        found = [(target, names)] if target else []
        # `from pkg import submodule` (or `from . import submodule`) also imports that file
        for n in names:
            sub = _py_module_file(posixpath.join(mod_path, n), files) if (mod_path or n) else None
            if sub:
                found.append((sub, [n]))
        if found:
            return found
    return []


def resolve_js(src, spec, files):
    target = posixpath.normpath(posixpath.join(posixpath.dirname(src), spec))
    return next((target + ext for ext in JS_EXTS if target + ext in files), None)


def build_graph(sources, all_paths):
    files = set(sources)
    roots = python_roots(files)
    nodes, edges, unparsed = {}, [], []
    for path, text in sources.items():
        if SOURCE_EXT[posixpath.splitext(path)[1]] == "python":
            imports, symbols, ok = python_imports(text)
            if not ok:
                unparsed.append(path)
            for module, names, level, line in imports:
                stmt = f"from {'.' * level}{module} import {', '.join(names)}" if (names or level) else f"import {module}"
                for target, used in resolve_python(path, module, names, level, files, roots):
                    if target != path:
                        edges.append({"source": path, "target": target, "line": line, "names": used, "stmt": stmt[:120]})
        else:
            imports, symbols = js_imports(text)
            for spec, line in imports:
                target = resolve_js(path, spec, files)
                if target and target != path:
                    edges.append({"source": path, "target": target, "line": line, "names": [], "stmt": f"import '{spec}'"})
        nodes[path] = {"id": path, "dir": posixpath.dirname(path), "lang": SOURCE_EXT[posixpath.splitext(path)[1]],
                       "test": is_test(path), "lines": text.count("\n") + 1, "symbols": symbols[:40]}

    seen, unique = set(), []  # one edge per (source, target), keeping the first import as evidence
    for e in edges:
        if (e["source"], e["target"]) not in seen:
            seen.add((e["source"], e["target"]))
            unique.append(e)
    edges = unique

    degree = Counter()
    for e in edges:
        degree[e["source"]] += 1
        degree[e["target"]] += 1
    for n in nodes.values():
        n["degree"] = degree[n["id"]]

    truncated = len(nodes) > MAX_NODES
    if truncated:
        keep = set(sorted(nodes, key=lambda p: -degree[p])[:MAX_NODES])
        nodes = {p: n for p, n in nodes.items() if p in keep}
        edges = [e for e in edges if e["source"] in keep and e["target"] in keep]

    return {"nodes": list(nodes.values()), "edges": edges, "truncated": truncated,
            "unparsed": unparsed[:20], "fingerprint": fingerprint(all_paths, nodes, edges)}


def fingerprint(all_paths, nodes, edges):
    """Observable facts about the repository, no interpretation."""
    langs = Counter(LANG_BY_EXT[ext] for p in all_paths if (ext := posixpath.splitext(p)[1]) in LANG_BY_EXT)
    importers = Counter(e["target"] for e in edges)
    lowered = {p.lower() for p in all_paths}
    return {
        "files": len(all_paths),
        "source_files": len(nodes),
        "test_files": sum(1 for n in nodes.values() if n["test"]),
        "import_edges": len(edges),
        "languages": langs.most_common(6),
        "top_dirs": Counter(p.split("/")[0] for p in all_paths if "/" in p).most_common(8),
        "most_imported": [{"file": f, "importers": c} for f, c in importers.most_common(5)],
        "has_contributing": bool(lowered & {"contributing.md", ".github/contributing.md", "docs/contributing.md"}),
        "has_ci": any(p.startswith(".github/workflows/") for p in all_paths),
    }


# ---------------------------------------------------------------- PR impact

DEF_PY = re.compile(r"^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)")
DEF_JS = re.compile(r"^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)")


def _patch_lines(patch, sign):
    return [l[1:] for l in (patch or "").splitlines() if l.startswith(sign) and not l.startswith(sign * 3)]


def removed_symbols(f):
    """Top-level names defined on removed lines and not re-defined on added lines."""
    rx = DEF_PY if f["filename"].endswith(".py") else DEF_JS
    gone = {m.group(1) for l in _patch_lines(f.get("patch"), "-") if (m := rx.match(l))}
    back = {m.group(1) for l in _patch_lines(f.get("patch"), "+") if (m := rx.match(l))}
    return sorted(gone - back)


def impact(graph, pr_files):
    """Classify the repo graph relative to a PR's changed files. Every mark carries its reason."""
    node_ids = {n["id"] for n in graph["nodes"]}
    rev, fwd = defaultdict(list), defaultdict(list)
    for e in graph["edges"]:
        rev[e["target"]].append(e)
        fwd[e["source"]].append(e)

    status = {f["filename"]: f.get("status", "modified") for f in pr_files}
    changed = {p for p in status if p in node_ids or posixpath.splitext(p)[1] in SOURCE_EXT}
    marks = {p: {"role": status[p], "reason": f"{status[p].capitalize()} in this PR", "via": None} for p in changed}

    direct = {}
    for p in sorted(changed):
        for e in rev.get(p, []):
            if e["source"] not in changed:
                direct.setdefault(e["source"], e)
    for p, e in direct.items():
        marks[p] = {"role": "direct", "reason": f"Imports {e['target']} (line {e['line']}: {e['stmt']})", "via": e["target"]}

    indirect = {}
    for p in sorted(direct):
        for e in rev.get(p, []):
            if e["source"] not in changed and e["source"] not in direct:
                indirect.setdefault(e["source"], e)
    for p, e in indirect.items():
        marks[p] = {"role": "indirect", "reason": f"Imports {e['target']}, which depends on the change (line {e['line']})", "via": e["target"]}

    uses = 0
    for p in sorted(changed):
        for e in fwd.get(p, []):
            if e["target"] not in marks:
                marks[e["target"]] = {"role": "dependency", "reason": f"Used by changed file {e['source']} (line {e['line']})", "via": e["source"]}
                uses += 1

    tests = {p: m["reason"] for p, m in marks.items() if is_test(p) and m["role"] in ("direct", "indirect")}
    stems = {posixpath.splitext(posixpath.basename(p))[0] for p in changed if not is_test(p)}
    for n in graph["nodes"]:
        base = posixpath.splitext(posixpath.basename(n["id"]))[0]
        if n["test"] and n["id"] not in tests and n["id"] not in changed and any(base in (f"test_{s}", f"{s}_test", f"{s}.test", f"{s}.spec") for s in stems):
            tests[n["id"]] = "Named after a changed module (inferred from the file name, no import found)"
            marks.setdefault(n["id"], {"role": "test-inferred", "reason": tests[n["id"]], "via": None})

    risks = regression_radar(pr_files, rev, changed)
    return {
        "marks": marks,
        "counts": {"changed": len(changed), "direct": len(direct), "indirect": len(indirect), "dependencies": uses, "tests": len(tests)},
        "tests": [{"file": p, "reason": r} for p, r in sorted(tests.items())],
        "risks": risks,
        "plan": verification_plan(changed, direct, tests, risks, status),
    }


def _risk(level, kind, file, title, evidence=(), source="repository"):
    return {"level": level, "kind": kind, "file": file, "title": title, "evidence": list(evidence)[:5], "source": source}


def regression_radar(pr_files, rev, changed):
    risks = []
    for f in pr_files:
        name, st = f["filename"], f.get("status")
        users = [e for e in rev.get(name, []) if e["source"] not in changed]
        if st == "removed" and users:
            risks.append(_risk("high", "deleted-but-imported", name, f"{name} is deleted but still imported",
                               [f"{e['source']}:{e['line']}  {e['stmt']}" for e in users]))
        for sym in removed_symbols(f):
            using = [e for e in users if sym in e["names"]]
            if using:
                risks.append(_risk("high", "removed-symbol-in-use", name, f"`{sym}` is removed from {name} but still imported elsewhere",
                                   [f"{e['source']}:{e['line']}  {e['stmt']}" for e in using]))
            elif users:
                risks.append(_risk("medium", "removed-symbol", name, f"`{sym}` is removed from a module imported by {len(users)} file(s)",
                                   [f"{e['source']}:{e['line']}  {e['stmt']}" for e in users[:3]]))
        if st == "removed" and is_test(name):
            risks.append(_risk("medium", "deleted-test", name, f"Deletes test file {name}", source="github"))
        if CONFIG_RE.search(name):
            risks.append(_risk("medium", "config", name, f"Changes build, dependency or CI config: {name}", source="github"))
        if MIGRATION_RE.search(name):
            risks.append(_risk("medium", "migration", name, f"Touches a database migration: {name}", source="github"))
        if st == "modified" and len(rev.get(name, [])) >= SHARED_MODULE_FAN_IN:
            risks.append(_risk("medium", "shared-module", name, f"Modifies a shared module imported by {len(rev[name])} files"))
    return sorted(risks, key=lambda r: r["level"] != "high")


def verification_plan(changed, direct, tests, risks, status):
    """Concrete next steps for the reviewer. Recommendations only: Sieve executes none of them."""
    plan = []
    for r in risks:
        if r["kind"] in ("deleted-but-imported", "removed-symbol-in-use"):
            plan.append({"action": "fix", "text": f"Resolve the broken reference: {r['title']}", "target": r["evidence"][0].split(":")[0]})
    # the PR's own tests come first: they are the most direct evidence for the change
    own_tests = sorted(c for c in changed if is_test(c) and status.get(c) != "removed")
    py_tests = [t for t in own_tests if t.endswith(".py")] + sorted(t for t in tests if t.endswith(".py") and t not in own_tests)
    if py_tests:
        plan.append({"action": "run", "text": "Run the tests that exercise the changed code", "command": "pytest " + " ".join(py_tests[:6])})
    elif tests:
        plan.append({"action": "run", "text": "Run the related tests: " + ", ".join(sorted(tests)[:6])})
    pr_has_tests = any(is_test(c) for c in changed)
    for p in sorted(changed):
        if is_test(p) or status.get(p) == "removed" or posixpath.splitext(p)[1] not in SOURCE_EXT:
            continue
        dependents = [d for d, e in direct.items() if e["target"] == p]
        stem = posixpath.splitext(posixpath.basename(p))[0]
        if dependents and not pr_has_tests and not any(stem in t for t in tests):
            plan.append({"action": "add-test", "text": f"Add a regression test for {p}: {len(dependents)} file(s) depend on it and no related test was found", "target": p})
    for d, e in list(direct.items())[:3]:
        if not is_test(d):
            plan.append({"action": "inspect", "text": f"Check that {d} still works with the change (it imports {e['target']} at line {e['line']})", "target": d})
    if not plan:
        plan.append({"action": "inspect", "text": "Nothing in the import graph depends on these files; review the diff directly."})
    return plan[:8]


# ---------------------------------------------------------------- entry points

_graph_cache = {}


def repo_graph(owner, repo, ref):
    key = (owner.lower(), repo.lower(), ref)
    if key not in _graph_cache:
        _graph_cache[key] = build_graph(*snapshot(owner, repo, ref))
    return _graph_cache[key]


def atlas_for_repo(owner, repo):
    branch = github.get(f"/repos/{owner}/{repo}")["default_branch"]
    sha = github.get(f"/repos/{owner}/{repo}/commits/{branch}")["sha"]
    return {"owner": owner, "repo": repo, "ref": sha, "ref_name": branch, "graph": repo_graph(owner, repo, sha), "impact": None, "pr": None}


def atlas_for_pr(owner, repo, number):
    pr = github.pull(owner, repo, number)
    files = github.pull_files(owner, repo, number)
    graph = repo_graph(owner, repo, pr["base"]["sha"])
    ids = {n["id"] for n in graph["nodes"]}
    added = [{"id": f["filename"], "dir": posixpath.dirname(f["filename"]), "lang": SOURCE_EXT[posixpath.splitext(f["filename"])[1]],
              "test": is_test(f["filename"]), "lines": f.get("additions", 0), "symbols": [], "degree": 0, "added": True}
             for f in files if f["filename"] not in ids and posixpath.splitext(f["filename"])[1] in SOURCE_EXT]
    return {"owner": owner, "repo": repo, "ref": pr["base"]["sha"], "ref_name": pr["base"]["ref"],
            "graph": {**graph, "nodes": graph["nodes"] + added}, "impact": impact(graph, files),
            "pr": {"number": number, "title": pr["title"], "url": pr["html_url"], "author": pr["user"]["login"]}}
