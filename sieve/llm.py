"""One bounded judgment from a local open-weight model (Ollama).

The model answers a single question deterministic checks can't: does this diff
actually do what the linked issue (or the PR description) asks? Its output is
schema-checked; anything malformed is discarded, never guessed at.
"""
import json
import os
import urllib.error
import urllib.request

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("SIEVE_MODEL", "qwen3.5:9b")
VERDICTS = ("addresses", "partial", "unrelated", "unclear")

SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": list(VERDICTS)},
        "confidence": {"type": "number"},
        "reason": {"type": "string"},
        "gaps": {"type": "array", "items": {"type": "string"}},
        "guideline_issues": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["verdict", "confidence", "reason", "gaps", "guideline_issues"],
}

PROMPT = """You are helping an open-source maintainer triage a pull request.
Judge ONLY whether the code diff implements the stated intent. Ignore code style.

STATED INTENT ({intent_source}):
{intent}

PULL REQUEST TITLE: {title}
PULL REQUEST DESCRIPTION:
{body}

DIFF (may be truncated):
{diff}

PROJECT CONTRIBUTION GUIDELINES (excerpt):
{guidelines}

Answer in JSON:
- verdict: "addresses" (diff implements the intent), "partial" (some of it), "unrelated" (diff does not implement it), or "unclear" (not enough information)
- confidence: 0.0 to 1.0
- reason: one sentence, max 30 words, citing a concrete file or change
- gaps: up to 3 short items the contributor still needs to do (empty if none)
- guideline_issues: up to 3 specific, clear violations of the guidelines above, each quoting the rule briefly (empty if none or no guidelines). Do not invent rules.
"""


def validate(raw):
    """Return a clean judgment dict, or None if the model output is unusable."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or data.get("verdict") not in VERDICTS:
        return None
    try:
        confidence = min(1.0, max(0.0, float(data.get("confidence", 0))))
    except (TypeError, ValueError):
        return None
    reason = str(data.get("reason", "")).strip()[:300]
    return {"verdict": data["verdict"], "confidence": round(confidence, 2), "reason": reason,
            "gaps": _strings(data.get("gaps")), "guideline_issues": _strings(data.get("guideline_issues"))}


def _strings(value, limit=3):
    if not isinstance(value, list):
        return []
    return [str(v).strip()[:200] for v in value if str(v).strip()][:limit]


def judge(intent, intent_source, title, body, diff, guidelines=None, timeout=150):
    """Return (judgment | None, error message | None)."""
    prompt = PROMPT.format(intent=intent[:2500], intent_source=intent_source, title=title,
                           body=(body or "(empty)")[:1500], diff=diff[:6000],
                           guidelines=(guidelines or "(none provided)")[:3000])
    payload = json.dumps({
        "model": MODEL, "prompt": prompt, "stream": False, "think": False,
        "format": SCHEMA, "options": {"temperature": 0, "num_ctx": 8192},
    }).encode()
    req = urllib.request.Request(OLLAMA_URL + "/api/generate", data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = json.loads(resp.read()).get("response", "")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return None, f"Local model unavailable ({getattr(e, 'reason', e)}). Is Ollama running with {MODEL}?"
    judgment = validate(raw)
    if judgment is None:
        return None, "Model returned malformed output; ignored."
    return judgment, None
