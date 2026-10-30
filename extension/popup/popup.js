// Sieve Workspace — Popup Script

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function checkHealth() {
    $("health-badge").className = "badge";
    $("health-badge").textContent = "checking…";
    $("offline-help").hidden = true;

    chrome.runtime.sendMessage({ type: "CHECK_HEALTH" }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        $("health-badge").className = "badge off";
        $("health-badge").textContent = "offline";
        $("model-name").textContent = "–";
        $("ollama-status").textContent = "offline";
        $("github-auth").textContent = "–";
        $("offline-help").hidden = false;
        return;
      }

      const d = res.data;
      $("health-badge").className = "badge ok";
      $("health-badge").textContent = "connected";
      $("model-name").textContent = d.model || "none";
      $("ollama-status").textContent = d.ollama ? (d.model_installed ? "ready" : "model missing") : "not running";
      $("github-auth").textContent = d.github_auth ? "token active" : "unauthenticated";
    });
  }

  // Load auto-open setting
  chrome.storage.local.get("activeViewMode", (res) => {
    $("auto-open-toggle").checked = res.activeViewMode !== "native";
  });

  $("auto-open-toggle").addEventListener("change", () => {
    const mode = $("auto-open-toggle").checked ? "sieve" : "native";
    chrome.storage.local.set({ activeViewMode: mode });
  });

  $("refresh-btn").addEventListener("click", checkHealth);

  $("clear-cache-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_CACHE" }, () => {
      $("clear-cache-btn").textContent = "Cleared ✓";
      setTimeout(() => { $("clear-cache-btn").textContent = "Clear Cache"; }, 1400);
    });
  });

  checkHealth();
})();

