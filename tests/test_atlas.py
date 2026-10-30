"""Checks for the import graph and PR impact analysis. In-memory sources, no network."""
import unittest

from sieve import atlas

SOURCES = {
    "app/__init__.py": "from app.money import Money\n",
    "app/money.py": "from app.currency import symbol\n\ndef format_amount(m):\n    return symbol()\n\nclass Money:\n    pass\n",
    "app/currency.py": "def symbol():\n    return '$'\n",
    "app/report.py": "from app.money import format_amount\nimport json\n",
    "app/cli.py": "from app.report import *\n",
    "tests/test_money.py": "from app.money import Money\n",
    "web/main.ts": "import { util } from './util'\nimport React from 'react'\n",
    "web/util.ts": "export function util() {}\n",
    "broken.py": "def (:\n",
}


def graph():
    return atlas.build_graph(SOURCES, list(SOURCES) + ["README.md"])


def edge(g, source, target):
    return next((e for e in g["edges"] if e["source"] == source and e["target"] == target), None)


class Graph(unittest.TestCase):
    def test_python_edges_carry_line_and_names(self):
        e = edge(graph(), "app/report.py", "app/money.py")
        self.assertEqual((e["line"], e["names"]), (1, ["format_amount"]))

    def test_third_party_imports_create_no_edges(self):
        self.assertFalse(any(e["target"] in ("json", "react") for e in graph()["edges"]))

    def test_js_relative_import_resolves_with_extension(self):
        self.assertIsNotNone(edge(graph(), "web/main.ts", "web/util.ts"))

    def test_symbols_and_unparseable_files(self):
        g = graph()
        money = next(n for n in g["nodes"] if n["id"] == "app/money.py")
        self.assertEqual(money["symbols"], ["format_amount", "Money"])
        self.assertIn("broken.py", g["unparsed"])

    def test_src_layout(self):
        g = atlas.build_graph({"src/pkg/__init__.py": "", "src/pkg/a.py": "", "tests/t.py": "import pkg.a\n"}, [])
        self.assertIsNotNone(edge(g, "tests/t.py", "src/pkg/a.py"))


class Impact(unittest.TestCase):
    def test_roles_propagate_through_reverse_imports(self):
        imp = atlas.impact(graph(), [{"filename": "app/currency.py", "status": "modified", "patch": "+x"}])
        roles = {p: m["role"] for p, m in imp["marks"].items()}
        self.assertEqual(roles["app/currency.py"], "modified")
        self.assertEqual(roles["app/money.py"], "direct")
        self.assertEqual(roles["app/report.py"], "indirect")
        self.assertIn("line 1", imp["marks"]["app/money.py"]["reason"])

    def test_removed_symbol_still_imported_is_high_risk(self):
        patch = "-def format_amount(m):\n+def render_amount(m):"
        imp = atlas.impact(graph(), [{"filename": "app/money.py", "status": "modified", "patch": patch}])
        risk = next(r for r in imp["risks"] if r["kind"] == "removed-symbol-in-use")
        self.assertEqual(risk["level"], "high")
        self.assertTrue(risk["evidence"][0].startswith("app/report.py:1"))
        self.assertEqual(imp["plan"][0]["action"], "fix")

    def test_related_tests_are_found_and_planned(self):
        imp = atlas.impact(graph(), [{"filename": "app/money.py", "status": "modified", "patch": "+x = 1"}])
        self.assertIn("tests/test_money.py", [t["file"] for t in imp["tests"]])
        self.assertTrue(any(s.get("command", "").startswith("pytest tests/test_money.py") for s in imp["plan"]))

    def test_plan_runs_the_prs_own_tests_first(self):
        files = [{"filename": "app/money.py", "status": "modified", "patch": "+x"},
                 {"filename": "tests/test_new.py", "status": "added", "patch": "+def test_x(): pass"}]
        run = next(s for s in atlas.impact(graph(), files)["plan"] if s["action"] == "run")
        self.assertTrue(run["command"].startswith("pytest tests/test_new.py tests/test_money.py"))

    def test_deleted_file_still_imported(self):
        imp = atlas.impact(graph(), [{"filename": "app/report.py", "status": "removed", "patch": ""}])
        self.assertEqual(imp["risks"][0]["kind"], "deleted-but-imported")


if __name__ == "__main__":
    unittest.main()
