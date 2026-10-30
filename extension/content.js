// Sieve Workspace — Primary Content Script
// Orchestrates page adapters, Shadow DOM mounting, and view toggling on GitHub.

(function () {
  "use strict";

  if (window.__sieveContentLoaded) return;
  window.__sieveContentLoaded = true;

  console.log("[Sieve Workspace] Content script initialized on:", window.location.href);

  let currentHost = null;
  let shadowRoot = null;
  let activeViewMode = "sieve"; // "sieve" or "native"
  let userSwitchedManually = false;
  let lastLoadedLoc = null;

  function detectGitHubTheme() {
    const html = document.documentElement;
    const colorMode = html.getAttribute("data-color-mode");
    if (colorMode === "dark") return "dark";
    if (colorMode === "light") return "light";
    if (colorMode === "auto") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    const darkTheme = html.getAttribute("data-dark-theme");
    if (darkTheme && darkTheme.includes("dark")) return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateHostTheme() {
    const host = document.getElementById("sieve-workspace-host");
    if (host) {
      const theme = detectGitHubTheme();
      host.setAttribute("data-theme", theme);
    }
  }

  // Observe theme changes on GitHub root
  const themeObserver = new MutationObserver(() => updateHostTheme());
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-color-mode", "data-dark-theme", "class"]
  });

  // Inject switcher styles directly into the main GitHub page
  function injectNativeSwitcherStyle() {
    if (document.getElementById("sieve-native-switcher-style")) return;
    const style = document.createElement("style");
    style.id = "sieve-native-switcher-style";
    style.textContent = `
      .sieve-native-switcher {
        display: inline-flex;
        align-items: center;
        padding: 3px;
        border-radius: 999px;
        margin-left: 14px;
        background: var(--color-canvas-subtle, rgba(110, 118, 129, 0.12));
        border: 1px solid var(--color-border-default, rgba(110, 118, 129, 0.22));
        vertical-align: middle;
        gap: 3px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .sieve-native-switcher button {
        border: 0;
        background: transparent;
        color: var(--color-fg-muted, #7d8590);
        padding: 4px 13px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.3;
        transition: all 120ms ease;
      }
      .sieve-native-switcher button:hover {
        color: var(--color-fg-default, #e6edf3);
      }
      .sieve-native-switcher button[aria-selected="true"] {
        background: var(--color-canvas-default, #161b22);
        color: var(--color-fg-default, #f0f6fc);
        font-weight: 600;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
        border: 1px solid var(--color-border-muted, rgba(110, 118, 129, 0.3));
      }
      html[data-color-mode="light"] .sieve-native-switcher button[aria-selected="true"] {
        background: #FFFFFF;
        color: #1f2328;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        border-color: #d0d7de;
      }
      .sieve-pr-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        margin-left: 10px;
        border-radius: 999px;
        background: #21262d;
        color: #f0f6fc;
        border: 1px solid rgba(240, 246, 252, 0.18);
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        vertical-align: middle;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        transition: all 120ms ease;
      }
      .sieve-pr-pill:hover {
        background: #30363d;
        transform: translateY(-1px);
      }
      html[data-color-mode="light"] .sieve-pr-pill {
        background: #171717;
        color: #FFFFFF;
        border: 1px solid #171717;
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  // Load user preferences
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["activeViewMode", "autoOpenSieve"], (res) => {
      if (res.autoOpenSieve === false) {
        activeViewMode = "native";
      } else if (res.activeViewMode) {
        activeViewMode = res.activeViewMode;
      }
    });
  }

  function getOrCreateShadowRoot(targetContainer, nativeList) {
    let host = document.getElementById("sieve-workspace-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "sieve-workspace-host";
      shadowRoot = host.attachShadow({ mode: "open" });

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("ui/workspace.css");
      shadowRoot.append(link);
    }

    updateHostTheme();

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
      injectNativeSwitcherStyle();

      let switcher = subnav.querySelector(".sieve-native-switcher");
      if (!switcher) {
        switcher = document.createElement("div");
        switcher.className = "sieve-native-switcher";
        switcher.setAttribute("role", "tablist");
        switcher.setAttribute("aria-label", "Pull request view mode");

        const nativeBtn = document.createElement("button");
        nativeBtn.type = "button";
        nativeBtn.className = "sieve-switch-native";
        nativeBtn.textContent = "Native GitHub";

        const sieveBtn = document.createElement("button");
        sieveBtn.type = "button";
        sieveBtn.className = "sieve-switch-sieve";
        sieveBtn.textContent = "Sieve Workspace";

        nativeBtn.onclick = () => {
          activeViewMode = "native";
          userSwitchedManually = true;
          nativeBtn.setAttribute("aria-selected", "true");
          sieveBtn.setAttribute("aria-selected", "false");
          chrome.storage.local.set({ activeViewMode: "native" });
          onToggle("native");
        };

        sieveBtn.onclick = () => {
          activeViewMode = "sieve";
          userSwitchedManually = true;
          sieveBtn.setAttribute("aria-selected", "true");
          nativeBtn.setAttribute("aria-selected", "false");
          chrome.storage.local.set({ activeViewMode: "sieve" });
          onToggle("sieve", { intentional: true });
        };

        switcher.append(nativeBtn, sieveBtn);
        subnav.append(switcher);
      }

      // Update button active state
      const nBtn = switcher.querySelector(".sieve-switch-native");
      const sBtn = switcher.querySelector(".sieve-switch-sieve");
      if (nBtn) nBtn.setAttribute("aria-selected", String(activeViewMode === "native"));
      if (sBtn) sBtn.setAttribute("aria-selected", String(activeViewMode === "sieve"));

    } catch (err) {
      console.error("[Sieve Workspace] injectNativeSwitcher error:", err);
    }
  }

  function handlePullsPage(loc) {
    lastLoadedLoc = loc;
    let attempts = 0;
    const maxAttempts = 20;

    function tryMount() {
      const subnav = window.SieveAdapter.findSubnavContainer();
      const nativeList = window.SieveAdapter.findNativePullsList();

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
      const parentContainer = nativeList.parentElement || document.querySelector("main") || document.body;
      const shadow = getOrCreateShadowRoot(parentContainer, nativeList);

      function applyView(mode, opts = {}) {
        if (mode === "sieve") {
          nativeList.style.display = "none";
          currentHost.style.display = "block";
          loadCommandCenter(loc, shadow, opts);
        } else {
          nativeList.style.display = "";
          currentHost.style.display = "none";
        }
      }

      injectNativeSwitcher(subnav, (mode, opts) => applyView(mode, opts));
      applyView(activeViewMode);
    } catch (e) {
      console.error("[Sieve Workspace] initPullsView error:", e);
    }
  }

  async function loadCommandCenter(loc, shadow, opts = {}) {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("ui/workspace.css");

    // Show loading skeleton inside shadow DOM
    const skeleton = document.createElement("div");
    skeleton.className = "sieve-workspace";
    skeleton.innerHTML = `
      <div class="repo-header" style="padding: 24px;">
        <div class="repo-brand">
          <div class="repo-title-wrap">
            <h1 style="font-size:22px;">${loc.owner} / ${loc.repo}</h1>
            <p class="repo-meta" style="font-size:13px; color: var(--sieve-text-secondary, #777);">Scanning pull requests & AST blast radius…</p>
          </div>
        </div>
      </div>
    `;
    shadow.replaceChildren(styleLink, skeleton);

    // Live health query
    let health = { connected: false, model: "offline" };
    try {
      const hRes = await chrome.runtime.sendMessage({ type: "CHECK_HEALTH", forceFresh: Boolean(opts.intentional) });
      if (hRes && hRes.ok) {
        health = {
          connected: true,
          model: hRes.data.model || "none",
          latency_ms: hRes.data.latency_ms,
          ollama: hRes.data.ollama,
          github_auth: hRes.data.github_auth
        };
      }
    } catch {
      health = { connected: false, model: "offline" };
    }

    try {
      const qRes = await chrome.runtime.sendMessage({
        type: "GET_QUEUE",
        repo: loc.ref,
        forceFresh: Boolean(opts.intentional)
      });
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
    injectNativeSwitcherStyle();
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
    pill.innerHTML = `<span>⚡</span> Sieve Intelligence`;

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
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("ui/workspace.css");

    const errBox = document.createElement("div");
    errBox.className = "sieve-workspace";
    errBox.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center;">
        <div class="empty-icon" style="font-size: 32px;">⚠️</div>
        <div class="empty-title" style="font-size: 18px; font-weight: 700; margin-top: 10px;">Cannot connect to Sieve Intelligence Engine</div>
        <div class="empty-sub" style="font-size: 13px; color: var(--sieve-text-secondary, #777); margin-top: 6px;">${errMsg}</div>
        <p style="font-size: 12px; color: var(--sieve-text-muted, #999); margin-top: 12px;">Run <code>python3 -m sieve --serve</code> on your machine to start the local engine.</p>
      </div>
    `;
    shadow.replaceChildren(styleLink, errBox);
  }

  // Listen for broadcast messages from popup or background worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SIEVE_HEALTH_UPDATED") {
      const host = document.getElementById("sieve-workspace-host");
      if (host && host.shadowRoot) {
        const enginePill = host.shadowRoot.querySelector(".sieve-engine-pill");
        if (enginePill) {
          if (msg.ok) {
            enginePill.className = "sieve-engine-pill";
            enginePill.innerHTML = `<span class="dot"></span> Engine: ${msg.data.model || "online"}`;
          } else {
            enginePill.className = "sieve-engine-pill offline";
            enginePill.innerHTML = `<span class="dot"></span> Engine: offline`;
          }
        }
      }
    } else if (msg.type === "SIEVE_CACHE_CLEARED") {
      if (currentHost && shadowRoot && lastLoadedLoc && activeViewMode === "sieve") {
        loadCommandCenter(lastLoadedLoc, shadowRoot, { intentional: true });
      }
    }
  });

  // Navigation lifecycle
  const handleLocationChange = (loc) => {
    if (!loc) return;
    if (loc.type === "PULLS") {
      handlePullsPage(loc);
    } else if (loc.type === "PR_DETAIL") {
      handlePrDetailPage(loc);
    } else {
      if (currentHost) {
        currentHost.style.display = "none";
      }
    }
  };

  window.SieveAdapter.onPageChange(handleLocationChange);

  // Initial mount trigger
  handleLocationChange(window.SieveAdapter.parseGitHubLocation());
})();
