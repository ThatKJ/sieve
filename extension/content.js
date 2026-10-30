// Sieve Workspace — Primary Content Script
// Orchestrates page adapters, Shadow DOM mounting, and view toggling on GitHub.

(function () {
  "use strict";

  console.log("[Sieve Workspace] Content script initialized on:", window.location.href);

  let currentHost = null;
  let shadowRoot = null;
  let activeViewMode = "sieve"; // "sieve" or "native"

  // Load user preference
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get("activeViewMode", (res) => {
      if (res.activeViewMode) activeViewMode = res.activeViewMode;
    });
  }

  function getOrCreateShadowRoot(targetContainer, nativeList) {
    let host = document.getElementById("sieve-workspace-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "sieve-workspace-host";
      shadowRoot = host.attachShadow({ mode: "open" });

      // Link isolated stylesheet
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("ui/workspace.css");
      shadowRoot.append(link);
    }

    if (!host.isConnected) {
      if (nativeList && nativeList.parentElement) {
        nativeList.before(host);
      } else {
        targetContainer.prepend(host);
      }
    }
    currentHost = host;
    return shadowRoot;
  }

  function injectNativeSwitcher(subnav, onToggle) {
    try {
      if (subnav.querySelector(".sieve-native-switcher")) return;

      const switcher = document.createElement("div");
      switcher.className = "sieve-native-switcher";
      switcher.setAttribute("role", "tablist");
      switcher.setAttribute("aria-label", "Pull request view mode");

      const nativeBtn = document.createElement("button");
      nativeBtn.type = "button";
      nativeBtn.textContent = "Native GitHub";
      nativeBtn.setAttribute("aria-selected", String(activeViewMode === "native"));

      const sieveBtn = document.createElement("button");
      sieveBtn.type = "button";
      sieveBtn.textContent = "Sieve Workspace";
      sieveBtn.setAttribute("aria-selected", String(activeViewMode === "sieve"));

      nativeBtn.onclick = () => {
        activeViewMode = "native";
        nativeBtn.setAttribute("aria-selected", "true");
        sieveBtn.setAttribute("aria-selected", "false");
        chrome.storage.local.set({ activeViewMode: "native" });
        onToggle("native");
      };

      sieveBtn.onclick = () => {
        activeViewMode = "sieve";
        sieveBtn.setAttribute("aria-selected", "true");
        nativeBtn.setAttribute("aria-selected", "false");
        chrome.storage.local.set({ activeViewMode: "sieve" });
        onToggle("sieve");
      };

      switcher.append(nativeBtn, sieveBtn);
      subnav.append(switcher);
      console.log("[Sieve Workspace] switcher appended to subnav:", subnav.className);
    } catch (err) {
      console.error("[Sieve Workspace] injectNativeSwitcher error:", err);
    }
  }

  function handlePullsPage(loc) {
    let attempts = 0;
    const maxAttempts = 20;

    function tryMount() {
      const subnav = window.SieveAdapter.findSubnavContainer();
      const nativeList = window.SieveAdapter.findNativePullsList();
      console.log(`[Sieve Workspace] tryMount attempt ${attempts}: subnav=${!!subnav}, nativeList=${!!nativeList}`);

      if (subnav && nativeList) {
        initPullsView(loc, subnav, nativeList);
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryMount, 200);
      }
    }

    tryMount();
  }

  function initPullsView(loc, subnav, nativeList) {
    try {
      console.log("[Sieve Workspace] initPullsView starting...");
      const parentContainer = nativeList.parentElement || document.querySelector("main") || document.body;
      const shadow = getOrCreateShadowRoot(parentContainer, nativeList);
      console.log("[Sieve Workspace] Shadow root created/attached");

      function applyView(mode) {
        if (mode === "sieve") {
          nativeList.style.display = "none";
          currentHost.style.display = "block";
          loadCommandCenter(loc, shadow);
        } else {
          nativeList.style.display = "";
          currentHost.style.display = "none";
        }
      }

      injectNativeSwitcher(subnav, (mode) => applyView(mode));
      console.log("[Sieve Workspace] injectNativeSwitcher called");
      applyView(activeViewMode);
      console.log("[Sieve Workspace] applyView completed");
    } catch (e) {
      console.error("[Sieve Workspace] initPullsView error:", e);
    }
  }

  async function loadCommandCenter(loc, shadow) {
    // Show loading skeleton inside shadow DOM
    const skeleton = document.createElement("div");
    skeleton.className = "sieve-workspace";
    skeleton.innerHTML = `
      <div class="repo-header">
        <div class="repo-brand">
          <div class="repo-avatar"></div>
          <div class="repo-title-wrap">
            <h1>${loc.owner} / ${loc.repo}</h1>
            <p class="repo-meta">Loading Sieve repository intelligence…</p>
          </div>
        </div>
      </div>
      <div class="empty-state">
        <div class="empty-icon">⏳</div>
        <div class="empty-title">Scanning pull requests & computing AST blast radius…</div>
      </div>
    `;
    shadow.replaceChildren(skeleton);

    // Query health & queue in parallel via background worker
    let health = { connected: false, model: "unknown" };
    try {
      const hRes = await chrome.runtime.sendMessage({ type: "CHECK_HEALTH" });
      if (hRes && hRes.ok) health = { connected: true, model: hRes.data.model };
    } catch {
      health = { connected: false, model: "offline" };
    }

    try {
      const qRes = await chrome.runtime.sendMessage({ type: "GET_QUEUE", repo: loc.ref });
      if (qRes && qRes.ok) {
        window.SieveCommandCenter.render(shadow, loc, qRes.data, health, {
          onInspectPR: (prNumber) => openPRDrawer(loc, prNumber, shadow)
        });
      } else {
        renderErrorState(shadow, loc, qRes?.error || "Could not retrieve repository queue.");
      }
    } catch (err) {
      renderErrorState(shadow, loc, err.message);
    }
  }

  async function openPRDrawer(loc, prNumber, shadow) {
    const prRef = `${loc.owner}/${loc.repo}#${prNumber}`;
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_ANALYZE", pr: prRef, useModel: false });
      if (res && res.ok) {
        window.SievePRIntelligence.openDrawer(shadow, res.data);
      } else {
        alert(`Sieve error: ${res?.error || "Could not analyze PR"}`);
      }
    } catch (err) {
      alert(`Connection error: ${err.message}`);
    }
  }

  function handlePrDetailPage(loc) {
    let attempts = 0;
    const maxAttempts = 30;

    function checkAndMount() {
      const prHeader = window.SieveAdapter.findPrTitleHeader();
      if (prHeader && !prHeader.querySelector(".sieve-pr-pill")) {
        mountPrPill(prHeader, loc);
      }
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkAndMount, 250);
      }
    }

    checkAndMount();
  }

  function mountPrPill(prHeader, loc) {
    if (prHeader.querySelector(".sieve-pr-pill")) return;

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "sieve-pr-pill";
    pill.style.cssText = `
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; margin-left: 8px;
      border-radius: 999px; background: #2f5bea; color: #ffffff; font-size: 12px; font-weight: 600;
      border: 0; cursor: pointer; vertical-align: middle; font-family: ui-monospace, monospace;
      box-shadow: 0 1px 3px rgba(47,91,234,0.3); transition: transform 120ms ease;
    `;
    pill.innerHTML = `<span>⚡</span> Sieve Intelligence`;

    pill.onmouseover = () => { pill.style.transform = "scale(1.04)"; };
    pill.onmouseout = () => { pill.style.transform = "scale(1)"; };

    pill.onclick = async () => {
      pill.textContent = "Analyzing…";
      const prRef = `${loc.owner}/${loc.repo}#${loc.number}`;
      const parent = document.body;
      const shadow = getOrCreateShadowRoot(parent);

      try {
        const res = await chrome.runtime.sendMessage({ type: "GET_ANALYZE", pr: prRef, useModel: false });
        pill.innerHTML = `<span>⚡</span> Sieve Intelligence`;
        if (res && res.ok) {
          window.SievePRIntelligence.openDrawer(shadow, res.data);
        } else {
          alert(`Sieve error: ${res?.error || "Failed to analyze PR"}`);
        }
      } catch (err) {
        pill.innerHTML = `<span>⚡</span> Sieve Intelligence`;
        alert(`Connection error: ${err.message}`);
      }
    };

    prHeader.append(pill);
  }

  function renderErrorState(shadow, loc, errMsg) {
    const errBox = document.createElement("div");
    errBox.className = "sieve-workspace";
    errBox.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Cannot connect to Sieve Intelligence Engine</div>
        <div class="empty-sub">${errMsg}</div>
        <p style="font-size: 12px; color: #6e6d68; margin-top: 8px;">Run <code>python3 -m sieve --serve</code> on your machine to start the local engine.</p>
      </div>
    `;
    shadow.replaceChildren(errBox);
  }

  // Register page navigation listener
  const handleLocationChange = (loc) => {
    if (!loc) return;
    if (loc.type === "PULLS") {
      handlePullsPage(loc);
    } else if (loc.type === "PR_DETAIL") {
      handlePrDetailPage(loc);
    } else {
      // Unmount Sieve host on other pages
      if (currentHost) {
        currentHost.style.display = "none";
      }
    }
  };

  window.SieveAdapter.onPageChange(handleLocationChange);

  // Initial trigger
  handleLocationChange(window.SieveAdapter.parseGitHubLocation());
})();
