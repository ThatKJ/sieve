"""Sieve Visual Intelligence — Gemma 4 Multimodal Architecture Engine.

Zero external dependencies: pure Python standard library (urllib, json, base64, struct, re).
Connects to Google's Interactions API / Generative Language API using the official
gemma-4-26b-a4b-it multimodal model.

Analyzes BOTH the rasterized repository impact graph (PNG) and structured AST evidence
in a single inference request, cross-referencing model output against deterministic
repository facts to maintain verifiable maintainer trust.
"""

import base64
import json
import os
import re
import struct
import time
import urllib.error
import urllib.request
from pathlib import Path

MODEL_ID = "gemma-4-26b-a4b-it"
INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
GENERATE_CONTENT_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_ID}:generateContent"

MAX_IMAGE_B64_BYTES = 5 * 1024 * 1024  # 5 MB max payload
MAX_IMAGE_RAW_BYTES = 4 * 1024 * 1024  # 4 MB max unencoded PNG
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# In-memory session store for PR-specific conversational Q&A
# Keyed strictly by (repo_ref, head_sha) to prevent cross-PR context leaks.
_CHAT_SESSIONS = {}
MAX_SESSION_HISTORY_TURNS = 6


def _load_dotenv():
    """Load variables from local .env if present without external dependencies."""
    candidates = [
        Path(".env"),
        Path(__file__).resolve().parent.parent / ".env",
    ]
    for p in candidates:
        if p.is_file():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
                break
            except Exception:
                pass


_load_dotenv()


def get_api_key():
    """Return the configured Gemma or Gemini API key from environment, or None."""
    _load_dotenv()
    return os.environ.get("GEMMA_API_KEY") or os.environ.get("GEMINI_API_KEY") or None


def is_configured():
    """Return True if a valid API key is present in environment."""
    key = get_api_key()
    return bool(key and len(key.strip()) > 5)


def validate_png_image(image_input):
    """Strict validation for PNG image inputs.

    Returns:
        (raw_bytes, width, height, clean_base64)
    Raises:
        ValueError if image is invalid, corrupt, non-PNG, or exceeds size limits.
    """
    if not image_input or not isinstance(image_input, (str, bytes)):
        raise ValueError("Image input must be non-empty base64 string or bytes.")

    if isinstance(image_input, bytes):
        raw_bytes = image_input
        clean_b64 = base64.b64encode(raw_bytes).decode("ascii")
    else:
        # Strip data URL prefix if provided
        data_str = image_input.strip()
        if data_str.startswith("data:"):
            if "base64," in data_str:
                data_str = data_str.split("base64,", 1)[1]
            else:
                raise ValueError("Data URL must specify base64 encoding.")

        if len(data_str) > MAX_IMAGE_B64_BYTES:
            raise ValueError(f"Image payload exceeds maximum limit of {MAX_IMAGE_B64_BYTES // (1024*1024)}MB.")

        try:
            raw_bytes = base64.b64decode(data_str, validate=True)
        except Exception as e:
            raise ValueError(f"Invalid base64 image data: {e}")
        clean_b64 = data_str

    if len(raw_bytes) < 32:
        raise ValueError("Image payload too small to be a valid PNG.")
    if len(raw_bytes) > MAX_IMAGE_RAW_BYTES:
        raise ValueError(f"Decoded image size ({len(raw_bytes)} bytes) exceeds limit.")

    # Check PNG signature (magic bytes)
    if not raw_bytes.startswith(PNG_SIGNATURE):
        raise ValueError("Image signature mismatch: file is not a valid PNG.")

    # Verify IHDR chunk header
    if raw_bytes[12:16] != b"IHDR":
        raise ValueError("PNG missing IHDR header chunk.")

    # Extract width and height from IHDR
    try:
        width, height = struct.unpack(">II", raw_bytes[16:24])
    except Exception as e:
        raise ValueError(f"Failed to parse PNG dimensions: {e}")

    if width == 0 or height == 0:
        raise ValueError(f"Invalid image dimensions: {width}x{height}.")
    if width > 8192 or height > 8192:
        raise ValueError(f"Image dimensions ({width}x{height}) exceed maximum allowed bound of 8192x8192.")

    return raw_bytes, width, height, clean_b64


def build_structured_evidence(pr, impact, findings=None, diff_snippet=None):
    """Serialize compact, deterministic AST repository evidence for multimodal inference."""
    nodes = (impact or {}).get("nodes", [])
    edges = (impact or {}).get("edges", [])
    summary = (impact or {}).get("summary", {})

    changed_files = [
        {"path": n.get("id") or n.get("path"), "role": n.get("role", "modified")}
        for n in nodes
        if n.get("role") in ("added", "modified", "removed", "renamed")
    ]
    if not changed_files and pr.get("changed_files"):
        changed_files = [{"path": str(pr.get("changed_files")), "role": "modified"}]

    direct_dependents = [
        n.get("id") for n in nodes
        if n.get("role") == "dependent" and not n.get("is_test")
    ]

    test_consumers = [
        n.get("id") for n in nodes
        if n.get("is_test") or n.get("role") == "test-inferred"
    ]

    clean_edges = [
        {"source": e.get("source"), "target": e.get("target"), "kind": e.get("kind", "imports")}
        for e in edges[:40]
    ]

    collisions = []
    if findings:
        for f in findings:
            if f.get("check") in ("competing", "collision", "duplicate"):
                collisions.append({
                    "title": f.get("title"),
                    "evidence": f.get("evidence", [])[:3]
                })

    return {
        "repository": f"{pr.get('owner')}/{pr.get('repo')}",
        "pr_number": pr.get("number"),
        "title": pr.get("title", ""),
        "description": (pr.get("body") or "(empty)")[:1200],
        "author": pr.get("author", "unknown"),
        "base_sha": pr.get("base_sha", "unknown"),
        "head_sha": pr.get("head_sha", "unknown"),
        "changed_files": changed_files[:20],
        "direct_dependents": direct_dependents[:20],
        "test_consumers": test_consumers[:20],
        "graph_nodes_count": len(nodes),
        "graph_edges_count": len(edges),
        "graph_edges": clean_edges,
        "impact_summary": {
            "changed_files": summary.get("changed_files", len(changed_files)),
            "direct_dependents": summary.get("direct_dependents", len(direct_dependents)),
            "related_tests": summary.get("related_test_files", len(test_consumers)),
        },
        "collisions": collisions,
        "diff_snippet": (diff_snippet or "")[:4000],
    }


PROMPT_SYSTEM = """You are Sieve Visual Intelligence, an expert software architect helping an open-source maintainer review a pull request.
You are given:
1. A visual image of the repository's deterministic import/dependency impact graph (Topology DAG).
2. A structured JSON summary of the verified AST repository evidence, changed files, and PR metadata.

Your responsibility:
- Analyze how the visually rendered dependency topology connects with the changed files.
- Explain architectural implications, blast radius, and potential module couplings.
- Identify potential risks (e.g. regression risks, contract breakage, unhandled dependencies).
- Suggest concrete missing test scenarios.
- Do NOT invent repository facts. Ground your citations in the provided changed files and graph nodes.

Answer strictly in valid JSON matching this schema:
{
  "summary": "1-2 sentence high-level executive architectural impact assessment.",
  "architectural_implications": [
    "Concrete implication citing specific modules or packages in the topology"
  ],
  "potential_risks": [
    {
      "title": "Short risk title",
      "severity": "high" | "medium" | "low",
      "evidence": "Concrete file, dependent or module cited from the graph",
      "explanation": "Why this change poses a risk to this module or contract"
    }
  ],
  "missing_test_scenarios": [
    {
      "test_type": "unit" | "integration" | "regression",
      "target": "Specific module or interface to test",
      "scenario": "Concrete test condition, edge case, or integration path that should be covered"
    }
  ],
  "blind_spots": [
    "Subtle dynamic behavior, indirect dependencies, or external contract assumptions not fully captured by static AST"
  ],
  "recommended_investigations": [
    "Targeted, actionable question or code inspection for the maintainer"
  ],
  "limitations": [
    "Explicit boundaries of static architecture reasoning"
  ]
}
"""


def make_session_key(repo_ref, pr_number, head_sha):
    """Deterministic, unambiguous tuple key for PR session context.

    Session identity is strictly bound to (repo_ref, pr_number, head_sha).
    Switching repositories, PR numbers, or head SHAs invalidates access to older context.
    """
    clean_repo = str(repo_ref).strip().lower()
    if "#" in clean_repo:
        clean_repo = clean_repo.split("#")[0]
    try:
        clean_pr = int(pr_number)
    except (TypeError, ValueError):
        clean_pr = 0
    clean_sha = str(head_sha).strip()
    return (clean_repo, clean_pr, clean_sha)


def _ground_references(model_output, evidence):
    """Cross-check model citations against verified repository files and nodes.

    Distinguishes:
    1. Direct PR Evidence (changed files, direct dependents, test consumers)
    2. Repository Existence (upstream symbols, other graph nodes)
    3. Model Hypotheses (unverified files or model interpretations)
    """
    direct_pr_symbols = set()
    for cf in evidence.get("changed_files", []):
        p = cf.get("path")
        if p:
            direct_pr_symbols.add(p)
    for dep in evidence.get("direct_dependents", []):
        if dep:
            direct_pr_symbols.add(dep)
    for t in evidence.get("test_consumers", []):
        if t:
            direct_pr_symbols.add(t)

    repo_graph_symbols = set()
    for e in evidence.get("graph_edges", []):
        if e.get("source"):
            repo_graph_symbols.add(e.get("source"))
        if e.get("target"):
            repo_graph_symbols.add(e.get("target"))

    all_known = direct_pr_symbols | repo_graph_symbols
    direct_basenames = {p.split("/")[-1] for p in direct_pr_symbols if p}
    all_basenames = {p.split("/")[-1] for p in all_known if p}

    def classify_citation(cit):
        if not cit:
            return "unverified_hypothesis"
        cit_str = str(cit).strip()
        if cit_str in direct_pr_symbols or cit_str.split("/")[-1] in direct_basenames:
            return "direct_pr_evidence"
        if cit_str in all_known or cit_str.split("/")[-1] in all_basenames:
            return "repo_symbol"
        return "unverified_hypothesis"

    # Annotate risks
    risks = model_output.get("potential_risks", [])
    grounded_risks = []
    for r in risks:
        ev = r.get("evidence", "")
        tier = classify_citation(ev)
        r_copy = dict(r)
        r_copy["evidence_verification"] = tier
        r_copy["verified"] = tier in ("direct_pr_evidence", "repo_symbol")
        r_copy["interpretation_type"] = "model_hypothesis"
        grounded_risks.append(r_copy)
    model_output["potential_risks"] = grounded_risks

    # Annotate missing test scenarios
    tests = model_output.get("missing_test_scenarios", [])
    grounded_tests = []
    for t in tests:
        target = t.get("target", "")
        tier = classify_citation(target)
        t_copy = dict(t)
        t_copy["evidence_verification"] = tier
        t_copy["verified"] = tier in ("direct_pr_evidence", "repo_symbol")
        t_copy["interpretation_type"] = "model_hypothesis"
        grounded_tests.append(t_copy)
    model_output["missing_test_scenarios"] = grounded_tests

    # Identify confirmed citations vs speculative hypotheses
    cited_symbols = set()
    for p in all_known:
        if p and (p in json.dumps(model_output)):
            cited_symbols.add(p)

    model_output["grounding"] = {
        "verified_evidence_citations": sorted(list(direct_pr_symbols & cited_symbols)),
        "repo_symbols_cited": sorted(list((all_known - direct_pr_symbols) & cited_symbols)),
        "unverified_hypotheses_count": sum(1 for r in grounded_risks if not r["verified"]) + sum(1 for t in grounded_tests if not t["verified"]),
        "status": "grounded" if direct_pr_symbols & cited_symbols else "unverified_hypotheses",
        "note": "Citation verification confirms symbol existence in repository AST; risk interpretations remain model hypotheses."
    }

    return model_output


def _extract_text_from_candidate(candidate):
    """Safely extract generated output text, filtering out internal thinking parts."""
    parts = candidate.get("content", {}).get("parts", [])
    for p in reversed(parts):
        if not p.get("thought") and p.get("text"):
            return p.get("text")
    if parts and parts[-1].get("text"):
        return parts[-1].get("text")
    return ""


def analyze_visual_architecture(image_input, evidence, user_question=None, api_key=None, timeout=60):
    """Execute real multimodal visual architecture analysis using Gemma 4.

    Args:
        image_input: base64 string or bytes of PNG topology graph.
        evidence: dict of structured deterministic repository evidence.
        user_question: optional contextual follow-up question.
        api_key: optional override for API key.
        timeout: HTTP request timeout in seconds.

    Returns:
        Structured analysis dict including diagnostic metadata.
    """
    raw_bytes, width, height, clean_b64 = validate_png_image(image_input)

    key = api_key or get_api_key()
    if not key:
        raise ValueError("Gemma API key not configured. Set GEMMA_API_KEY in .env or environment.")

    repo_ref = evidence.get("repository", "unknown")
    pr_number = evidence.get("pr_number", 0)
    head_sha = evidence.get("head_sha", "unknown")

    prompt_content = (
        f"{PROMPT_SYSTEM}\n\n"
        f"STRUCTURED REPOSITORY EVIDENCE (Deterministic AST Facts):\n"
        f"{json.dumps(evidence, indent=2)}\n\n"
    )
    if user_question:
        prompt_content += f"MAINTAINER SPECIFIC QUESTION:\n{user_question}\n\n"

    # Multimodal payload for Google Generative Language API
    generate_content_payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": clean_b64
                        }
                    },
                    {
                        "text": prompt_content
                    }
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.2
        }
    }

    raw_response_text = None
    endpoint_used = GENERATE_CONTENT_URL

    for attempt in range(2):
        try:
            req_gen = urllib.request.Request(
                f"{GENERATE_CONTENT_URL}?key={key}",
                data=json.dumps(generate_content_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req_gen, timeout=timeout) as resp_gen:
                gen_data = json.loads(resp_gen.read().decode("utf-8"))
                candidates = gen_data.get("candidates", [])
                if candidates:
                    raw_response_text = _extract_text_from_candidate(candidates[0])
                else:
                    raw_response_text = json.dumps(gen_data)
            break
        except urllib.error.HTTPError as http_err:
            err_body = http_err.read().decode("utf-8", errors="replace")[:400]
            if http_err.code in (429, 503) and attempt == 0:
                time.sleep(2.5)
                continue
            raise RuntimeError(f"Gemma 4 API HTTP {http_err.code}: {err_body}")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt == 0:
                time.sleep(2)
                continue
            raise RuntimeError(f"Network error communicating with Gemma 4 API: {getattr(e, 'reason', e)}")

    # Parse JSON from model text
    parsed_json = _parse_model_json(raw_response_text)
    if not parsed_json or not isinstance(parsed_json, dict):
        raise ValueError(f"Model returned invalid or non-JSON response: {str(raw_response_text)[:200]}")

    # Ground references against deterministic facts
    grounded_output = _ground_references(parsed_json, evidence)

    # Attach diagnostic metadata proving actual multimodal submission
    grounded_output["diagnostic"] = {
        "model_id": MODEL_ID,
        "endpoint": endpoint_used,
        "multimodal_image_attached": True,
        "image_format": "image/png",
        "image_dimensions": f"{width}x{height}",
        "image_bytes": len(raw_bytes),
        "structured_evidence_attached": True,
        "repo_ref": f"{repo_ref}#{pr_number}",
        "head_sha": head_sha,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Initialize chat session bound to this exact PR and head SHA
    session_key = make_session_key(repo_ref, pr_number, head_sha)
    _CHAT_SESSIONS[session_key] = {
        "repo_ref": f"{repo_ref}#{pr_number}",
        "pr_number": pr_number,
        "head_sha": head_sha,
        "evidence": evidence,
        "analysis": grounded_output,
        "history": [
            {"role": "system", "text": "Architectural visual analysis completed."},
            {"role": "assistant", "text": grounded_output.get("summary", "")}
        ]
    }

    return grounded_output


def _parse_model_json(raw_text):
    """Safely extract and parse JSON object from markdown-fenced or raw strings."""
    if not raw_text:
        return None
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try finding outermost braces
        m = re.search(r"(\{.*\})", cleaned, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
    return None


def chat_visual_architecture(repo_ref, pr_number, head_sha, user_message, api_key=None, timeout=30):
    """Handle interactive maintainer follow-up questions bound to the current PR context.

    Ensures context invalidation if the repository, PR number, or head SHA changes.
    """
    session_key = make_session_key(repo_ref, pr_number, head_sha)
    session = _CHAT_SESSIONS.get(session_key)

    if not session:
        clean_repo = str(repo_ref).split("#")[0]
        raise ValueError(
            f"No active Visual Intelligence session found for {clean_repo}#{pr_number} at {str(head_sha)[:7]}. "
            "Please run 'Analyze Architecture with Gemma 4' first."
        )

    key = api_key or get_api_key()
    if not key:
        raise ValueError("Gemma API key not configured. Set GEMMA_API_KEY in .env.")

    clean_message = (user_message or "").strip()[:500]
    if not clean_message:
        raise ValueError("User message cannot be empty.")

    # Bound history turns
    history = session.setdefault("history", [])
    if len(history) > MAX_SESSION_HISTORY_TURNS * 2:
        history = history[-(MAX_SESSION_HISTORY_TURNS * 2):]
        session["history"] = history

    evidence = session.get("evidence", {})
    analysis_summary = session.get("analysis", {}).get("summary", "")

    chat_prompt = (
        f"You are Sieve Visual Intelligence reviewing pull request {repo_ref}.\n"
        f"Earlier Architectural Analysis Summary:\n{analysis_summary}\n\n"
        f"Deterministic Repository Facts:\n"
        f"- Changed files: {', '.join(cf.get('path', '') for cf in evidence.get('changed_files', []))}\n"
        f"- Direct dependents: {', '.join(evidence.get('direct_dependents', [])) or 'None'}\n"
        f"- Test consumers: {', '.join(evidence.get('test_consumers', [])) or 'None'}\n\n"
        f"Conversation History:\n"
    )
    for h in history[-4:]:
        chat_prompt += f"{h['role'].upper()}: {h['text']}\n"
    chat_prompt += f"USER: {clean_message}\n\nASSISTANT: Answer concisely in 2-3 sentences, citing verified files."

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": chat_prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2
        }
    }

    try:
        req = urllib.request.Request(
            f"{GENERATE_CONTENT_URL}?key={key}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            answer = _extract_text_from_candidate(candidates[0]) if candidates else ""
    except Exception as e:
        raise RuntimeError(f"Chat request failed: {e}")

    history.append({"role": "user", "text": clean_message})
    history.append({"role": "assistant", "text": answer})

    return {
        "reply": answer,
        "repo_ref": repo_ref,
        "head_sha": head_sha,
        "turns_count": len(history) // 2
    }

