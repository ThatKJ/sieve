// Sieve Workspace — GitHub Page Adapter
// Handles GitHub Turbo / PJAX client-side navigation lifecycle and selector isolation.

(function () {
  "use strict";

  // URL pattern matchers
  // Matches /owner/repo/pulls or /owner/repo/pulls/...
  const PULLS_RE = /^\/([^/]+)\/([^/]+)\/pulls(?:\/.*)?$/;
  // Matches /owner/repo/pull/123 or /owner/repo/pull/123/...
  const PR_DETAIL_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/;
  // Matches /owner/repo or /owner/repo/...
  const REPO_RE = /^\/([^/]+)\/([^/]+)(?:\/.*)?$/;

  const RESERVED_NAMES = new Set([
    "settings", "notifications", "explore", "trending", "stars",
    "marketplace", "issues", "pulls", "discussions", "orgs", "new"
  ]);

  function parseGitHubLocation() {
    const path = window.location.pathname;
    const pullsMatch = path.match(PULLS_RE);
    if (pullsMatch && !RESERVED_NAMES.has(pullsMatch[1])) {
      return {
        type: "PULLS",
        owner: pullsMatch[1],
        repo: pullsMatch[2],
        ref: `${pullsMatch[1]}/${pullsMatch[2]}`
      };
    }

    const prMatch = path.match(PR_DETAIL_RE);
    if (prMatch && !RESERVED_NAMES.has(prMatch[1])) {
      return {
        type: "PR_DETAIL",
        owner: prMatch[1],
        repo: prMatch[2],
        number: parseInt(prMatch[3], 10),
        ref: `${prMatch[1]}/${prMatch[2]}#${prMatch[3]}`
      };
    }

    const repoMatch = path.match(REPO_RE);
    if (repoMatch && !RESERVED_NAMES.has(repoMatch[1])) {
      return {
        type: "REPO_ROOT",
        owner: repoMatch[1],
        repo: repoMatch[2],
        ref: `${repoMatch[1]}/${repoMatch[2]}`
      };
    }

    return { type: "OTHER" };
  }

  function findSubnavContainer() {
    // 1. Modern GitHub React header container
    const h1 = document.querySelector('[data-testid="header-title"]') ||
               Array.from(document.querySelectorAll('h1')).find((h) => h.textContent.includes('pull requests') || h.textContent.includes('Pull requests'));
    if (h1 && h1.parentElement) {
      return h1.parentElement;
    }

    // 2. Standard GitHub subnav / toolbar
    return (
      document.querySelector("div.subnav") ||
      document.querySelector("nav.subnav-links") ||
      document.querySelector("#repo-content-turbo-frame .subnav") ||
      document.querySelector("div[data-view-component='true'].subnav") ||
      document.querySelector(".pr-filter-container") ||
      document.querySelector("nav[aria-label='Pull Requests']") ||
      document.querySelector("div.Box-header")
    );
  }

  function findNativePullsList() {
    // 1. Modern GitHub React PageLayoutContent
    const modern = document.querySelector('[class*="PageLayoutContent"]');
    if (modern) return modern;

    // 2. Standard GitHub legacy check-all container
    const legacy = document.querySelector("div.js-check-all-container") ||
                   document.querySelector("#js-issues-toolbar")?.parentElement;
    if (legacy) return legacy;

    // 3. Fallback to common issue/pull lists
    return (
      document.querySelector("div[aria-label='Issues'][role='group']") ||
      document.querySelector(".js-navigation-container") ||
      document.querySelector("react-app > div > div:last-child")
    );
  }

  function findPrTitleHeader() {
    // 1. Modern GitHub React PageHeader title container
    const modern = document.querySelector('[class*="PageHeader-TitleArea"]') ||
                   document.querySelector('[class*="titleWithAction"]') ||
                   document.querySelector('h1[class*="inlineTitle"]')?.parentElement;
    if (modern) return modern;

    // 2. Legacy GitHub PR header
    return (
      document.querySelector(".gh-header-actions") ||
      document.querySelector("#partial-discussion-header .TableObject-item--primary") ||
      document.querySelector(".gh-header-meta")
    );
  }

  // Event dispatcher for SPA navigation
  const listeners = [];
  function notifyChange() {
    const ctx = parseGitHubLocation();
    listeners.forEach((fn) => {
      try {
        fn(ctx);
      } catch (err) {
        console.error("[Sieve Workspace] Listener error:", err);
      }
    });
  }

  // Navigation signals. Content scripts run in an isolated world, so patching history.pushState here
  // would only wrap the extension's copy: GitHub's own pushState calls would never reach it.
  // These are DOM-level events, which are delivered to the isolated world too. The content script
  // coalesces bursts, re-reads the URL itself, and also watches the DOM, so a navigation that
  // fires none of these is still picked up.
  document.addEventListener("turbo:load", notifyChange);
  document.addEventListener("turbo:render", notifyChange);
  document.addEventListener("pjax:end", notifyChange);
  window.addEventListener("popstate", notifyChange);
  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("navigatesuccess", notifyChange); // Navigation API (Chrome 102+)
  }

  window.SieveAdapter = {
    parseGitHubLocation,
    findSubnavContainer,
    findNativePullsList,
    findPrTitleHeader,
    onPageChange: (fn) => listeners.push(fn)
  };
})();
