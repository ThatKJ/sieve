"""Tests for Sieve Visual Intelligence — Gemma 4 Multimodal Architecture Engine."""

import base64
import json
import struct
import unittest
from unittest.mock import MagicMock, patch

from sieve import gemma


def make_test_png(width=100, height=80):
    """Generate a valid minimal PNG byte stream with specified dimensions."""
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr_length = struct.pack(">I", 13)
    ihdr_type = b"IHDR"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr_crc = b"\x00\x00\x00\x00"  # Dummy CRC
    # Dummy IDAT
    idat_length = struct.pack(">I", 0)
    idat_type = b"IDAT"
    idat_crc = b"\x00\x00\x00\x00"
    # IEND
    iend_length = struct.pack(">I", 0)
    iend_type = b"IEND"
    iend_crc = b"\xaeB`\x82"

    return signature + ihdr_length + ihdr_type + ihdr_data + ihdr_crc + idat_length + idat_type + idat_crc + iend_length + iend_type + iend_crc


class TestGemmaImageValidation(unittest.TestCase):
    def test_valid_png_parsing(self):
        png_bytes = make_test_png(640, 480)
        b64_str = base64.b64encode(png_bytes).decode("ascii")
        raw, w, h, clean_b64 = gemma.validate_png_image(f"data:image/png;base64,{b64_str}")
        self.assertEqual(w, 640)
        self.assertEqual(h, 480)
        self.assertEqual(raw, png_bytes)
        self.assertEqual(clean_b64, b64_str)

    def test_reject_non_png_signature(self):
        fake_data = b"GIF89a" + b"\x00" * 30
        b64_str = base64.b64encode(fake_data).decode("ascii")
        with self.assertRaises(ValueError) as ctx:
            gemma.validate_png_image(b64_str)
        self.assertIn("signature mismatch", str(ctx.exception).lower())

    def test_reject_corrupt_base64(self):
        with self.assertRaises(ValueError):
            gemma.validate_png_image("not-valid-base64!@#$")

    def test_reject_zero_dimensions(self):
        png_bytes = make_test_png(0, 0)
        with self.assertRaises(ValueError) as ctx:
            gemma.validate_png_image(png_bytes)
        self.assertIn("dimensions", str(ctx.exception).lower())

    def test_reject_oversized_payload(self):
        large_bytes = b"A" * (6 * 1024 * 1024)
        with self.assertRaises(ValueError) as ctx:
            gemma.validate_png_image(large_bytes.decode("latin1", errors="ignore"))
        self.assertIn("exceeds", str(ctx.exception).lower())


class TestStructuredEvidence(unittest.TestCase):
    def test_evidence_structure(self):
        pr = {
            "owner": "ThatKJ",
            "repo": "sieve",
            "number": 42,
            "title": "Refactor AST import graph",
            "body": "Improves performance of dependency extraction.",
            "head_sha": "abc1234",
            "base_sha": "def5678",
        }
        impact = {
            "nodes": [
                {"id": "sieve/atlas.py", "role": "modified"},
                {"id": "sieve/server.py", "role": "dependent"},
                {"id": "tests/test_atlas.py", "role": "test-inferred", "is_test": True},
            ],
            "edges": [
                {"source": "sieve/server.py", "target": "sieve/atlas.py", "kind": "imports"}
            ],
            "summary": {"changed_files": 1, "direct_dependents": 1, "related_test_files": 1}
        }
        evidence = gemma.build_structured_evidence(pr, impact)
        self.assertEqual(evidence["repository"], "ThatKJ/sieve")
        self.assertEqual(evidence["pr_number"], 42)
        self.assertEqual(evidence["head_sha"], "abc1234")
        self.assertEqual(len(evidence["changed_files"]), 1)
        self.assertEqual(evidence["changed_files"][0]["path"], "sieve/atlas.py")
        self.assertIn("sieve/server.py", evidence["direct_dependents"])
        self.assertIn("tests/test_atlas.py", evidence["test_consumers"])


class TestGroundingCrossCheck(unittest.TestCase):
    def test_grounding_verified_vs_hypotheses(self):
        evidence = {
            "changed_files": [{"path": "sieve/atlas.py"}],
            "direct_dependents": ["sieve/server.py"],
            "test_consumers": ["tests/test_atlas.py"],
            "graph_edges": []
        }
        mock_output = {
            "summary": "Impacts sieve/atlas.py and server.",
            "potential_risks": [
                {"title": "Import Breakage", "severity": "high", "evidence": "sieve/server.py", "explanation": "Direct dependent"},
                {"title": "Speculative Leak", "severity": "low", "evidence": "sieve/unknown_module.py", "explanation": "Not in repo"}
            ],
            "missing_test_scenarios": [
                {"test_type": "unit", "target": "tests/test_atlas.py", "scenario": "Verify edge extraction"},
                {"test_type": "integration", "target": "external/system.py", "scenario": "Speculative"}
            ]
        }
        grounded = gemma._ground_references(mock_output, evidence)
        risks = grounded["potential_risks"]
        self.assertTrue(risks[0]["verified"])
        self.assertFalse(risks[1]["verified"])

        tests = grounded["missing_test_scenarios"]
        self.assertTrue(tests[0]["verified"])
        self.assertFalse(tests[1]["verified"])

        grounding_meta = grounded["grounding"]
        self.assertIn("sieve/atlas.py", grounding_meta["verified_evidence_citations"])
        self.assertEqual(grounding_meta["status"], "grounded")


class TestGemmaMultimodalInference(unittest.TestCase):
    @patch("urllib.request.urlopen")
    def test_successful_multimodal_analysis(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "output": [
                {
                    "type": "text",
                    "text": json.dumps({
                        "summary": "Pull request modifies core dependency resolution.",
                        "architectural_implications": ["sieve/server.py is tightly coupled."],
                        "potential_risks": [
                            {"title": "Broken imports", "severity": "medium", "evidence": "sieve/server.py", "explanation": "Dependent on atlas"}
                        ],
                        "missing_test_scenarios": [
                            {"test_type": "unit", "target": "tests/test_atlas.py", "scenario": "Test edge cycle"}
                        ],
                        "blind_spots": ["Dynamic getattr calls"],
                        "recommended_investigations": ["Check CLI invocation"],
                        "limitations": ["Static AST only"]
                    })
                }
            ]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        png_bytes = make_test_png(400, 300)
        evidence = {
            "repository": "ThatKJ/sieve",
            "pr_number": 1,
            "head_sha": "abc999",
            "changed_files": [{"path": "sieve/atlas.py"}],
            "direct_dependents": ["sieve/server.py"],
            "test_consumers": ["tests/test_atlas.py"],
            "graph_edges": []
        }

        res = gemma.analyze_visual_architecture(png_bytes, evidence, api_key="test_key_abc123")
        self.assertEqual(res["summary"], "Pull request modifies core dependency resolution.")
        diag = res["diagnostic"]
        self.assertEqual(diag["model_id"], "gemma-4-26b-a4b-it")
        self.assertTrue(diag["multimodal_image_attached"])
        self.assertEqual(diag["image_dimensions"], "400x300")
        self.assertEqual(diag["repo_ref"], "ThatKJ/sieve#1")

    def test_missing_api_key_raises_error(self):
        png_bytes = make_test_png(100, 100)
        evidence = {"repository": "test/test"}
        with patch.object(gemma, "get_api_key", return_value=None):
            with self.assertRaises(ValueError) as ctx:
                gemma.analyze_visual_architecture(png_bytes, evidence)
            self.assertIn("API key not configured", str(ctx.exception))


class TestGemmaBoundChat(unittest.TestCase):
    @patch("urllib.request.urlopen")
    def test_bound_chat_session(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "output": [{"type": "text", "text": "Run tests/test_atlas.py first."}]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        session_key = "ThatKJ/sieve#1@head123"
        gemma._CHAT_SESSIONS[session_key] = {
            "repo_ref": "ThatKJ/sieve#1",
            "head_sha": "head123",
            "evidence": {
                "changed_files": [{"path": "sieve/atlas.py"}],
                "direct_dependents": ["sieve/server.py"],
                "test_consumers": ["tests/test_atlas.py"]
            },
            "analysis": {"summary": "Modifies atlas"},
            "history": []
        }

        chat_res = gemma.chat_visual_architecture(
            repo_ref="ThatKJ/sieve#1",
            head_sha="head123",
            user_message="Which test should I run first?",
            api_key="test_key"
        )
        self.assertEqual(chat_res["reply"], "Run tests/test_atlas.py first.")
        self.assertEqual(chat_res["turns_count"], 1)

    def test_uninitialized_or_stale_pr_chat_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            gemma.chat_visual_architecture(
                repo_ref="ThatKJ/sieve#999",
                head_sha="different_sha",
                user_message="Hello",
                api_key="test_key"
            )
        self.assertIn("No active Visual Intelligence session", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
