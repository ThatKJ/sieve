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

async function fetchFromEngine(endpoint) {
  const engineUrl = await getEngineUrl();
  const fullUrl = `${engineUrl}${endpoint}`;
  
  const cached = cache.get(fullUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(fullUrl, {
      headers: { "X-Requested-With": "Sieve-Workspace-Extension" }
    });
    const data = await res.json().catch(() => ({ error: `Engine returned ${res.status}` }));
    if (!res.ok) {
      throw new Error(data.error || `Engine error: ${res.status}`);
    }
    cache.set(fullUrl, { timestamp: Date.now(), data });
    return data;
  } catch (err) {
    throw new Error(err.message || "Cannot connect to Sieve Engine. Is `python3 -m sieve --serve` running?");
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CHECK_HEALTH") {
    fetchFromEngine("/api/health")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (msg.type === "GET_QUEUE") {
    fetchFromEngine(`/api/queue?repo=${encodeURIComponent(msg.repo)}`)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_ANALYZE") {
    const modelParam = msg.useModel ? "1" : "0";
    fetchFromEngine(`/api/analyze?pr=${encodeURIComponent(msg.pr)}&model=${modelParam}`)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_ATLAS") {
    const endpoint = msg.pr ? `/api/atlas?pr=${encodeURIComponent(msg.pr)}` : `/api/atlas?repo=${encodeURIComponent(msg.repo)}`;
    fetchFromEngine(endpoint)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "CLEAR_CACHE") {
    cache.clear();
    sendResponse({ ok: true });
    return true;
  }
});

// Update badge when extension installs or starts
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#2f5bea" });
  chrome.action.setBadgeText({ text: "" });
});

