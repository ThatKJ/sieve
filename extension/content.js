// Sieve Workspace — Primary Content Script
// Orchestrates page adapters, Shadow DOM mounting, and view toggling on GitHub.

(function () {
  "use strict";

  // A reloaded extension (or a second injection) must not double-mount observers and listeners.
  if (window.__sieveContentLoaded) return;
  window.__sieveContentLoaded = true;

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
        onToggle("sieve", { intentional: true });
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
      console.log("[Sieve Workspace] injectNativeSwitcher called");
      applyView(activeViewMode);
      console.log("[Sieve Workspace] applyView completed");
    } catch (e) {
      console.error("[Sieve Workspace] initPullsView error:", e);
    }
  }

  // Replace the workspace content while keeping an open PR overlay alive (SPA navigation re-renders).
  function replaceWorkspace(shadow, ...nodes) {
    const keep = [shadow.querySelector(".sieve-act-overlay"), window.SievePRIntelligence.overlayNode(shadow)].filter(Boolean);
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("ui/workspace.css");
    shadow.replaceChildren(styleLink, ...nodes, ...keep);
  }

  async function loadCommandCenter(loc, shadow, opts = {}) {
    // Show loading skeleton inside shadow DOM (text via textContent: repo names come from the URL)
    const skeleton = document.createElement("div");
    skeleton.className = "sieve-workspace";
    skeleton.innerHTML = `
      <div class="repo-header">
        <div class="repo-brand">
          <div class="repo-avatar"></div>
          <div class="repo-title-wrap">
            <h1></h1>
            <p class="repo-meta">Loading Sieve repository intelligence…</p>
          </div>
        </div>
      </div>
      <div class="empty-state">
        <div class="empty-title">Scanning pull requests and mapping the import graph…</div>
      </div>
    `;
    skeleton.querySelector("h1").textContent = `${loc.owner} / ${loc.repo}`;
    replaceWorkspace(shadow, skeleton);

    // The full activation sequence runs on intentional activation, first activation in this tab, or after a
    // failed init, and never on top of an open PR investigation. Otherwise loading is silent.
    const showActivation = window.SieveActivation.shouldShow(opts) && !window.SievePRIntelligence.isOpen(shadow);
    const act = showActivation
      ? window.SieveActivation.start(shadow, { onRetry: () => { chrome.runtime.sendMessage({ type: "CLEAR_CACHE" }); loadCommandCenter(loc, shadow, { intentional: true }); } })
      : window.SieveActivation.silent;
    const code = (t) => { const c = document.createElement("code"); c.textContent = t; return c; };

    // 1. GitHub: we only get here once the adapter found the pull request list on this page
    act.stage("github", "done", "Attached to this pull requests page");

    // 2. Repository context, parsed from the URL
    act.stage("repo", "active");
    if (!loc.owner || !loc.repo) {
      act.stage("repo", "error", "Not a repository page");
      act.fail("Couldn't detect a repository", "Sieve works on a repository's pull requests page.");
      return;
    }
    act.stage("repo", "done", loc.ref);

    // 3. Engine health
    act.stage("engine", "active");
    let health = { connected: false, model: "offline" };
    try {
      const hRes = await chrome.runtime.sendMessage({ type: "CHECK_HEALTH" });
      if (hRes && hRes.ok) health = { connected: true, model: hRes.data.model };
      else throw new Error(hRes?.error || "No response from the engine");
      act.stage("engine", "done", `${hRes.data.model}${hRes.data.ollama ? " · local model ready" : " · model offline, deterministic checks only"}`);
    } catch (err) {
      act.stage("engine", "error", "Not reachable");
      act.fail("Sieve Engine isn't reachable", err.message, ["Start it with ", code("python3 -m sieve --serve"), " and press Retry."]);
      renderErrorState(shadow, loc, err.message);
      return;
    }

    // 4. Repository data (the open pull request queue)
    act.stage("data", "active");
    let queue;
    try {
      const qRes = await chrome.runtime.sendMessage({ type: "GET_QUEUE", repo: loc.ref });
      if (!qRes || !qRes.ok) throw new Error(qRes?.error || "Could not retrieve repository queue.");
      queue = qRes.data;
      act.stage("data", "done", `${(queue.rows || []).length} open pull request${(queue.rows || []).length === 1 ? "" : "s"}`);
    } catch (err) {
      act.stage("data", "error", "Unavailable");
      act.fail("Repository information is unavailable", err.message, ["GitHub may be rate-limiting the engine. Setting ", code("GITHUB_TOKEN"), " raises the limit."]);
      renderErrorState(shadow, loc, err.message);
      return;
    }

    // 5. Workspace
    act.stage("workspace", "active");
    try {
      // render() replaces the whole shadow content: carry the floating layers over to the new tree
      const floating = [shadow.querySelector(".sieve-act-overlay"), window.SievePRIntelligence.overlayNode(shadow)].filter(Boolean);
      window.SieveCommandCenter.render(shadow, loc, queue, health, {
        onInspectPR: (prNumber) => openPRDrawer(loc, prNumber, shadow)
      });
      shadow.append(...floating);
      act.stage("workspace", "done", "Command Center ready");
      act.complete();
    } catch (err) {
      act.stage("workspace", "error", "Render failed");
      act.fail("Couldn't prepare the workspace", err.message);
      renderErrorState(shadow, loc, err.message);
    }
  }

  function analyzePR(prRef) {
    return async () => {
      const res = await chrome.runtime.sendMessage({ type: "GET_ANALYZE", pr: prRef, useModel: false });
      if (!res || !res.ok) throw new Error(res?.error || "Could not analyze this pull request");
      return res.data;
    };
  }

  function openPRDrawer(loc, prNumber, shadow) {
    const prRef = `${loc.owner}/${loc.repo}#${prNumber}`;
    const trigger = shadow.activeElement; // the row/button the maintainer clicked
    window.SievePRIntelligence.open(shadow, { prRef, trigger, load: analyzePR(prRef) });
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
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; margin-left: 10px;
      border-radius: 999px; background: #171717; color: #FFFFFF; font-size: 11.5px; font-weight: 600;
      border: 1px solid #171717; cursor: pointer; vertical-align: middle;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15); transition: transform 120ms ease;
    `;
    pill.innerHTML = `<span>⚡</span> Sieve Intelligence`;

    pill.onmouseover = () => { pill.style.transform = "scale(1.04)"; };
    pill.onmouseout = () => { pill.style.transform = "scale(1)"; };

    pill.onclick = () => {
      const prRef = `${loc.owner}/${loc.repo}#${loc.number}`;
      const shadow = getOrCreateShadowRoot(document.body);
      currentHost.style.display = "block";
      window.SievePRIntelligence.open(shadow, { prRef, trigger: pill, load: analyzePR(prRef) });
    };

    prHeader.append(pill);
  }

  function renderErrorState(shadow, loc, errMsg) {
    const errBox = document.createElement("div");
    errBox.className = "sieve-workspace";
    errBox.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Cannot connect to Sieve Intelligence Engine</div>
        <div class="empty-sub"></div>
        <p style="font-size: 12px; color: #6e6d68; margin-top: 8px;">Run <code>python3 -m sieve --serve</code> on your machine to start the local engine.</p>
      </div>
    `;
    errBox.querySelector(".empty-sub").textContent = errMsg;
    replaceWorkspace(shadow, errBox);
  }

  // Register page navigation listener
  // GitHub fires turbo:load, turbo:render and pushState for one navigation: handle each URL once per burst.
  let lastHandled = { href: "", at: 0 };
  const NAV_DEDUPE_MS = 1000;
  const handleLocationChange = (loc) => {
    if (!loc) return;
    const now = Date.now();
    if (location.href === lastHandled.href && now - lastHandled.at < NAV_DEDUPE_MS) return;
    lastHandled = { href: location.href, at: now };
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
