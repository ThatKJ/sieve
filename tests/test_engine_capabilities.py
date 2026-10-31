"""Comprehensive tests for PR Blast Radius & Import Topology and Historical Hotspot Radar.

Deterministic, in-memory fixtures only; no live network access.
"""
import unittest
from unittest.mock import patch

from sieve import atlas, core, github


class ImpactGraphImports(unittest.TestCase):
    def test_direct_python_imports(self):
        sources = {
            "pkg/__init__.py": "",
            "pkg/a.py": "from pkg.b import helper\nimport pkg.c\n",
            "pkg/b.py": "def helper(): pass\n",
            "pkg/c.py": "x = 1\n",
        }
        g = atlas.build_graph(sources, list(sources))
        edges = {(e["source"], e["target"]) for e in g["edges"]}
        self.assertIn(("pkg/a.py", "pkg/b.py"), edges)
        self.assertIn(("pkg/a.py", "pkg/c.py"), edges)

    def test_relative_imports(self):
        sources = {
            "pkg/__init__.py": "",
            "pkg/root_util.py": "def root_fn(): pass\n",
            "pkg/sub/__init__.py": "",
            "pkg/sub/sibling.py": "def sib_fn(): pass\n",
            "pkg/sub/caller.py": (
                "from .sibling import sib_fn\n"
                "from ..root_util import root_fn\n"
            ),
        }
        g = atlas.build_graph(sources, list(sources))
        edges = {(e["source"], e["target"]) for e in g["edges"]}
        self.assertIn(("pkg/sub/caller.py", "pkg/sub/sibling.py"), edges)
        self.assertIn(("pkg/sub/caller.py", "pkg/root_util.py"), edges)

    def test_package_init_imports(self):
        sources = {
            "pkg/__init__.py": "version = '1.0'\n",
            "pkg/service.py": "import pkg\n",
        }
        g = atlas.build_graph(sources, list(sources))
        edge = next((e for e in g["edges"] if e["source"] == "pkg/service.py"), None)
        self.assertIsNotNone(edge)
        self.assertEqual(edge["target"], "pkg/__init__.py")

    def test_multiple_importers(self):
        sources = {
            "core/util.py": "def common(): pass\n",
            "app/service_a.py": "from core.util import common\n",
            "app/service_b.py": "from core.util import common\n",
        }
        g = atlas.build_graph(sources, list(sources))
        imp = atlas.impact(g, [{"filename": "core/util.py", "status": "modified"}])

        self.assertEqual(imp["summary"]["changed_files"], 1)
        self.assertEqual(imp["summary"]["direct_dependents"], 2)

        direct_ids = {n["id"] for n in imp["nodes"] if n["role"] == "direct"}
        self.assertEqual(direct_ids, {"app/service_a.py", "app/service_b.py"})

    def test_missing_or_external_modules(self):
        sources = {
            "app/main.py": (
                "import os\n"
                "import requests\n"
                "import non_existent_repo_module\n"
                "from .missing import not_here\n"
            )
        }
        g = atlas.build_graph(sources, list(sources))
        # External and unresolvable modules create no edges
        self.assertEqual(len(g["edges"]), 0)

    def test_test_file_identification_by_import_and_naming(self):
        sources = {
            "app/calc.py": "def add(a, b): return a + b\n",
            "tests/test_calc.py": "# no explicit import, naming matches\n",
            "tests/test_other.py": "import app.calc\n",
        }
        g = atlas.build_graph(sources, list(sources))
        imp = atlas.impact(g, [{"filename": "app/calc.py", "status": "modified"}])

        test_files = [t["file"] for t in imp["tests"]]
        self.assertIn("tests/test_other.py", test_files)
        self.assertIn("tests/test_calc.py", test_files)
        self.assertEqual(imp["summary"]["related_test_files"], 2)

    def test_cyclic_imports_terminate_safely(self):
        sources = {
            "pkg/node_a.py": "import pkg.node_b\n",
            "pkg/node_b.py": "import pkg.node_a\n",
        }
        # Building graph must not recurse infinitely
        g = atlas.build_graph(sources, list(sources))
        self.assertEqual(len(g["edges"]), 2)

        # Impact traversal must not loop infinitely
        imp = atlas.impact(g, [{"filename": "pkg/node_a.py", "status": "modified"}])
        self.assertEqual(imp["marks"]["pkg/node_a.py"]["role"], "modified")
        self.assertEqual(imp["marks"]["pkg/node_b.py"]["role"], "direct")

    def test_excluded_directories(self):
        self.assertTrue(atlas._skipped(".git/hooks/pre-commit"))
        self.assertTrue(atlas._skipped(".venv/lib/python3.14/site.py"))
        self.assertTrue(atlas._skipped("node_modules/pkg/index.js"))
        self.assertTrue(atlas._skipped("__pycache__/main.cpython-314.pyc"))
        self.assertFalse(atlas._skipped("src/app/main.py"))

    def test_repository_size_limits(self):
        sources = {f"file_{i}.py": "" for i in range(50)}
        with patch.object(atlas, "MAX_NODES", 10):
            g = atlas.build_graph(sources, list(sources))
            self.assertTrue(g["truncated"])
            self.assertEqual(len(g["nodes"]), 10)

    def test_empty_diff_impact(self):
        sources = {"app/a.py": ""}
        g = atlas.build_graph(sources, list(sources))
        imp = atlas.impact(g, [])
        self.assertEqual(imp["summary"]["changed_files"], 0)
        self.assertEqual(imp["summary"]["direct_dependents"], 0)
        self.assertEqual(len(imp["nodes"]), 0)
        self.assertEqual(len(imp["edges"]), 0)


class HistoricalHotspotRadar(unittest.TestCase):
    def test_empty_files_hotspot(self):
        radar = core.hotspot_radar("owner", "repo", [])
        self.assertEqual(radar["status"], "empty_diff")
        self.assertEqual(radar["total_commits"], 0)
        self.assertEqual(radar["candidate_reverts"], [])

    @patch("sieve.github.commits")
    def test_github_api_failure_handled_gracefully(self, mock_commits):
        mock_commits.side_effect = github.GitHubError("Rate limit exceeded", status=429)
        radar = core.hotspot_radar("owner", "repo", ["src/core.py"])
        self.assertEqual(radar["status"], "no_history")
        self.assertEqual(radar["total_commits"], 0)
        self.assertEqual(radar["candidate_reverts"], [])

    @patch("sieve.github.commits")
    def test_commit_pagination_and_aggregation(self, mock_commits):
        fake_commits = [
            {
                "sha": f"sha{i:04d}abcdef12345",
                "commit": {
                    "message": f"feat: change number {i}",
                    "author": {"name": f"Developer {i % 2}", "date": "2026-10-01T12:00:00Z"},
                },
                "author": {"login": f"dev_{i % 2}"},
                "html_url": f"https://github.com/owner/repo/commit/sha{i}",
            }
            for i in range(12)
        ]
        mock_commits.return_value = fake_commits

        radar = core.hotspot_radar("owner", "repo", ["pkg/feature.py"], days=90)
        mock_commits.assert_called_once()
        self.assertEqual(radar["status"], "ok")
        self.assertEqual(radar["total_commits"], 12)
        self.assertEqual(radar["distinct_contributors"], 2)
        self.assertEqual(radar["per_file_churn"]["pkg/feature.py"], 12)

    @patch("sieve.github.commits")
    def test_candidate_reverts_and_fixes(self, mock_commits):
        mock_commits.return_value = [
            {
                "sha": "rev1234567890",
                "commit": {
                    "message": "Revert \"fix(ciphers): operate on raw bytes\"\n\nCaused regression in Python 3.10",
                    "author": {"name": "Maintainer", "date": "2026-09-15T10:00:00Z"},
                },
                "author": {"login": "maintainer"},
                "html_url": "https://github.com/owner/repo/commit/rev1234",
            },
            {
                "sha": "fix9876543210",
                "commit": {
                    "message": "fix: patch buffer overflow in parse_header",
                    "author": {"name": "Contributor", "date": "2026-09-10T11:00:00Z"},
                },
                "author": {"login": "contrib"},
                "html_url": "https://github.com/owner/repo/commit/fix9876",
            },
            {
                "sha": "clean11111111",
                "commit": {
                    "message": "docs: update install instructions",
                    "author": {"name": "DocsWriter", "date": "2026-09-01T09:00:00Z"},
                },
                "author": {"login": "docswriter"},
                "html_url": "https://github.com/owner/repo/commit/clean1111",
            },
        ]

        radar = core.hotspot_radar("owner", "repo", ["ciphers/base32.py"])
        self.assertEqual(len(radar["candidate_reverts"]), 1)
        self.assertEqual(radar["candidate_reverts"][0]["sha"], "rev1234")
        self.assertIn("Revert", radar["candidate_reverts"][0]["message"])

        self.assertEqual(len(radar["candidate_fixes"]), 1)
        self.assertEqual(radar["candidate_fixes"][0]["sha"], "fix9876")

    @patch("sieve.github.commits")
    def test_missing_commit_metadata_tolerated(self, mock_commits):
        mock_commits.return_value = [
            {
                # Missing 'author' dict, missing 'commit.author', empty message
                "sha": "abc1234567890",
                "commit": {"message": None, "author": None},
                "author": None,
            },
            {
                # Completely empty commit object
                "sha": "empty00000000",
            },
        ]
        radar = core.hotspot_radar("owner", "repo", ["src/mod.py"])
        self.assertEqual(radar["status"], "ok")
        self.assertEqual(radar["total_commits"], 2)
        # Should not raise any KeyError or TypeError
        self.assertEqual(radar["recent_commits"][0]["author"], "unknown")
        self.assertEqual(radar["recent_commits"][0]["message"], "")


class ApiIntegration(unittest.TestCase):
    @patch("sieve.core.github")
    @patch("sieve.atlas.repo_graph")
    def test_analyze_includes_impact_and_archaeology(self, mock_graph, mock_gh):
        mock_gh.pull.return_value = {
            "owner": "test", "repo": "repo", "number": 1, "title": "Test PR", "html_url": "https://github.com/test/repo/pull/1",
            "user": {"login": "author", "avatar_url": None}, "author_association": "NONE", "state": "open", "merged_at": None,
            "created_at": "2026-10-01T00:00:00Z", "additions": 10, "deletions": 2, "changed_files": 1,
            "base": {"sha": "basesha123", "ref": "main"}
        }
        mock_gh.pull_files.return_value = [{"filename": "pkg/a.py", "status": "modified", "patch": "+x = 1"}]
        mock_gh.tree_paths.return_value = ({"pkg/a.py", "pkg/b.py"}, False)
        mock_gh.issue.return_value = None
        mock_gh.user.return_value = None
        mock_gh.search_issues.return_value = {"total_count": 0, "items": []}
        mock_gh.commits.return_value = []

        mock_graph.return_value = {
            "nodes": [{"id": "pkg/a.py", "lang": "python", "test": False, "symbols": []}],
            "edges": [],
            "truncated": False,
            "unparsed": []
        }

        res = core.analyze("test", "repo", 1, use_model=False, deep=True)

        self.assertIn("impact", res)
        self.assertIn("nodes", res["impact"])
        self.assertIn("edges", res["impact"])
        self.assertIn("summary", res["impact"])
        self.assertEqual(res["impact"]["summary"]["changed_files"], 1)

        self.assertIn("archaeology", res)
        self.assertIn("candidate_reverts", res["archaeology"])
        self.assertIn("candidate_fixes", res["archaeology"])
        self.assertIn("total_commits", res["archaeology"])


class ServerSecurity(unittest.TestCase):
    def test_origin_validation_policy(self):
        from sieve.server import _is_allowed_origin
        # Null/missing origin is allowed (local curl/CLI)
        self.assertTrue(_is_allowed_origin(None))
        self.assertTrue(_is_allowed_origin(""))

        # Only the pinned Sieve extension is trusted; any other extension ID is refused
        from sieve.server import SIEVE_EXTENSION_ID
        self.assertTrue(_is_allowed_origin(f"chrome-extension://{SIEVE_EXTENSION_ID}"))
        self.assertFalse(_is_allowed_origin("chrome-extension://hlddfekemfnlffmgohhoggokgcahmecb"))
        self.assertFalse(_is_allowed_origin("chrome-extension://abcdefghijklmnop"))

        # Only the engine's own origin; other local ports need SIEVE_DEV_ORIGINS
        self.assertTrue(_is_allowed_origin("http://127.0.0.1:8787"))
        self.assertTrue(_is_allowed_origin("http://localhost:8787"))
        self.assertFalse(_is_allowed_origin("http://127.0.0.1:3000"))

        # Malicious external origins are rejected
        self.assertFalse(_is_allowed_origin("http://evil.com"))
        self.assertFalse(_is_allowed_origin("https://attacker.org"))
        self.assertFalse(_is_allowed_origin("http://evil.127.0.0.1.nip.io"))
        self.assertFalse(_is_allowed_origin("https://github.com.attacker.com"))


if __name__ == "__main__":
    unittest.main()

