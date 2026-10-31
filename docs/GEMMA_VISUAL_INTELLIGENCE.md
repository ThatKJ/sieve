# Sieve Visual Intelligence — Gemma 4 Multimodal Architecture Engine

> **GitHub, redesigned for maintainers.**  
> Powered by `gemma-4-26b-a4b-it` via Google Gemini Interactions API.

---

## 1. Executive Overview

**Sieve Visual Intelligence** transforms how open-source maintainers evaluate pull requests by combining **deterministic AST static analysis** with **Gemma 4 multimodal architectural reasoning**.

Instead of maintainers manually parsing complex diffs or inspecting dozens of imported modules, Sieve automatically:
1. Renders a deterministic **Blast Radius DAG** (import topology).
2. Rasterizes this topology into an **in-memory PNG image** via HTML5 Canvas.
3. Serializes a compact **structured repository evidence payload** (changed files, upstream dependencies, direct downstream dependents, test consumers, and collision candidates).
4. Transmits **both the graph image and structured evidence in a single multimodal inference request** to Google's `gemma-4-26b-a4b-it` model.
5. Cross-checks model citations against deterministic AST facts to separate **verified evidence** from **model-generated hypotheses**.
6. Enables interactive, maintainer-guided follow-up Q&A strictly bound to the PR and head commit SHA.

---

## 2. Model & API Specifications

| Parameter | Specification |
|---|---|
| **Model ID** | `gemma-4-26b-a4b-it` |
| **Model Architecture** | Gemma 4 26B A4B IT (Mixture-of-Experts multimodal instruction-tuned) |
| **Primary API Endpoint** | `POST https://generativelanguage.googleapis.com/v1beta/interactions` |
| **Fallback Endpoint** | `POST https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent` |
| **Payload Format** | Multimodal (`image/png` base64 + structured JSON text) |
| **Response Format** | JSON Schema enforcement (`application/json`) |
| **Dependencies** | **Zero third-party Python packages** (Pure Python 3 standard library: `urllib.request`, `struct`, `json`, `base64`) |

---

## 3. Multimodal Pipeline Architecture

```
Maintainer opens Pull Request on GitHub
                 │
                 ▼
  Sieve PR Intelligence Drawer (Shadow DOM)
                 │
                 ├── 1. Generates SVG Blast Radius DAG (Upstream, Changed, Dependents, Tests)
                 └── 2. Rasterizes SVG to Canvas -> Clean PNG base64 (`image/png`)
                                │
                                ▼
         Background Service Worker (`extension/background.js`)
                                │
                                ▼
         Sieve Localhost Engine (`sieve/server.py` @ 127.0.0.1:8787)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       sieve/atlas.py + core.py          sieve/gemma.py
       (Deterministic AST Facts)         - PNG Header & Dimension Validation
                                         - Structured Evidence Packaging
                                         - Interactions API Multimodal Request
                                               │
                                               ▼
                                 Google Interactions API (`gemma-4-26b-a4b-it`)
                                 [Graph PNG + AST Evidence JSON]
                                               │
                                               ▼
                                 Structured Response Validation & Grounding
                                 - Cross-check citations against AST nodes
                                 - Classify Verified Facts vs Hypotheses
                                 - Bind chat context to PR# and Head SHA
                                               │
                                               ▼
                      Presented inside PR Intelligence Drawer
```

---

## 4. Why Multimodal Vision Matters for Software Architecture

1. **Topology Comprehension**: Complex dependency graphs have spatial characteristics (clustering, bottleneck nodes, cycles) that are immediately obvious in a visual DAG but noisy in flat tabular JSON.
2. **Directional Blast Radius**: Gemma 4 perceives the flow from upstream dependencies through modified components to downstream consumer interfaces and test suites simultaneously.
3. **Dual Verification**: The visual topology prevents the model from hallucinating non-existent dependency paths, while structured AST metadata provides exact file paths, line numbers, and diff excerpts.

---

## 5. Grounding & Fact Verification

To prevent AI hallucinations from polluting maintainer workflows, Sieve implements strict grounding:
* **AST Validation**: Every file, module, or dependent cited by Gemma 4 in `potential_risks` or `missing_test_scenarios` is cross-checked against deterministic repository symbols.
* **Badged Output**:
  * `[Verified in AST]`: Cites a real changed file, direct dependent, or test consumer.
  * `[Model Hypothesis]`: Speculative reasoning or external interface assumptions.
* **Diagnostic Audit Stamp**: Every response includes an audit stamp with model ID, PNG dimensions, byte size, and timestamp:
  ```json
  "diagnostic": {
    "model_id": "gemma-4-26b-a4b-it",
    "endpoint": "https://generativelanguage.googleapis.com/v1beta/interactions",
    "multimodal_image_attached": true,
    "image_dimensions": "800x480",
    "image_bytes": 14208,
    "repo_ref": "ThatKJ/sieve#42",
    "head_sha": "abc1234",
    "timestamp": "2026-10-31T00:20:00Z"
  }
  ```

---

## 6. Security Boundaries

* **No Leaked Secrets**: `GEMMA_API_KEY` is loaded securely on the backend from `.env` or system environment. It is **never** sent to the client browser extension or exposed via `/api/health`.
* **Origin & Host Validation**: Engine binds to `127.0.0.1:8787` only; incoming requests must match `localhost` or authorized `chrome-extension://` origins.
* **Strict Image Bounds**: Validates PNG magic bytes (`\x89PNG\r\n\x1a\n`), IHDR chunks, dimension bounds (up to 8192×8192), and maximum payload sizes (5MB base64 / 4MB raw) to prevent decompression attacks.
* **Bound Conversation Sessions**: Chat sessions are strictly keyed by `(repo_ref, head_sha)`. Navigating to another PR or pushing a new commit immediately invalidates previous chat context.

---

## 7. How to Run & Verify

### Step 1: Configure Gemma API Key
Copy the example environment template and add your Google AI Studio key:
```bash
cp .env.example .env
# Edit .env and set:
# GEMMA_API_KEY=AIzaSy...
```

### Step 2: Start Sieve Engine
```bash
python3 -m sieve --serve --port 8787
```

### Step 3: Run the Verification Test Suite
```bash
python3 -m pytest
# 60 passed in 0.15s
```

### Step 4: Open GitHub & Review
1. Navigate to any PR (e.g. `https://github.com/ThatKJ/sieve/pull/1`).
2. Click **Sieve Workspace** in the header switcher.
3. Open the PR Intelligence drawer.
4. Scroll to **Visual Architecture Intelligence**.
5. Click **Analyze Architecture with Gemma 4**.
6. Review the rasterized topology preview, architectural implications, grounded risks, and interactive follow-up Q&A!
