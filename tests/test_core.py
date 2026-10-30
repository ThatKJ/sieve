"""Checks for the deterministic PR checks. Synthetic data only, no network."""
import unittest

from sieve import core, llm


def pr_file(name, patch="", status="modified", additions=1, deletions=0):
    return {"filename": name, "patch": patch, "status": status, "additions": additions, "deletions": deletions}


class LinkedIssues(unittest.TestCase):
    def test_closing_keywords_and_same_repo_urls(self):
        body = "Fixes #12. Also resolves https://github.com/acme/app/issues/30 and see #99"
        self.assertEqual(core.linked_issues(body, "acme", "app"), [12, 30])

    def test_other_repo_urls_are_ignored(self):
        self.assertEqual(core.linked_issues("Closes https://github.com/other/app/issues/3", "acme", "app"), [])

    def test_missing_issue_is_a_failure(self):
        [f] = core.check_linked_issue([7], {7: None})
        self.assertEqual(f["status"], core.FAIL)


class TestClaims(unittest.TestCase):
    def test_claimed_tests_without_test_files_fail(self):
        f = core.check_test_claim("Added comprehensive unit tests", [pr_file("src/budget.py")])
        self.assertEqual(f["status"], core.FAIL)

    def test_test_files_pass(self):
        f = core.check_test_claim("Adds tests", [pr_file("src/budget.py"), pr_file("tests/test_budget.py")])
        self.assertEqual(f["status"], core.PASS)

    def test_code_without_tests_warns(self):
        self.assertEqual(core.check_test_claim("Refactor", [pr_file("src/a.py")])["status"], core.WARN)


class Imports(unittest.TestCase):
    base = {"pkg/__init__.py", "pkg/money.py", "pkg/io/__init__.py", "pkg/io/csv.py", "web/util.js"}

    def test_unresolved_local_python_import_fails(self):
        f = core.check_imports([pr_file("pkg/money.py", "+from pkg.validators import check\n+import json")], self.base)
        self.assertEqual(f["status"], core.FAIL)
        self.assertIn("pkg.validators", f["evidence"][0])

    def test_existing_and_third_party_imports_pass(self):
        patch = "+from pkg.io.csv import read\n+from .io import csv\n+import requests"
        self.assertEqual(core.check_imports([pr_file("pkg/money.py", patch)], self.base)["status"], core.PASS)

    def test_import_of_file_added_in_same_pr_resolves(self):
        files = [pr_file("pkg/money.py", "+from pkg.rates import table"), pr_file("pkg/rates.py", status="added")]
        self.assertEqual(core.check_imports(files, self.base)["status"], core.PASS)

    def test_js_relative_imports(self):
        ok = core.check_imports([pr_file("web/app.js", "+import { x } from './util'")], self.base)
        bad = core.check_imports([pr_file("web/app.js", "+import { x } from './missing'")], self.base)
        self.assertEqual((ok["status"], bad["status"]), (core.PASS, core.FAIL))


class References(unittest.TestCase):
    def test_paths_named_in_description_must_exist(self):
        f = core.check_referenced_paths("Updated `pkg/money.py` and `pkg/validators.py`", [], {"pkg/money.py"})
        self.assertEqual(f["evidence"], ["pkg/validators.py"])

    def test_urls_are_not_treated_as_paths(self):
        f = core.check_referenced_paths("See https://example.com/docs/setup.md", [], {"a.py"})
        self.assertEqual(f["status"], core.PASS)


class Substance(unittest.TestCase):
    def test_whitespace_only_change(self):
        f = core.check_triviality([pr_file("a.py", "-x = 1\n+x  =  1  ")])
        self.assertEqual(f["status"], core.FAIL)

    def test_tiny_docs_edit_warns(self):
        f = core.check_triviality([pr_file("README.md", "-a tool\n+a simple tool", additions=1, deletions=1)])
        self.assertEqual(f["status"], core.WARN)


class Scoring(unittest.TestCase):
    def test_thresholds(self):
        self.assertEqual(core.score([])[1], "ready")
        self.assertEqual(core.score([{"penalty": 40}])[1], "needs-work")
        self.assertEqual(core.score([{"penalty": 80}]), (20, "low-effort"))

    def test_findings_carry_their_evidence_source(self):
        self.assertEqual(core.finding("imports", core.PASS, "x")["source"], "repository")
        self.assertEqual(core.finding("model", core.PASS, "x")["source"], "model")
        self.assertEqual(core.finding("tests", core.PASS, "x")["source"], "github")

    def test_ledger_always_admits_tests_were_not_run(self):
        ledger = core.confidence_ledger([], None, False)
        self.assertTrue(any("not executed" in u for u in ledger["unknown"]))


class ModelOutputValidation(unittest.TestCase):
    def test_malformed_output_is_discarded(self):
        self.assertIsNone(llm.validate("not json"))
        self.assertIsNone(llm.validate({"verdict": "maybe", "confidence": 1}))

    def test_values_are_clamped_and_trimmed(self):
        j = llm.validate({"verdict": "partial", "confidence": 7, "reason": "r", "gaps": ["a", "", "b", "c", "d"], "guideline_issues": "x"})
        self.assertEqual((j["confidence"], j["gaps"], j["guideline_issues"]), (1.0, ["a", "b", "c"], []))


if __name__ == "__main__":
    unittest.main()
