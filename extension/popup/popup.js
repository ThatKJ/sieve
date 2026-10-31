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

      if ($("gemma-status")) {
        $("gemma-status").textContent = d.gemma_configured
          ? `${d.gemma_model} (active)`
          : "needs key (.env)";
      }

      $("github-auth").textContent = d.github_auth
        ? "token active (5000 req/h)"
        : "unauthenticated (60 req/h)";
    });
  }

  // Master switch. Authoritative state is chrome.storage.local "sieveEnabled"; a missing value means
  // enabled (the first-install default). GitHub tabs react through storage.onChanged.
  function renderMaster(enabled) {
    $("master-toggle").checked = enabled;
    $("master-state").textContent = enabled ? "Enabled" : "Disabled";
    $("master-state").className = enabled ? "master-state on" : "master-state";
  }
  chrome.storage.local.get("sieveEnabled", (res) => {
    if (chrome.runtime.lastError) { $("master-state").textContent = "Couldn't read setting"; return; }
    renderMaster(res.sieveEnabled !== false);
  });
  $("master-toggle").addEventListener("change", () => {
    const toggle = $("master-toggle");
    const enabled = toggle.checked;
    toggle.disabled = true; // one write at a time: rapid clicks can't interleave
    chrome.storage.local.set({ sieveEnabled: enabled }, () => {
      toggle.disabled = false;
      if (chrome.runtime.lastError) {
        renderMaster(!enabled);
        $("master-help").textContent = "Couldn't save the setting: " + chrome.runtime.lastError.message;
        return;
      }
      renderMaster(enabled);
      setTimeout(checkTab, 250); // let the tab apply it, then report what it actually did
    });
  });

  // Auto-open preference
  chrome.storage.local.get("autoOpenSieve", (res) => {
    // Default to true if unset
    $("auto-open-toggle").checked = res.autoOpenSieve !== false;
  });

  $("auto-open-toggle").addEventListener("change", () => {
    const autoOpen = $("auto-open-toggle").checked;
    // The toggle becomes the source of truth: clear the last switcher choice so that, for example,
    // re-enabling it after picking "Native GitHub" brings Sieve back. Open tabs update via storage.onChanged.
    chrome.storage.local.set({ autoOpenSieve: autoOpen }, () => {
      chrome.storage.local.remove("activeViewMode", () => setTimeout(checkTab, 150));
    });
  });

  // Ask the content script in the active tab what it actually did. The engine being online says
  // nothing about whether Sieve is present or mounted on this page.
  const ROUTE_LABEL = { PULLS: "Pull request list", PR_DETAIL: "Pull request", OTHER: "Not a pull request page" };
  function setTabNote(text) {
    $("tab-note").hidden = !text;
    $("tab-note").textContent = text || "";
  }
  function checkTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const onGitHub = tab && typeof tab.url === "string" && tab.url.startsWith("https://github.com/");
      if (!tab || !onGitHub) {
        $("tab-script").textContent = "not applicable";
        $("tab-route").textContent = "Not a GitHub page";
        $("tab-mounted").textContent = "–";
        $("tab-activation").textContent = "–";
        setTabNote("");
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "SIEVE_STATUS" }, (st) => {
        if (chrome.runtime.lastError || !st || !st.present) {
          $("tab-script").textContent = "not running";
          $("tab-route").textContent = "unknown";
          $("tab-mounted").textContent = "no";
          $("tab-activation").textContent = "–";
          setTabNote("Refresh this GitHub tab. Tabs opened before Sieve was installed or reloaded don't have it yet.");
          return;
        }
        $("tab-script").textContent = st.contextValid ? "running" : "stale (refresh tab)";
        $("tab-route").textContent = ROUTE_LABEL[st.route] || st.route;
        $("tab-activation").textContent = { idle: "not run", running: "in progress", complete: "complete", failed: "failed" }[st.activation] || "–";
        if (st.enabled === false) {
          $("tab-mounted").textContent = "no (Sieve disabled)";
          setTabNote("");
          return;
        }
        if (!st.supported) {
          $("tab-mounted").textContent = "–";
          setTabNote("Sieve appears on a repository's pull request list and on individual pull requests.");
          return;
        }
        if (st.route === "PULLS" && st.mode === "native") {
          $("tab-mounted").textContent = "native view selected";
          setTabNote("Choose \u201cSieve Workspace\u201d next to the page title to switch.");
          return;
        }
        $("tab-mounted").textContent = st.mounted ? "yes" : "waiting for page";
        const last = st.events && st.events[st.events.length - 1];
        setTabNote(st.mounted ? "" : (last ? `Last event: ${last.event}` : ""));
      });
    });
  }

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

  // Initial checks
  checkHealth();
  checkTab();
})();
