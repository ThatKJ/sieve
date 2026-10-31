// Sieve Workspace — Primary Content Script
// Orchestrates page adapters, Shadow DOM mounting, and view toggling on GitHub.
//
// Lifecycle: every trigger (navigation event, DOM mutation, preference change) only *schedules*
// reconcile(), coalesced to one run per animation frame. reconcile() is idempotent: it re-reads the
// URL and re-queries the DOM each time, mounts what is missing, and does nothing when the page is
// already in the right state. There is no retry budget to run out: if GitHub hasn't rendered yet,
// the next DOM mutation schedules another pass.

(function () {
  "use strict";

  if (window.__sieveContentLoaded) return;
  window.__sieveContentLoaded = true;

  // ---------------------------------------------------------------- diagnostics (privacy-safe)
  // Route categories and error messages only: no tokens, no response bodies, no PR content.
  const MAX_EVENTS = 60;
  const events = [];
  const debugLogging = (() => { try { return localStorage.getItem("sieve:debug") === "1"; } catch { return false; } })();
  function diag(event, detail = {}) {
    const entry = { t: new Date().toISOString(), event, ...detail };
    events.push(entry);
    if (events.length > MAX_EVENTS) events.shift();
    if (debugLogging) console.debug("[Sieve Workspace]", event, detail);
  }

  const state = {
    prefsReady: false,
    enabled: true,           // master switch (sieveEnabled). A missing value means enabled: see loadPrefs()
    welcomeShown: false,     // the welcome activation has completed once since install
    pendingActivation: false,
    activation: "idle",      // idle → running → complete | failed
    activationToken: 0,      // bumps on every start/cancel so stale async steps are ignored
    activationCtl: null,
    autoOpen: true,          // popup preference: open Sieve by default on pull request lists
    storedMode: null,        // last explicit switcher choice, persisted
    sessionMode: null,       // explicit switcher choice in this tab; wins over everything
    routeKey: null,
    routeCategory: "OTHER",
    loadedKey: null,         // repo whose queue is loaded into the workspace
    domReadyLogged: false,
    waitingLogged: false,
    mounted: false,
    hiddenLists: new Set(),  // native GitHub elements we hid, restored on leave or Native mode
    contextValid: true,
    scheduled: false,
  };

  let currentHost = null;
  let shadowRoot = null;

  // ---------------------------------------------------------------- maintainer access gate
  // Effective activation: Sieve enabled AND a signed-in GitHub account AND admin/maintain/write on this
  // repository, verified through the engine. Nothing mounts until the answer is "granted".
  const accessGate = window.SieveAccess.createGate({
    fetchAccess: (repo, viewer, forceFresh) => send({ type: "GET_REPO_ACCESS", repo, viewer, forceFresh }),
    onChange: (d) => { diag("access_checked", { status: d.status, permission: d.permission || null }); schedule("access"); },
  });

  function viewerLogin() {
    // GitHub renders the signed-in account here on every page (and swaps <head> on account changes).
    return document.querySelector('meta[name="user-login"]')?.getAttribute("content") || null;
  }

  const ACCESS_TEXT = {
    denied: (d) => [`Sieve · maintainers only`, `You have ${d.permission === "none" ? "no" : d.permission} access to this repository. Sieve activates for write, maintain or admin.`],
    signed_out: () => ["Sieve · sign in to verify access", "Sign in to GitHub so Sieve can check your permission on this repository."],
    unauthenticated: () => ["Sieve · engine needs GitHub sign-in", "The local engine has no valid GitHub token, so it can't verify your permission. Run `gh auth login` or set GITHUB_TOKEN, then restart it."],
    account_mismatch: (d) => [`Sieve · engine is @${d.login || "unknown"}`, `The engine's GitHub token belongs to @${d.login || "unknown"}, not the account signed in here. Use the same account for both.`],
    error: (d) => ["Sieve · couldn't verify access", `${d.error || "Permission check failed."} Sieve stays off until access is confirmed.`],
  };

  function renderAccessNotice(anchor, d) {
    const make = ACCESS_TEXT[d.status];
    let chip = document.querySelector(".sieve-access-chip");
    if (!make || !anchor) { chip?.remove(); return; } // "checking": no flash for a check that takes milliseconds
    const [label, detail] = make(d);
    const sig = `${d.key}|${d.status}`;
    if (chip && chip.dataset.sig === sig && anchor.contains(chip)) return;
    chip?.remove();
    injectNativeSwitcherStyle();
    chip = document.createElement("span");
    chip.className = "sieve-access-chip";
    chip.dataset.sig = sig;
    chip.dataset.status = d.status;
    chip.setAttribute("role", "status");
    chip.title = detail;
    chip.textContent = label;
    if (d.status === "error") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => { diag("access_retry"); accessGate.refresh(true); schedule("access_retry"); });
      chip.append(" ", retry);
    }
    anchor.append(chip);
  }

  function removeAccessNotice() { document.querySelectorAll(".sieve-access-chip").forEach((c) => c.remove()); }

  // Not allowed (or not known yet): GitHub exactly as it is, plus at most the small notice.
  function withholdSieve() {
    if (state.mounted || state.activationCtl || currentHost?.isConnected || document.querySelector(".sieve-native-switcher, .sieve-pr-pill")) {
      state.activationToken++; // abandon in-flight activation and loads for the previous repository
      state.activation = "idle";
      teardownDom();
      diag("access_withheld");
    }
  }

  // ---------------------------------------------------------------- theme
  function detectGitHubTheme() {
    const html = document.documentElement;
    const body = document.body;
    const colorMode = html.getAttribute("data-color-mode");
    if (colorMode === "dark") return "dark";
    if (colorMode === "light") return "light";

    // Check class names (GitHub uses .theme-dark or .dark)
    if (html.classList.contains("theme-dark") || html.classList.contains("dark") ||
        (body && (body.classList.contains("theme-dark") || body.classList.contains("dark")))) {
      return "dark";
    }

    const darkTheme = html.getAttribute("data-dark-theme");
    if (darkTheme && darkTheme.includes("dark")) {
      if (colorMode === "auto") {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
      } else {
        return "dark";
      }
    }

    // Computed style check as fallback
    try {
      if (body) {
        const bg = window.getComputedStyle(body).backgroundColor;
        const rgb = bg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const brightness = (parseInt(rgb[0], 10) * 299 + parseInt(rgb[1], 10) * 587 + parseInt(rgb[2], 10) * 114) / 1000;
          if (brightness < 128) return "dark";
        }
      }
    } catch { /* ignore computed style error */ }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateHostTheme() {
    const host = document.getElementById("sieve-workspace-host");
    if (host) host.setAttribute("data-theme", detectGitHubTheme());
  }

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
      .sieve-access-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: 10px;
        padding: 3px 10px;
        border-radius: 999px;
        border: 1px solid var(--color-border-default, rgba(110, 118, 129, 0.3));
        color: var(--color-fg-muted, #7d8590);
        font: 500 11.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        vertical-align: middle;
        cursor: help;
      }
      .sieve-access-chip::before {
        content: "";
        width: 6px; height: 6px; border-radius: 50%;
        background: #8D72B8;
      }
      .sieve-access-chip[data-status="error"]::before,
      .sieve-access-chip[data-status="account_mismatch"]::before,
      .sieve-access-chip[data-status="unauthenticated"]::before { background: #E8A33D; }
      .sieve-access-chip button {
        border: 0; background: transparent; padding: 0; cursor: pointer;
        color: #FF813A; font: inherit; font-weight: 600; text-decoration: underline;
      }
      html[data-color-mode="light"] .sieve-pr-pill {
        background: #171717;
        color: #FFFFFF;
        border: 1px solid #171717;
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  // ---------------------------------------------------------------- extension messaging
  // After the extension is reloaded or updated, this script keeps running in already-open tabs but
  // can no longer reach the extension. That is not an engine outage: the fix is refreshing the tab.
  function extensionAlive() {
    try { return Boolean(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }

  async function send(msg) {
    if (!extensionAlive()) {
      state.contextValid = false;
      diag("background_message_failed", { type: msg.type, error: "extension context invalidated" });
      return { ok: false, error: "Sieve was reloaded or updated. Refresh this tab to reconnect.", contextInvalid: true };
    }
    try {
      const res = await chrome.runtime.sendMessage(msg);
      if (!res || !res.ok) diag("background_message_failed", { type: msg.type, error: res?.error || "no response" });
      return res || { ok: false, error: "No response from the Sieve service worker." };
    } catch (err) {
      const invalid = /context invalidated/i.test(err.message || "");
      if (invalid) state.contextValid = false;
      diag("background_message_failed", { type: msg.type, error: invalid ? "extension context invalidated" : err.message });
      return {
        ok: false,
        error: invalid ? "Sieve was reloaded or updated. Refresh this tab to reconnect." : err.message,
        contextInvalid: invalid,
      };
    }
  }

  // ---------------------------------------------------------------- preferences
  function effectiveMode() {
    if (state.sessionMode) return state.sessionMode;
    if (state.storedMode) return state.storedMode;
    return state.autoOpen ? "sieve" : "native";
  }

  function loadPrefs() {
    return new Promise((resolve) => {
      if (!extensionAlive() || !chrome.storage?.local) return resolve();
      chrome.storage.local.get(["activeViewMode", "autoOpenSieve", "sieveEnabled", "sieveWelcomeShown"], (res) => {
        // First install has no value: Sieve is enabled by default. Only an explicit false disables it.
        state.enabled = res?.sieveEnabled !== false;
        state.welcomeShown = res?.sieveWelcomeShown === true;
        state.autoOpen = res?.autoOpenSieve !== false;
        state.storedMode = res?.activeViewMode === "native" || res?.activeViewMode === "sieve" ? res.activeViewMode : null;
        resolve();
      });
    });
  }

  if (extensionAlive() && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if ("sieveEnabled" in changes) {
        const nowEnabled = changes.sieveEnabled.newValue !== false;
        if (nowEnabled !== state.enabled) {
          if (nowEnabled) enableSieve(); else disableSieve();
        }
      }
      if ("sieveWelcomeShown" in changes) state.welcomeShown = changes.sieveWelcomeShown.newValue === true;
      if (!("autoOpenSieve" in changes) && !("activeViewMode" in changes)) return;
      if ("autoOpenSieve" in changes) state.autoOpen = changes.autoOpenSieve.newValue !== false;
      if ("activeViewMode" in changes) {
        const v = changes.activeViewMode.newValue;
        state.storedMode = v === "native" || v === "sieve" ? v : null;
      }
      diag("preference_changed", { autoOpen: state.autoOpen, storedMode: state.storedMode });
      schedule("preference");
    });
  }

  // ---------------------------------------------------------------- mounting primitives (idempotent)
  function ensureHost(nativeList) {
    let host = document.getElementById("sieve-workspace-host") || currentHost;
    if (!host) {
      host = document.createElement("div");
      host.id = "sieve-workspace-host";
      shadowRoot = host.attachShadow({ mode: "open" });
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("ui/workspace.css");
      shadowRoot.append(link);
    }
    shadowRoot = host.shadowRoot || shadowRoot;
    // Re-insert when GitHub's re-render removed it, or when the native list moved. Re-inserting the
    // same element keeps its Shadow DOM content, so a remount does not refetch anything.
    if (nativeList && host.nextElementSibling !== nativeList) {
      const wasConnected = host.isConnected;
      nativeList.before(host);
      if (wasConnected) diag("host_moved");
      else if (state.mounted) diag("remounted_after_dom_replacement");
    }
    currentHost = host;
    updateHostTheme();
    return shadowRoot;
  }

  function ensureSwitcher(subnav) {
    injectNativeSwitcherStyle();
    let switcher = subnav.querySelector(".sieve-native-switcher");
    if (!switcher) {
      document.querySelectorAll(".sieve-native-switcher").forEach((s) => s.remove()); // one switcher per page
      switcher = document.createElement("div");
      switcher.className = "sieve-native-switcher";
      switcher.setAttribute("role", "tablist");
      switcher.setAttribute("aria-label", "Pull request view mode");
      const nativeBtn = document.createElement("button");
      nativeBtn.type = "button";
      nativeBtn.className = "sieve-switch-native";
      nativeBtn.setAttribute("role", "tab");
      nativeBtn.textContent = "Native GitHub";
      const sieveBtn = document.createElement("button");
      sieveBtn.type = "button";
      sieveBtn.className = "sieve-switch-sieve";
      sieveBtn.setAttribute("role", "tab");
      sieveBtn.textContent = "Sieve Workspace";
      nativeBtn.addEventListener("click", () => chooseMode("native"));
      sieveBtn.addEventListener("click", () => chooseMode("sieve"));
      switcher.append(nativeBtn, sieveBtn);
      subnav.append(switcher);
    }
    const mode = effectiveMode();
    switcher.querySelector(".sieve-switch-native")?.setAttribute("aria-selected", String(mode === "native"));
    switcher.querySelector(".sieve-switch-sieve")?.setAttribute("aria-selected", String(mode === "sieve"));
  }

  function chooseMode(mode) {
    state.sessionMode = mode;
    diag("mode_selected", { mode });
    if (extensionAlive()) chrome.storage.local.set({ activeViewMode: mode });
    // Switching back to Sieve reuses already-loaded content; Clear Cache or navigation refreshes it.
    schedule("switcher", { intentional: mode === "sieve" });
  }

  function hideNative(el) {
    if (el.style.display !== "none") el.style.display = "none";
    state.hiddenLists.add(el);
  }

  function restoreNative() {
    state.hiddenLists.forEach((el) => { el.style.display = ""; });
    state.hiddenLists.clear();
  }

  // ---------------------------------------------------------------- reconcile
  let pendingOpts = {};
  function schedule(reason, opts = {}) {
    pendingOpts = { ...pendingOpts, ...opts };
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      const o = pendingOpts;
      pendingOpts = {};
      try {
        reconcile(reason, o);
      } catch (err) {
        state.mounted = false;
        diag("mount_failed", { route: state.routeCategory, error: err.message });
      }
    });
  }

  function reconcile(reason, opts) {
    if (!state.prefsReady || !state.enabled) return;
    if (!extensionAlive()) {
      if (state.contextValid) diag("extension_context_invalidated");
      state.contextValid = false;
      domObserver.disconnect();
      return;
    }
    const loc = window.SieveAdapter.parseGitHubLocation();
    const key = loc.type === "OTHER" ? "OTHER" : `${loc.type}:${loc.ref}`;
    if (key !== state.routeKey) {
      diag(state.routeKey ? "route_changed" : "route_detected", { route: loc.type, reason });
      leaveRoute();
      state.routeKey = key;
      state.routeCategory = loc.type;
    }
    if (loc.type !== "PULLS" && loc.type !== "PR_DETAIL") return removeAccessNotice();

    const access = accessGate.get(`${loc.owner}/${loc.repo}`, viewerLogin());
    if (access.status !== "granted") {
      withholdSieve();
      const anchor = loc.type === "PULLS" ? window.SieveAdapter.findSubnavContainer() : window.SieveAdapter.findPrTitleHeader();
      return renderAccessNotice(anchor, access);
    }
    removeAccessNotice();
    if (loc.type === "PULLS") reconcilePulls(loc, opts);
    else reconcilePrDetail(loc);
  }

  function leaveRoute() {
    if (state.mounted) diag("unmount_started", { route: state.routeCategory });
    if (currentHost) currentHost.style.display = "none";
    restoreNative();
    state.mounted = false;
    state.loadedKey = null;
    state.domReadyLogged = false;
    state.waitingLogged = false;
  }

  function waitForDom(route) {
    if (!state.waitingLogged) diag("dom_waiting", { route });
    state.waitingLogged = true;
    // Nothing else to do: the DOM observer schedules the next pass when GitHub renders.
  }

  function reconcilePulls(loc, opts) {
    const subnav = window.SieveAdapter.findSubnavContainer();
    const nativeList = window.SieveAdapter.findNativePullsList();
    if (!subnav || !nativeList) return waitForDom("PULLS");
    if (!state.domReadyLogged) diag("dom_ready", { route: "PULLS" });
    state.domReadyLogged = true;

    if (!state.mounted) diag("mount_started", { route: "PULLS" });
    ensureSwitcher(subnav);
    const shadow = ensureHost(nativeList);

    if (effectiveMode() === "sieve") {
      hideNative(nativeList);
      currentHost.style.display = "block";
      if (state.loadedKey !== loc.ref) {
        state.loadedKey = loc.ref; // set before the request so concurrent passes don't refetch
        const welcome = state.pendingActivation || !state.welcomeShown;
        state.pendingActivation = false;
        if (welcome) runActivation(loc, shadow);
        else loadCommandCenter(loc, shadow, opts);
      }
    } else {
      restoreNative();
      currentHost.style.display = "none";
    }
    if (!state.mounted) diag("mount_succeeded", { route: "PULLS", mode: effectiveMode() });
    state.mounted = true;
  }

  function reconcilePrDetail(loc) {
    const prHeader = window.SieveAdapter.findPrTitleHeader();
    if (!prHeader) return waitForDom("PR_DETAIL");
    if (!state.domReadyLogged) diag("pr_page_detected", { route: "PR_DETAIL" });
    state.domReadyLogged = true;
    injectNativeSwitcherStyle();
    if (!prHeader.querySelector(".sieve-pr-pill")) {
      document.querySelectorAll(".sieve-pr-pill").forEach((p) => p.remove()); // pill from a replaced header
      if (!state.mounted) diag("mount_started", { route: "PR_DETAIL" });
      mountPrPill(prHeader, loc);
      diag(state.mounted ? "remounted_after_dom_replacement" : "mount_succeeded", { route: "PR_DETAIL" });
    }

    // Explicit enable or first-run activation on single PR page
    const welcome = state.pendingActivation || (!state.welcomeShown && state.autoOpen);
    if (welcome && state.activation === "idle") {
      state.pendingActivation = false;
      const shadow = ensureHost(null);
      if (!currentHost.isConnected) document.body.append(currentHost);
      currentHost.style.display = "block";
      runActivation(loc, shadow);
    }

    state.mounted = true;
  }

  // Watches for GitHub rendering (or replacing) the elements Sieve attaches to. The callback only
  // schedules a coalesced pass; reconcile() mutations that re-trigger it end in a no-op pass.
  const domObserver = new MutationObserver(() => schedule("dom"));

  // The Command Center and error views replace the whole shadow tree; the activation overlay must
  // survive those swaps so it can show its result (or failure) on top.
  function replaceShadow(shadow, ...nodes) {
    const overlay = shadow.querySelector(".sieve-act-overlay");
    shadow.replaceChildren(...nodes);
    if (overlay) shadow.append(overlay);
  }

  // ---------------------------------------------------------------- master switch
  function teardownDom() {
    if (state.activationCtl) state.activationCtl.dismiss();
    state.activationCtl = null;
    restoreNative();
    document.querySelectorAll(".sieve-native-switcher, .sieve-pr-pill").forEach((el) => el.remove());
    if (currentHost) currentHost.remove(); // detached, not destroyed: re-enabling reuses it
    state.mounted = false;
    state.loadedKey = null;
    state.domReadyLogged = false;
    state.waitingLogged = false;
  }

  function disableSieve() {
    state.enabled = false;
    state.activationToken++; // abandon any in-flight activation or load
    state.activation = "idle";
    state.pendingActivation = false;
    domObserver.disconnect();
    teardownDom();
    removeAccessNotice();
    accessGate.reset(); // re-enabling verifies permission again
    diag("sieve_disabled");
  }

  function enableSieve() {
    state.enabled = true;
    // An explicit enable launches welcome activation in active tab on both PR lists and individual PRs
    const loc = window.SieveAdapter.parseGitHubLocation();
    state.pendingActivation = (loc.type === "PULLS" || loc.type === "PR_DETAIL") && document.visibilityState === "visible";
    if (state.pendingActivation && loc.type === "PULLS") state.sessionMode = "sieve";
    state.routeKey = null; // re-detect from scratch
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
    diag("sieve_enabled", { route: loc.type, welcome: state.pendingActivation });
    schedule("enabled");
  }

  // ---------------------------------------------------------------- welcome activation
  // Each step advances only when the real operation it names has finished.
  async function runActivation(loc, shadow) {
    const token = ++state.activationToken;
    const current = () => token === state.activationToken && state.enabled;
    state.activation = "running";
    diag("activation_started", { route: loc.type });

    // the workspace underneath starts as a skeleton; the overlay sits on top of it
    loadSkeleton(loc, shadow);
    const act = window.SieveActivation.start(shadow, {
      onRetry: () => {
        if (!state.enabled) return;
        diag("activation_retry");
        send({ type: "CLEAR_CACHE" });
        state.loadedKey = null;
        state.pendingActivation = true;
        schedule("activation_retry", { intentional: true });
      },
    });
    state.activationCtl = act;
    const code = (t) => { const c = document.createElement("code"); c.textContent = t; return c; };
    const fail = (stage, detail, title, why, help) => {
      if (!current()) return;
      act.stage(stage, "error", detail);
      act.fail(title, why, help);
      renderErrorState(shadow, why, /reloaded/i.test(why)); // what's left if the overlay is dismissed
      state.activation = "failed";
      state.loadedKey = null; // nothing is half-mounted: a retry starts clean
      diag("activation_failed", { stage, error: why });
    };

    // 1. GitHub: this page is github.com and its DOM is attached; report the browser session
    act.stage("github", "active");
    const access = accessGate.current();
    act.stage("github", "done", access?.status === "granted" ? `@${access.login} · ${access.permission} access verified` : "Signed in");

    // 2. Repository, from the URL GitHub is showing
    act.stage("repo", "active");
    if (!loc.owner || !loc.repo) return fail("repo", "Not found", "Couldn't detect a repository", "Open a repository's pull requests page and try again.");
    act.stage("repo", "done", loc.type === "PR_DETAIL" ? `${loc.owner}/${loc.repo}#${loc.number}` : loc.ref);

    // 3. Local engine: a fresh health check, not a cached one
    act.stage("engine", "active");
    const h = await send({ type: "CHECK_HEALTH", forceFresh: true });
    if (!current()) return;
    if (!h.ok) {
      return h.contextInvalid
        ? fail("engine", "Extension reloaded", "Refresh this tab", "Sieve was reloaded or updated after this page opened.")
        : fail("engine", "Not reachable", "The local Sieve Engine isn't running", h.error || "No response from 127.0.0.1:8787.", ["Start it with ", code("python3 -m sieve --serve"), " and press Retry."]);
    }
    const ghToken = h.data.github_auth ? "GitHub token active" : "no GitHub token · 60 requests/h";
    act.stage("engine", "done", `${h.data.model || "engine"} · ${ghToken}`);

    // 4. Repository / PR context
    act.stage("data", "active");
    if (loc.type === "PR_DETAIL") {
      const prRef = `${loc.owner}/${loc.repo}#${loc.number}`;
      const a = await send({ type: "GET_ANALYZE", pr: prRef, useModel: false });
      if (!current()) return;
      if (!a.ok) {
        return fail("data", "Unavailable", `Couldn't analyze PR #${loc.number}`, a.error || "The engine could not analyze this pull request.");
      }
      const fileCount = (a.data.files || []).length;
      act.stage("data", "done", `PR #${loc.number} · ${fileCount} file${fileCount === 1 ? "" : "s"} analyzed`);

      // 5. Workspace: reveal PR Intelligence drawer
      act.stage("workspace", "active");
      try {
        window.SievePRIntelligence.openDrawer(shadow, a.data);
      } catch (err) {
        return fail("workspace", "Render failed", "Couldn't open PR Intelligence", err.message);
      }
      act.stage("workspace", "done", "PR Intelligence ready");
    } else {
      const q = await send({ type: "GET_QUEUE", repo: loc.ref, forceFresh: true });
      if (!current()) return;
      if (!q.ok) {
        const rateLimited = /rate limit/i.test(q.error || "");
        return fail("data", rateLimited ? "GitHub rate limit" : "Unavailable",
          rateLimited ? "GitHub is rate-limiting the engine" : "Couldn't load this repository",
          q.error || "The engine could not read this repository from GitHub.",
          rateLimited ? ["Add ", code("GITHUB_TOKEN"), " to the engine's .env, restart it, then Retry."] : null);
      }
      const count = (q.data.rows || []).length;
      act.stage("data", "done", `${count} open pull request${count === 1 ? "" : "s"}`);

      // 5. Workspace: reveal Command Center
      act.stage("workspace", "active");
      try {
        renderCommandCenter(loc, shadow, q.data, healthFrom(h));
      } catch (err) {
        return fail("workspace", "Render failed", "Couldn't prepare the workspace", err.message);
      }
      act.stage("workspace", "done", "Command Center ready");
    }

    state.activation = "complete";
    state.activationCtl = null;
    if (!state.welcomeShown) {
      state.welcomeShown = true;
      chrome.storage.local.set({ sieveWelcomeShown: true });
    }
    diag("activation_complete", { route: loc.type });
    act.complete(); // shows "You're all set" briefly, then dissolves into the experience
  }

  function healthFrom(hRes) {
    if (!hRes.ok) return { connected: false, model: "offline" };
    return { connected: true, model: hRes.data.model || "none", latency_ms: hRes.data.latency_ms, ollama: hRes.data.ollama, github_auth: hRes.data.github_auth };
  }

  function renderCommandCenter(loc, shadow, queue, health) {
    const overlay = shadow.querySelector(".sieve-act-overlay");
    window.SieveCommandCenter.render(shadow, loc, queue, health, {
      onInspectPR: (prNumber) => openPRDrawer(loc, prNumber, shadow),
      onRefresh: () => { state.loadedKey = null; schedule("refresh", { intentional: true }); },
    });
    if (overlay) shadow.append(overlay); // render() replaces the shadow tree
    diag("workspace_rendered", { route: "PULLS" });
  }

  // ---------------------------------------------------------------- workspace content
  function loadSkeleton(loc, shadow) {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("ui/workspace.css");
    const skeleton = document.createElement("div");
    skeleton.className = "sieve-workspace";
    skeleton.innerHTML = `
      <div class="repo-header" style="padding: 24px;">
        <div class="repo-brand">
          <div class="repo-title-wrap">
            <h1 style="font-size:22px;"></h1>
            <p class="repo-meta" style="font-size:13px; color: var(--sieve-text-secondary, #777);">Scanning pull requests & AST blast radius…</p>
          </div>
        </div>
      </div>
    `;
    skeleton.querySelector("h1").textContent = `${loc.owner} / ${loc.repo}`;
    replaceShadow(shadow, styleLink, skeleton);
  }

  // Silent load (no welcome): refresh, restart, navigation, switcher.
  async function loadCommandCenter(loc, shadow, opts = {}) {
    const token = state.activationToken;
    loadSkeleton(loc, shadow);
    const hRes = await send({ type: "CHECK_HEALTH", forceFresh: Boolean(opts.intentional) });
    const qRes = await send({ type: "GET_QUEUE", repo: loc.ref, forceFresh: Boolean(opts.intentional) });
    if (state.loadedKey !== loc.ref || token !== state.activationToken || !state.enabled) return; // stale
    if (qRes.ok) {
      try {
        renderCommandCenter(loc, shadow, qRes.data, healthFrom(hRes));
      } catch (err) {
        diag("mount_failed", { route: "PULLS", error: err.message });
        renderErrorState(shadow, err.message);
      }
    } else {
      state.loadedKey = null; // allow a retry on the next explicit switch or navigation
      renderErrorState(shadow, qRes.error || "Could not retrieve repository queue.", qRes.contextInvalid);
    }
  }

  async function openPRDrawer(loc, prNumber, shadow) {
    const prRef = `${loc.owner}/${loc.repo}#${prNumber}`;
    const res = await send({ type: "GET_ANALYZE", pr: prRef, useModel: false });
    if (res.ok) window.SievePRIntelligence.openDrawer(shadow, res.data);
    else showToast(shadow, `Couldn't analyse ${prRef}: ${res.error || "unknown error"}`);
  }

  function showToast(shadow, text) {
    // Non-blocking replacement for alert(): alert() freezes the whole GitHub tab.
    shadow.querySelector(".sieve-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "sieve-toast";
    toast.setAttribute("role", "alert");
    toast.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;max-width:min(560px,90vw);padding:10px 16px;border-radius:10px;background:#161b22;color:#f0f6fc;border:1px solid #30363d;font:13px -apple-system,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)";
    toast.textContent = text;
    shadow.append(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  function mountPrPill(prHeader, loc) {
    const label = () => { pill.textContent = ""; const s = document.createElement("span"); s.textContent = "⚡"; pill.append(s, " Sieve Intelligence"); };
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "sieve-pr-pill";
    label();

    pill.onclick = async () => {
      pill.textContent = "Analyzing…";
      const prRef = `${loc.owner}/${loc.repo}#${loc.number}`;
      const shadow = ensureHost(null);
      if (!currentHost.isConnected) document.body.append(currentHost);
      currentHost.style.display = "block";
      const res = await send({ type: "GET_ANALYZE", pr: prRef, useModel: false });
      label();
      if (res.ok) window.SievePRIntelligence.openDrawer(shadow, res.data);
      else showToast(shadow, `Couldn't analyse this pull request: ${res.error || "unknown error"}`);
    };

    prHeader.append(pill);
  }

  function renderErrorState(shadow, errMsg, contextInvalid = false) {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("ui/workspace.css");

    const errBox = document.createElement("div");
    errBox.className = "sieve-workspace";
    errBox.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center;">
        <div class="empty-title" style="font-size: 18px; font-weight: 700; margin-top: 10px;"></div>
        <div class="empty-sub" style="font-size: 13px; color: var(--sieve-text-secondary, #777); margin-top: 6px;"></div>
        <p class="empty-hint" style="font-size: 12px; color: var(--sieve-text-muted, #999); margin-top: 12px;"></p>
      </div>
    `;
    errBox.querySelector(".empty-title").textContent = contextInvalid ? "Sieve needs this tab refreshed" : "Cannot connect to Sieve Intelligence Engine";
    errBox.querySelector(".empty-sub").textContent = errMsg; // engine error text: textContent, never HTML
    errBox.querySelector(".empty-hint").textContent = contextInvalid
      ? "The extension was reloaded or updated after this page opened."
      : "Run python3 -m sieve --serve on your machine to start the local engine.";
    replaceShadow(shadow, styleLink, errBox);
  }

  // ---------------------------------------------------------------- messages from popup / service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SIEVE_STATUS") {
      // Answered by this tab only: lets the popup report content-script and mount state honestly.
      sendResponse({
        present: true,
        enabled: state.enabled,
        activation: state.activation,
        route: state.routeCategory,
        supported: state.routeCategory === "PULLS" || state.routeCategory === "PR_DETAIL",
        mounted: state.mounted && (state.routeCategory !== "PULLS" || Boolean(currentHost?.isConnected)),
        mode: state.routeCategory === "PULLS" ? effectiveMode() : null,
        access: accessGate.current() && { status: accessGate.current().status, permission: accessGate.current().permission || null },
        autoOpen: state.autoOpen,
        prefsReady: state.prefsReady,
        contextValid: state.contextValid,
        events: events.slice(-25),
      });
      return false;
    }
    if (msg.type === "SIEVE_HEALTH_UPDATED") {
      const pill = currentHost?.shadowRoot?.querySelector(".sieve-engine-pill");
      if (pill) {
        pill.className = msg.ok ? "sieve-engine-pill" : "sieve-engine-pill offline";
        pill.textContent = "";
        const dot = document.createElement("span");
        dot.className = "dot";
        pill.append(dot, msg.ok ? ` Engine: ${msg.data?.model || "online"}` : " Engine: offline");
      }
    } else if (msg.type === "SIEVE_CACHE_CLEARED") {
      if (msg.access) { accessGate.refresh(); schedule("access_refresh"); }
      if (state.routeCategory === "PULLS" && effectiveMode() === "sieve") {
        state.loadedKey = null;
        schedule("cache_cleared", { intentional: true });
      }
    }
    return false;
  });

  // ---------------------------------------------------------------- start
  diag("content_script_started", { route: window.SieveAdapter.parseGitHubLocation().type });
  window.SieveAdapter.onPageChange(() => schedule("navigation"));
  loadPrefs().then(() => {
    state.prefsReady = true;
    diag("preference_loaded", { enabled: state.enabled, autoOpen: state.autoOpen, storedMode: state.storedMode });
    if (!state.enabled) return diag("sieve_disabled"); // no observers, no mounting until re-enabled
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
    schedule("initial");
  });
})();
