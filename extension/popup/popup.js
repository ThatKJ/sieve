// Sieve Workspace — Popup Script

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function checkHealth() {
    const badge = $("health-badge");
    const refreshBtn = $("refresh-btn");
    const offlineHelp = $("offline-help");
    const latencyRow = $("latency-row");
    const pingLatency = $("ping-latency");

    badge.className = "badge";
    badge.textContent = "testing…";
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Testing…";
    }
    if (offlineHelp) offlineHelp.hidden = true;

    const t0 = Date.now();
    chrome.runtime.sendMessage({ type: "CHECK_HEALTH", forceFresh: true }, (res) => {
      const elapsed = Date.now() - t0;
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "Test Connection";
      }

      if (chrome.runtime.lastError || !res || !res.ok) {
        badge.className = "badge off";
        badge.textContent = "offline";
        $("model-name").textContent = "none";
        $("ollama-status").textContent = "offline";
        $("github-auth").textContent = "–";
        if (latencyRow) latencyRow.hidden = true;
        if (offlineHelp) {
          offlineHelp.hidden = false;
          const errDetail = offlineHelp.querySelector(".err-detail");
          if (errDetail) {
            errDetail.textContent = res?.error || "Connection refused (127.0.0.1:8787)";
          }
        }
        return;
      }

      const d = res.data || {};
      const latency = d.latency_ms ?? elapsed;
      badge.className = "badge ok";
      badge.textContent = `online (${latency}ms)`;

      if (latencyRow && pingLatency) {
        latencyRow.hidden = false;
        pingLatency.textContent = `${latency} ms`;
      }

      $("model-name").textContent = d.model || "none";
      $("ollama-status").textContent = d.ollama
        ? (d.model_installed ? "ready (running)" : "model missing")
        : "not detected";

      $("github-auth").textContent = d.github_auth
        ? "token active (5000 req/h)"
        : "unauthenticated (60 req/h)";
    });
  }

  // Auto-open preference
  chrome.storage.local.get("autoOpenSieve", (res) => {
    // Default to true if unset
    $("auto-open-toggle").checked = res.autoOpenSieve !== false;
  });

  $("auto-open-toggle").addEventListener("change", () => {
    const autoOpen = $("auto-open-toggle").checked;
    chrome.storage.local.set({ autoOpenSieve: autoOpen });
  });

  $("refresh-btn").addEventListener("click", checkHealth);

  $("clear-cache-btn").addEventListener("click", () => {
    const btn = $("clear-cache-btn");
    btn.disabled = true;
    btn.textContent = "Purging…";

    chrome.runtime.sendMessage({ type: "CLEAR_CACHE" }, (res) => {
      btn.disabled = false;
      btn.textContent = "Cache Purged ✓";
      setTimeout(() => { btn.textContent = "Clear Cache"; }, 1500);
      checkHealth();
    });
  });

  // Initial health check
  checkHealth();
})();
