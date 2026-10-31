"""Tests for Sieve Server Gemma API routes."""

import json
import unittest
from unittest.mock import MagicMock, patch

from sieve import gemma, server


class FakeWFile:
    def __init__(self):
        self.data = bytearray()

    def write(self, b):
        self.data.extend(b)


class FakeRFile:
    def __init__(self, data=b""):
        self.data = data
        self.offset = 0

    def read(self, n):
        chunk = self.data[self.offset:self.offset + n]
        self.offset += len(chunk)
        return chunk


class TestServerGemmaEndpoints(unittest.TestCase):
    def test_health_includes_gemma_status(self):
        h = server.health()
        self.assertIn("gemma_configured", h)
        self.assertIn("gemma_model", h)
        self.assertEqual(h["gemma_model"], "gemma-4-26b-a4b-it")
        # Ensure no raw secret is exposed
        self.assertNotIn("key", str(h).lower())

    def test_cors_methods_include_post(self):
        headers = {}
        def mock_send_header(k, v):
            headers[k] = v

        handler = server.Handler.__new__(server.Handler)
        handler.headers = {"Origin": "chrome-extension://dummy-extension-id"}
        handler.send_header = mock_send_header
        handler._cors_headers()

        self.assertIn("POST", headers.get("Access-Control-Allow-Methods", ""))

    @patch("sieve.gemma.analyze_visual_architecture")
    def test_post_gemma_analyze_handler(self, mock_analyze):
        mock_analyze.return_value = {
            "summary": "Mocked visual architecture analysis.",
            "diagnostic": {"model_id": "gemma-4-26b-a4b-it"}
        }

        handler = server.Handler.__new__(server.Handler)
        handler.path = "/api/gemma/analyze"
        handler.headers = {
            "Origin": "http://localhost:8787",
            "Content-Length": "120"
        }
        req_body = json.dumps({
            "image_b64": "dummy_b64",
            "pr_ref": "ThatKJ/sieve#1",
            "evidence": {"repository": "ThatKJ/sieve"}
        }).encode("utf-8")
        handler.headers["Content-Length"] = str(len(req_body))
        handler.rfile = FakeRFile(req_body)
        handler.wfile = FakeWFile()

        response_status = []
        response_headers = {}
        handler.send_response = lambda code: response_status.append(code)
        handler.send_header = lambda k, v: response_headers.update({k: v})
        handler.end_headers = lambda: None

        handler.do_POST()

        self.assertEqual(response_status, [200])
        resp_json = json.loads(handler.wfile.data.decode("utf-8"))
        self.assertTrue(resp_json["ok"])
        self.assertEqual(resp_json["data"]["summary"], "Mocked visual architecture analysis.")

    @patch("sieve.gemma.chat_visual_architecture")
    def test_post_gemma_chat_handler(self, mock_chat):
        mock_chat.return_value = {
            "reply": "Tests in tests/test_core.py should run first.",
            "repo_ref": "ThatKJ/sieve",
            "pr_number": 1,
            "head_sha": "abc1234"
        }

        handler = server.Handler.__new__(server.Handler)
        handler.path = "/api/gemma/chat"
        handler.headers = {
            "Origin": "http://localhost:8787",
            "Content-Length": "120"
        }
        req_body = json.dumps({
            "repo_ref": "ThatKJ/sieve",
            "pr_number": 1,
            "head_sha": "abc1234",
            "message": "Which test should I run first?"
        }).encode("utf-8")
        handler.headers["Content-Length"] = str(len(req_body))
        handler.rfile = FakeRFile(req_body)
        handler.wfile = FakeWFile()

        response_status = []
        response_headers = {}
        handler.send_response = lambda code: response_status.append(code)
        handler.send_header = lambda k, v: response_headers.update({k: v})
        handler.end_headers = lambda: None

        handler.do_POST()

        self.assertEqual(response_status, [200])
        resp_json = json.loads(handler.wfile.data.decode("utf-8"))
        self.assertTrue(resp_json["ok"])
        self.assertEqual(resp_json["data"]["reply"], "Tests in tests/test_core.py should run first.")


if __name__ == "__main__":
    unittest.main()

