"""Maintainer-only activation, engine side: GET /api/permission and the role mapping behind it.

All GitHub responses are mocked; no network, no real repository permissions touched.
"""
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from sieve import actions, github
from test_pr_actions import EXT, GOOD_HOST, handler


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def repo_json(**perms):
    return FakeResponse(json.dumps({"full_name": "o/r", "permissions": perms} if perms else {"full_name": "o/r"}).encode())


def http_error(code):
    return urllib.error.HTTPError("https://api.github.com/repos/o/r", code, "x", {}, io.BytesIO(b""))


class RepoPermission(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for p in (patch.object(github, "OFFLINE", False), patch.object(github, "_get_token", return_value="tok-A"),
                  patch.object(github, "token_info", return_value={"login": "maint"}),
                  patch.object(github, "PERMISSION_DIR", Path(tmp.name))):
            p.start()
            self.addCleanup(p.stop)

    def role(self, **perms):
        with patch("urllib.request.urlopen", return_value=repo_json(**perms)):
            return github.repo_permission("o", "r")["permission"]

    def test_strongest_flag_wins(self):
        self.assertEqual(self.role(admin=True, maintain=True, push=True, triage=True, pull=True), "admin")
        self.assertEqual(self.role(admin=False, maintain=True, push=True, triage=True, pull=True), "maintain")
        self.assertEqual(self.role(admin=False, maintain=False, push=True, triage=True, pull=True), "write")
        self.assertEqual(self.role(admin=False, maintain=False, push=False, triage=True, pull=True), "triage")
        self.assertEqual(self.role(admin=False, push=False, pull=True), "read")

    def test_missing_permissions_object_is_none(self):
        # GitHub omits `permissions` when it is not answering for an authenticated user
        self.assertEqual(self.role(), "none")

    def test_private_repo_404_is_no_access_not_error(self):
        with patch("urllib.request.urlopen", side_effect=http_error(404)):
            self.assertEqual(github.repo_permission("o", "r"), {"login": "maint", "permission": "none"})

    def test_failures_raise_instead_of_guessing(self):
        for code, status in ((401, 401), (403, 429), (500, 502)):
            with patch("urllib.request.urlopen", side_effect=http_error(code)), self.assertRaises(github.GitHubError) as cm:
                github.repo_permission("o", "r")
            self.assertEqual(cm.exception.status, status)
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("offline")), self.assertRaises(github.GitHubError):
            github.repo_permission("o", "r")

    def test_unknown_account_raises(self):
        with patch.object(github, "token_info", return_value={"login": None}), \
             patch("urllib.request.urlopen", return_value=repo_json(admin=True)), self.assertRaises(github.GitHubError):
            github.repo_permission("o", "r")

    def test_always_asks_github_never_the_shared_read_cache(self):
        with patch.object(github, "get") as shared_get, patch("urllib.request.urlopen", return_value=repo_json(push=True)) as live:
            github.repo_permission("o", "r")
        shared_get.assert_not_called()
        live.assert_called_once()
        self.assertEqual(live.call_args[0][0].get_header("Authorization"), "Bearer tok-A")

    def test_offline_snapshot_is_per_token_and_per_repo(self):
        self.role(admin=True)  # verified online by token A for o/r
        with patch.object(github, "OFFLINE", True):
            self.assertEqual(github.repo_permission("o", "r")["permission"], "admin")
            with self.assertRaises(github.GitHubError):
                github.repo_permission("o", "other")  # another repository: never reused
            with patch.object(github, "_get_token", return_value="tok-B"), self.assertRaises(github.GitHubError):
                github.repo_permission("o", "r")  # another account: never reused


class RepoAccess(unittest.TestCase):
    def access(self, role):
        with patch.object(github, "_get_token", return_value="x"), \
             patch.object(github, "repo_permission", return_value={"login": "maint", "permission": role}):
            return actions.repo_access("o", "r")

    def test_eligible_roles(self):
        for role in ("admin", "maintain", "write"):
            a = self.access(role)
            self.assertEqual((a["status"], a["eligible"], a["permission"], a["login"]), ("granted", True, role, "maint"), role)

    def test_ineligible_roles(self):
        for role in ("triage", "read", "none", "something-new"):
            a = self.access(role)
            self.assertEqual((a["status"], a["eligible"]), ("denied", False), role)

    def test_no_token_is_unauthenticated(self):
        with patch.object(github, "_get_token", return_value=""), patch.object(github, "repo_permission") as rp:
            self.assertEqual(actions.repo_access("o", "r")["status"], "unauthenticated")
        rp.assert_not_called()

    def test_rejected_token_is_unauthenticated(self):
        with patch.object(github, "_get_token", return_value="x"), \
             patch.object(github, "repo_permission", side_effect=github.GitHubError("bad", status=401)):
            self.assertEqual(actions.repo_access("o", "r")["status"], "unauthenticated")

    def test_api_failure_propagates(self):
        with patch.object(github, "_get_token", return_value="x"), \
             patch.object(github, "repo_permission", side_effect=github.GitHubError("down", status=502)), \
             self.assertRaises(github.GitHubError):
            actions.repo_access("o", "r")


class PermissionRoute(unittest.TestCase):
    hdrs = [GOOD_HOST, ("Origin", EXT)]

    @patch("sieve.actions.repo_access", return_value={"repo": "o/r", "status": "granted", "eligible": True, "permission": "write", "login": "m"})
    def test_route(self, ra):
        status, body = handler("GET", "/api/permission?repo=o%2Fr", self.hdrs)
        self.assertEqual((status, body["status"]), (200, "granted"))
        ra.assert_called_once_with("o", "r")

    @patch("sieve.actions.repo_access", side_effect=github.GitHubError("GitHub returned HTTP 502", status=502))
    def test_failure_is_an_http_error_not_a_grant(self, ra):
        status, body = handler("GET", "/api/permission?repo=o%2Fr", self.hdrs)
        self.assertEqual(status, 502)
        self.assertNotIn("status", body)

    def test_bad_repo_and_foreign_origin_refused(self):
        self.assertEqual(handler("GET", "/api/permission?repo=nope", self.hdrs)[0], 400)
        self.assertEqual(handler("GET", "/api/permission?repo=o%2Fr", [GOOD_HOST, ("Origin", "https://evil.example")])[0], 403)


if __name__ == "__main__":
    unittest.main()
