// Sieve Workspace — Background Service Worker (Manifest V3)
const DEFAULT_ENGINE_URL = "http://127.0.0.1:8787";

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
  if (!isHealth && !forceFresh) {
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
    } else {
      cache.set(fullUrl, { timestamp: Date.now(), data });
    }
    return data;
  } catch (err) {
    throw new Error(err.message || "Cannot connect to Sieve Engine. Is `python3 -m sieve --serve` running?");
  }
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

  if (msg.type === "CLEAR_CACHE") {
    cache.clear();
    broadcastToTabs({ type: "SIEVE_CACHE_CLEARED" });
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
