// Sieve Workspace — Background Service Worker (Manifest V3)
const DEFAULT_ENGINE_URL = "http://127.0.0.1:8787";
const PR_REF_RE = /^[\w.-]+\/[\w.-]+#\d+$/;

// In-memory response cache with TTL
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60s

async function getEngineUrl() {
  try {
    const res = await chrome.storage.local.get("engineUrl");
    return res.engineUrl || DEFAULT_ENGINE_URL;
  } catch {
    return DEFAULT_ENGINE_URL;
  }
}

async function fetchFromEngine(endpoint, forceFresh = false) {
  const engineUrl = await getEngineUrl();
  const fullUrl = `${engineUrl}${endpoint}`;

  // Never cache health check or when forceFresh is requested
  const isHealth = endpoint.startsWith("/api/health");
  const noCache = isHealth || endpoint.startsWith("/api/pr/") || endpoint.startsWith("/api/permission"); // live state: never in the shared cache
  if (!noCache && !forceFresh) {
    const cached = cache.get(fullUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const startTime = Date.now();
  try {
    const res = await fetch(fullUrl, {
      headers: { "X-Requested-With": "Sieve-Workspace-Extension" }
    });
    const data = await res.json().catch(() => ({ error: `Engine returned ${res.status}` }));
    if (!res.ok) {
      throw new Error(data.error || `Engine error: ${res.status}`);
    }
    const elapsed = Date.now() - startTime;
    if (isHealth) {
      data.latency_ms = elapsed;
    } else if (!noCache) {
      cache.set(fullUrl, { timestamp: Date.now(), data });
    }
    return data;
  } catch (err) {
    throw new Error(err.message || "Cannot connect to Sieve Engine. Is `python3 -m sieve --serve` running?");
  }
}

// Repository permission results, keyed by GitHub account AND repository. Never shared across either.
// Only definite answers are cached (60s); failures are not, so Retry always asks again.
const accessCache = new Map();
const accessInFlight = new Map();
const ACCESS_TTL_MS = 60 * 1000;
const REPO_REF_RE = /^[\w.-]+\/[\w.-]+$/;

function getRepoAccess(repo, viewer, forceFresh) {
  const key = `${viewer.toLowerCase()}|${repo.toLowerCase()}`;
  const hit = accessCache.get(key);
  if (!forceFresh && hit && Date.now() - hit.timestamp < ACCESS_TTL_MS) return Promise.resolve(hit.data);
  if (!forceFresh && accessInFlight.has(key)) return accessInFlight.get(key); // one request per key at a time
  const p = fetchFromEngine(`/api/permission?repo=${encodeURIComponent(repo)}`, true)
    .then((data) => {
      if (data.status === "granted" || data.status === "denied") accessCache.set(key, { timestamp: Date.now(), data });
      return data;
    })
    .finally(() => { if (accessInFlight.get(key) === p) accessInFlight.delete(key); });
  accessInFlight.set(key, p);
  return p;
}

function broadcastToTabs(message) {
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ url: "https://github.com/*" }, (tabs) => {
      (tabs || []).forEach((t) => {
        try {
          chrome.tabs.sendMessage(t.id, message, () => {
            if (chrome.runtime.lastError) { /* ignore inactive tabs */ }
          });
        } catch { /* ignore */ }
      });
    });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CHECK_HEALTH") {
    fetchFromEngine("/api/health", Boolean(msg.forceFresh))
      .then((data) => {
        chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
        chrome.action.setBadgeText({ text: "OK" });
        broadcastToTabs({ type: "SIEVE_HEALTH_UPDATED", data, ok: true });
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        chrome.action.setBadgeBackgroundColor({ color: "#c62828" });
        chrome.action.setBadgeText({ text: "ERR" });
        broadcastToTabs({ type: "SIEVE_HEALTH_UPDATED", error: err.message, ok: false });
        sendResponse({ ok: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }

  if (msg.type === "GET_QUEUE") {
    fetchFromEngine(`/api/queue?repo=${encodeURIComponent(msg.repo)}`, Boolean(msg.forceFresh))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_ANALYZE") {
    const modelParam = msg.useModel ? "1" : "0";
    fetchFromEngine(`/api/analyze?pr=${encodeURIComponent(msg.pr)}&model=${modelParam}`, Boolean(msg.forceFresh))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_ATLAS") {
    const endpoint = msg.pr ? `/api/atlas?pr=${encodeURIComponent(msg.pr)}` : `/api/atlas?repo=${encodeURIComponent(msg.repo)}`;
    fetchFromEngine(endpoint, Boolean(msg.forceFresh))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_REPO_ACCESS") {
    if (typeof msg.repo !== "string" || !REPO_REF_RE.test(msg.repo) || typeof msg.viewer !== "string" || !msg.viewer) {
      sendResponse({ ok: false, error: "Invalid repository or account." }); return false;
    }
    getRepoAccess(msg.repo, msg.viewer, Boolean(msg.forceFresh))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_PR_CONTROLS") {
    if (typeof msg.pr !== "string" || !PR_REF_RE.test(msg.pr)) { sendResponse({ ok: false, error: "Invalid pull request reference." }); return false; }
    fetchFromEngine(`/api/pr/controls?pr=${encodeURIComponent(msg.pr)}`, true)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "PR_ACTION") {
    // Only this extension's own content scripts may ask for a GitHub write; the engine re-validates everything.
    const bad = sender.id !== chrome.runtime.id ? "Untrusted sender."
      : typeof msg.pr !== "string" || !PR_REF_RE.test(msg.pr) ? "Invalid pull request reference."
      : typeof msg.action !== "string" || !/^[a-z_]{1,40}$/.test(msg.action) ? "Invalid action."
      : !msg.params || typeof msg.params !== "object" || Array.isArray(msg.params) ? "Invalid parameters."
      : typeof msg.expected_head_sha !== "string" || !/^[0-9a-f]{40}$/.test(msg.expected_head_sha) ? "Missing reviewed head commit."
      : typeof msg.request_id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(msg.request_id) ? "Missing request id." : null;
    if (bad) { sendResponse({ ok: false, error: bad }); return false; }
    getEngineUrl().then(async (engineUrl) => {
      try {
        const res = await fetch(`${engineUrl}/api/pr/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "Sieve-Workspace-Extension" },
          body: JSON.stringify({ pr: msg.pr, action: msg.action, params: msg.params, expected_head_sha: msg.expected_head_sha, request_id: msg.request_id }),
        });
        const json = await res.json().catch(() => ({ error: `Engine returned ${res.status}` }));
        if (!res.ok || !json.ok) { sendResponse({ ok: false, status: res.status, error: json.error || `HTTP ${res.status}` }); return; }
        cache.clear(); // queue and analysis must be re-read from GitHub
        broadcastToTabs({ type: "SIEVE_CACHE_CLEARED" });
        sendResponse({ ok: true, data: json });
      } catch (err) {
        sendResponse({ ok: false, error: "Could not reach the Sieve engine. The action may not have been sent; reload the controls to check." });
      }
    });
    return true;
  }

  if (msg.type === "CLEAR_CACHE") {
    cache.clear();
    accessCache.clear();
    broadcastToTabs({ type: "SIEVE_CACHE_CLEARED", access: true });
    sendResponse({ ok: true, timestamp: Date.now() });
    return true;
  }

  if (msg.type === "ANALYZE_GEMMA_VISUAL") {
    getEngineUrl().then(async (engineUrl) => {
      try {
        const res = await fetch(`${engineUrl}/api/gemma/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "Sieve-Workspace-Extension"
          },
          body: JSON.stringify({
            image_b64: msg.image_b64,
            pr_ref: msg.pr_ref,
            evidence: msg.evidence,
            question: msg.question
          })
        });
        const json = await res.json().catch(() => ({ error: `Engine returned ${res.status}` }));
        if (!res.ok || !json.ok) {
          sendResponse({ ok: false, error: json.error || `HTTP ${res.status}` });
        } else {
          sendResponse({ ok: true, data: json.data });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message || "Failed to reach Sieve Engine for Gemma analysis." });
      }
    });
    return true;
  }

  if (msg.type === "CHAT_GEMMA_VISUAL") {
    getEngineUrl().then(async (engineUrl) => {
      try {
        const res = await fetch(`${engineUrl}/api/gemma/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "Sieve-Workspace-Extension"
          },
          body: JSON.stringify({
            repo_ref: msg.repo_ref,
            pr_number: msg.pr_number,
            head_sha: msg.head_sha,
            message: msg.message
          })
        });
        const json = await res.json().catch(() => ({ error: `Engine returned ${res.status}` }));
        if (!res.ok || !json.ok) {
          sendResponse({ ok: false, error: json.error || `HTTP ${res.status}` });
        } else {
          sendResponse({ ok: true, data: json.data });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message || "Failed to reach Sieve Engine for Gemma chat." });
      }
    });
    return true;
  }
});

// Update badge on install
chrome.runtime.onInstalled.addListener(() => {
  fetchFromEngine("/api/health", true)
    .then(() => {
      chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
      chrome.action.setBadgeText({ text: "OK" });
    })
    .catch(() => {
      chrome.action.setBadgeBackgroundColor({ color: "#777571" });
      chrome.action.setBadgeText({ text: "OFF" });
    });
});
