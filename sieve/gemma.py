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


def _ground_references(model_output, evidence):
    """Cross-check model citations against verified repository files and nodes.

    Distinguishes verified AST facts from model hypotheses without mutating raw conclusions.
    """
    known_paths = set()
    for cf in evidence.get("changed_files", []):
        known_paths.add(cf.get("path"))
    for dep in evidence.get("direct_dependents", []):
        known_paths.add(dep)
    for t in evidence.get("test_consumers", []):
        known_paths.add(t)
    for e in evidence.get("graph_edges", []):
        known_paths.add(e.get("source"))
        known_paths.add(e.get("target"))

    # Also extract base file names for partial matching
    known_basenames = {p.split("/")[-1] for p in known_paths if p}

    def verify_citation(cit):
        if not cit:
            return False
        cit_str = str(cit).strip()
        if cit_str in known_paths:
            return True
        cit_base = cit_str.split("/")[-1]
        return cit_base in known_basenames

    # Annotate risks
    risks = model_output.get("potential_risks", [])
    grounded_risks = []
    for r in risks:
        ev = r.get("evidence", "")
        is_verified = verify_citation(ev)
        r_copy = dict(r)
        r_copy["verified"] = is_verified
        grounded_risks.append(r_copy)
    model_output["potential_risks"] = grounded_risks

    # Annotate missing test scenarios
    tests = model_output.get("missing_test_scenarios", [])
    grounded_tests = []
    for t in tests:
        target = t.get("target", "")
        is_verified = verify_citation(target)
        t_copy = dict(t)
        t_copy["verified"] = is_verified
        grounded_tests.append(t_copy)
    model_output["missing_test_scenarios"] = grounded_tests

    # Identify confirmed facts vs speculative hypotheses
    verified_citations = set()
    for p in known_paths:
        if p and (p in json.dumps(model_output)):
            verified_citations.add(p)

    model_output["grounding"] = {
        "verified_evidence_citations": sorted(list(verified_citations)),
        "total_known_repository_symbols": len(known_paths),
        "verified_symbols_cited": len(verified_citations),
        "status": "grounded" if verified_citations else "unverified_hypotheses"
    }

    return model_output


def analyze_visual_architecture(image_input, evidence, user_question=None, api_key=None, timeout=45):
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
    key = api_key or get_api_key()
    if not key:
        raise ValueError("Gemma API key not configured. Set GEMMA_API_KEY in .env or environment.")

    raw_bytes, width, height, clean_b64 = validate_png_image(image_input)

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

    # Try Interactions API first (unified multimodal format)
    # Payload format according to Google Interactions API specification:
    interactions_payload = {
        "model": MODEL_ID,
        "input": [
            {
                "type": "image",
                "image_url": f"data:image/png;base64,{clean_b64}"
            },
            {
                "type": "text",
                "text": prompt_content
            }
        ],
        "response_format": {
            "type": "json_object"
        }
    }

    # Backup / Direct generateContent format (Google Generative Language API)
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

    # Execute request
    raw_response_text = None
    endpoint_used = None

    # First attempt: Interactions API
    try:
        endpoint_used = INTERACTIONS_URL
        req = urllib.request.Request(
            INTERACTIONS_URL,
            data=json.dumps(interactions_payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": key,
                "User-Agent": "Sieve-Workspace-Visual-Intelligence/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            # Parse response from Interactions API
            if "output" in resp_data and isinstance(resp_data["output"], list):
                for part in resp_data["output"]:
                    if part.get("type") == "text":
                        raw_response_text = part.get("text")
                        break
            elif "response" in resp_data:
                raw_response_text = resp_data["response"]
            elif "candidates" in resp_data:
                raw_response_text = resp_data["candidates"][0]["content"]["parts"][0]["text"]
            else:
                raw_response_text = json.dumps(resp_data)
    except urllib.error.HTTPError as http_err:
        # Fall back to generateContent endpoint if Interactions endpoint returns 404/400
        if http_err.code in (404, 400):
            try:
                endpoint_used = GENERATE_CONTENT_URL
                req_gen = urllib.request.Request(
                    f"{GENERATE_CONTENT_URL}?key={key}",
                    data=json.dumps(generate_content_payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req_gen, timeout=timeout) as resp_gen:
                    gen_data = json.loads(resp_gen.read().decode("utf-8"))
                    raw_response_text = gen_data["candidates"][0]["content"]["parts"][0]["text"]
            except urllib.error.HTTPError as fallback_err:
                err_body = fallback_err.read().decode("utf-8", errors="replace")[:400]
                raise RuntimeError(f"Gemma 4 API HTTP {fallback_err.code}: {err_body}")
        else:
            err_body = http_err.read().decode("utf-8", errors="replace")[:400]
            raise RuntimeError(f"Gemma 4 API HTTP {http_err.code}: {err_body}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
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
    session_key = f"{repo_ref}#{pr_number}@{head_sha}"
    _CHAT_SESSIONS[session_key] = {
        "repo_ref": f"{repo_ref}#{pr_number}",
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


def chat_visual_architecture(repo_ref, head_sha, user_message, api_key=None, timeout=30):
    """Handle interactive maintainer follow-up questions bound to the current PR context.

    Ensures context invalidation if the PR or head SHA changes.
    """
    session_key = f"{repo_ref}@{head_sha}"
    session = _CHAT_SESSIONS.get(session_key)

    if not session:
        raise ValueError(
            f"No active Visual Intelligence session found for {repo_ref} at {head_sha[:7]}. "
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
        "model": MODEL_ID,
        "input": [{"type": "text", "text": chat_prompt}]
    }

    try:
        req = urllib.request.Request(
            INTERACTIONS_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": key}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            answer = ""
            if "output" in data and isinstance(data["output"], list):
                for part in data["output"]:
                    if part.get("type") == "text":
                        answer = part.get("text")
                        break
            elif "response" in data:
                answer = data["response"]
            else:
                answer = str(data)
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
