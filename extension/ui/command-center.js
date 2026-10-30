// Sieve Workspace — Maintainer Command Center Component
// Monochromatic Luxury Design Standard (media_1793397476309_ebda5710.jpg)
// Injected into GitHub pull requests page inside Shadow DOM.

window.SieveCommandCenter = (function () {
  "use strict";

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function render(shadowRoot, repoContext, queueData, engineStatus, callbacks = {}) {
    const rows = (queueData && queueData.rows) || [];
    let activeNav = "all"; // all, action_needed_you, waiting_on_contributor, blocked, bot_stream, merge_candidate, or usercol:name
    let searchQuery = "";
    let activeSort = "blast_desc";
    let selectedPR = rows[0] || null;
    let customCollections = {};

    // Load saved collections from storage
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get("sieveCollections", (res) => {
        if (res.sieveCollections && res.sieveCollections[repoContext.ref]) {
          customCollections = res.sieveCollections[repoContext.ref];
          renderCollections();
        }
      });
    }

    const appShell = el("div", { class: "sieve-app-shell" });
    const workspaceContainer = el("div", { class: "sieve-workspace-container" });

    // ---------------------------------------------------------------- SIDEBAR
    const sidebar = el("aside", { class: "sieve-sidebar" });
    const sidebarTop = el("div", { class: "sieve-sidebar-top" });

    // Brand
    const brand = el("div", { class: "sieve-brand" }, [
      el("div", { class: "sieve-brand-logo", text: "S" }),
      el("span", { class: "sieve-brand-title", text: "Sieve Workspace" })
    ]);

    // Navigation items
    const navGroupWorkspace = el("div", { class: "sieve-nav-group" });
    const wsHeading = el("div", { class: "sieve-nav-heading", text: "Workspace" });

    const countAll = rows.length;
    const countAction = rows.filter((r) => r.turn_status === "action_needed_you" && !r.is_bot).length;
    const countWaiting = rows.filter((r) => r.turn_status === "waiting_on_contributor").length;
    const countBlocked = rows.filter((r) => r.turn_status === "blocked" || r.draft).length;
    const countCollisions = rows.filter((r) => (r.collisions && r.collisions.length > 0) || (r.duplicate_fixes && r.duplicate_fixes.length > 0)).length;
    const countBots = rows.filter((r) => r.is_bot).length;
    const countMerge = rows.filter((r) => r.turn_status === "merge_candidate" && !r.is_bot).length;

    const navButtons = {};

    function makeNavItem(id, icon, label, count) {
      const btn = el("button", {
        type: "button",
        class: `sieve-nav-item ${activeNav === id ? "active" : ""}`,
        onclick: () => selectNav(id)
      }, [
        el("span", { class: "sieve-nav-icon", text: icon }),
        el("span", { text: label }),
        count !== undefined && count > 0 ? el("span", { class: "sieve-nav-count", text: String(count) }) : null
      ]);
      navButtons[id] = btn;
      return btn;
    }

    navGroupWorkspace.append(
      wsHeading,
      makeNavItem("all", "📂", "All Pull Requests", countAll),
      makeNavItem("action_needed_you", "📥", "Needs My Attention", countAction),
      makeNavItem("waiting_on_contributor", "⏳", "Waiting on Author", countWaiting),
      makeNavItem("blocked", "⚠️", "Blocked & Conflicts", countBlocked),
      makeNavItem("collisions", "🔀", "Overlapping & Dups", countCollisions),
      makeNavItem("bot_stream", "🤖", "Bot PR Stream", countBots),
      makeNavItem("merge_candidate", "✅", "Merge Candidates", countMerge)
    );

    // Custom Collections Group
    const navGroupCollections = el("div", { class: "sieve-nav-group", style: "margin-top: 10px;" });
    const collHeading = el("div", { class: "sieve-nav-heading", text: "Collections" });
    const collListContainer = el("div", { style: "display: flex; flex-direction: column; gap: 4px;" });

    function renderCollections() {
      collListContainer.replaceChildren();
      const keys = Object.keys(customCollections);
      if (!keys.length) {
        // default empty items for inspiration
        ["Security Review", "Release Candidates", "Documentation"].forEach((colName) => {
          const item = el("button", {
            type: "button",
            class: `sieve-nav-item ${activeNav === `usercol:${colName}` ? "active" : ""}`,
            onclick: () => selectNav(`usercol:${colName}`)
          }, [
            el("span", { class: "sieve-nav-icon", text: colName.includes("Security") ? "🔒" : colName.includes("Release") ? "🚀" : "📄" }),
            el("span", { text: colName })
          ]);
          collListContainer.append(item);
        });
      } else {
        keys.forEach((colName) => {
          const prs = customCollections[colName].prNumbers || [];
          const item = el("button", {
            type: "button",
            class: `sieve-nav-item ${activeNav === `usercol:${colName}` ? "active" : ""}`,
            onclick: () => selectNav(`usercol:${colName}`)
          }, [
            el("span", { class: "sieve-nav-icon", text: "📁" }),
            el("span", { text: colName }),
            prs.length > 0 ? el("span", { class: "sieve-nav-count", text: String(prs.length) }) : null
          ]);
          collListContainer.append(item);
        });
      }
    }
    renderCollections();

    const addColBtn = el("button", {
      type: "button",
      class: "btn-add-collection",
      style: "font-size: 12px; color: var(--sieve-text-muted); padding: 6px 14px; text-align: left; cursor: pointer;",
      text: "+ New Collection",
      onclick: () => {
        const name = prompt("Enter new collection name:");
        if (name && name.trim()) {
          customCollections[name.trim()] = { prNumbers: [] };
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get("sieveCollections", (res) => {
              const sc = res.sieveCollections || {};
              sc[repoContext.ref] = customCollections;
              chrome.storage.local.set({ sieveCollections: sc });
            });
          }
          renderCollections();
        }
      }
    });

    navGroupCollections.append(collHeading, collListContainer, addColBtn);
    sidebarTop.append(brand, navGroupWorkspace, navGroupCollections);

    // Profile Pill (Lucas Morel reference style)
    const profilePill = el("div", { class: "sieve-sidebar-profile" }, [
      el("img", {
        class: "sieve-profile-avatar",
        src: `https://github.com/${repoContext.owner}.png?size=64`,
        alt: repoContext.owner,
        onerror: (e) => { e.target.style.display = "none"; }
      }),
      el("div", { class: "sieve-profile-info" }, [
        el("div", { class: "sieve-profile-name", text: `@${repoContext.owner}` }),
        el("div", { class: "sieve-profile-role", text: "Maintainer" })
      ])
    ]);

    sidebar.append(sidebarTop, profilePill);

    // ---------------------------------------------------------------- MAIN PANE
    const mainPane = el("main", { class: "sieve-main" });

    // 1. Top Bar
    const topBar = el("div", { class: "sieve-topbar" });
    const topBarLeft = el("div", { class: "sieve-topbar-left" }, [
      el("h1", { class: "sieve-topbar-title" }, [
        el("span", { text: "Pull Requests" }),
        el("span", { style: "font-size: 15px; font-weight: 400; color: var(--sieve-text-muted);", text: `· ${repoContext.owner} / ${repoContext.repo}` })
      ]),
      el("div", { class: "sieve-topbar-meta", text: `Review Queue · ${rows.length} open contributions` })
    ]);

    const segButtons = {
      all: el("button", { type: "button", class: "sieve-segmented-btn active", text: "Overview", onclick: () => selectNav("all") }),
      action_needed_you: el("button", { type: "button", class: "sieve-segmented-btn", text: "Attention", onclick: () => selectNav("action_needed_you") }),
      waiting_on_contributor: el("button", { type: "button", class: "sieve-segmented-btn", text: "Waiting", onclick: () => selectNav("waiting_on_contributor") }),
      blocked: el("button", { type: "button", class: "sieve-segmented-btn", text: "Blocked", onclick: () => selectNav("blocked") })
    };

    const segmentedFilter = el("div", { class: "sieve-segmented-control" }, [
      segButtons.all,
      segButtons.action_needed_you,
      segButtons.waiting_on_contributor,
      segButtons.blocked
    ]);

    const searchPill = el("div", { class: "sieve-search-pill" }, [
      el("span", { text: "🔍", style: "font-size: 11px; opacity: 0.6;" }),
      el("input", {
        type: "search",
        placeholder: "Search author, title, #...",
        oninput: (e) => {
          searchQuery = e.target.value.toLowerCase();
          renderCards();
        }
      })
    ]);

    const isConnected = engineStatus && engineStatus.connected;
    const modelText = isConnected ? (engineStatus.model || "online") : "offline";
    const enginePill = el("div", {
      class: `sieve-engine-pill ${isConnected ? "" : "offline"}`,
      title: "Sieve Engine running on http://127.0.0.1:8787"
    }, [
      el("span", { class: "dot" }),
      el("span", { text: `Engine: ${modelText}` })
    ]);

    const topBarControls = el("div", { class: "sieve-topbar-controls" }, [
      segmentedFilter,
      searchPill,
      enginePill
    ]);

    topBar.append(topBarLeft, topBarControls);

    // 2. Top Grid: Attention KPI Strip + High-Contrast Spotlight Card
    const topGrid = el("div", { class: "sieve-top-grid" });

    // KPI Strip
    const kpiStrip = el("div", { class: "sieve-kpi-strip" });
    const kpiCards = {};
    const kpis = [
      { id: "action_needed_you", title: "Action Needed", val: countAction, sub: "Waiting on maintainer" },
      { id: "waiting_on_contributor", title: "Waiting on Author", val: countWaiting, sub: "Changes requested" },
      { id: "collisions", title: "Overlapping Fixes", val: countCollisions, sub: "File or issue collisions" },
      { id: "merge_candidate", title: "Merge Candidates", val: countMerge, sub: "Passing checks & approved" }
    ];

    kpis.forEach((k) => {
      const card = el("div", {
        class: `sieve-kpi-card ${activeNav === k.id ? "active" : ""}`,
        onclick: () => selectNav(k.id)
      }, [
        el("div", { class: "sieve-kpi-head" }, [
          el("span", { class: "sieve-kpi-title", text: k.title }),
          el("span", { class: "sieve-kpi-icon", text: "↗" })
        ]),
        el("div", { class: "sieve-kpi-body" }, [
          el("span", { class: "sieve-kpi-value", text: String(k.val) }),
          el("svg", { class: "sieve-sparkline", viewBox: "0 0 72 24" }, [
            el("path", { d: "M2 18 C 16 4, 32 20, 48 10 S 64 6, 70 8" })
          ])
        ]),
        el("div", { class: "sieve-kpi-sub", text: k.sub })
      ]);
      kpiCards[k.id] = card;
      kpiStrip.append(card);
    });

    // High-Contrast Pitch-Black Spotlight Card
    const spotlightCard = el("div", { class: "sieve-spotlight-card" });

    function updateSpotlight(pr) {
      spotlightCard.replaceChildren();
      if (!pr) {
        spotlightCard.append(
          el("div", { class: "sieve-spotlight-head" }, [
            el("span", { class: "sieve-spotlight-badge", text: "Spotlight" })
          ]),
          el("div", { class: "sieve-spotlight-body" }, [
            el("div", { class: "sieve-spotlight-pr-title", text: "No Pull Request Selected" }),
            el("div", { class: "sieve-spotlight-pr-meta", text: rows.length ? "Select a pull request from the queue to inspect impact." : "No open pull requests in this repository." })
          ])
        );
        return;
      }

      const impactSum = pr.impact_summary || {};
      const dependentsCount = impactSum.direct_dependents ?? 0;
      const testsCount = impactSum.related_test_files ?? 0;

      const head = el("div", { class: "sieve-spotlight-head" }, [
        el("span", { class: "sieve-spotlight-badge", text: `PR #${pr.number} Spotlight` }),
        el("button", {
          type: "button",
          class: "sieve-spotlight-action",
          text: "⚡ Deep Inspect →",
          onclick: () => callbacks.onInspectPR?.(pr.number)
        })
      ]);

      const body = el("div", { class: "sieve-spotlight-body" }, [
        el("div", { class: "sieve-spotlight-pr-title", text: pr.title }),
        el("div", { class: "sieve-spotlight-pr-meta", text: `By @${pr.author} · Score: ${pr.score ?? 0}/100 (${(pr.verdict || "ready").replace("-", " ")})` }),
        el("div", { class: "sieve-spotlight-stats" }, [
          el("div", { class: "sieve-spotlight-stat-item" }, [
            el("span", { class: "sieve-spotlight-stat-label", text: "Dependents" }),
            el("span", { class: "sieve-spotlight-stat-val", text: `+${dependentsCount}` })
          ]),
          el("div", { class: "sieve-spotlight-stat-item" }, [
            el("span", { class: "sieve-spotlight-stat-label", text: "Test Files" }),
            el("span", { class: "sieve-spotlight-stat-val", text: String(testsCount) })
          ]),
          el("div", { class: "sieve-spotlight-stat-item" }, [
            el("span", { class: "sieve-spotlight-stat-label", text: "Diff Size" }),
            el("span", { class: "sieve-spotlight-stat-val", text: `+${pr.additions ?? 0} / -${pr.deletions ?? 0}` })
          ])
        ])
      ]);

      const foot = el("div", { class: "sieve-spotlight-foot" }, [
        el("div", { class: "sieve-spotlight-author-wrap" }, [
          pr.author_avatar ? el("img", {
            class: "sieve-spotlight-author-avatar",
            src: pr.author_avatar,
            onerror: (e) => { e.target.style.display = "none"; }
          }) : null,
          el("span", { class: "sieve-spotlight-author-name", text: `@${pr.author}` })
        ]),
        el("span", { style: "font-size: 11px; opacity: 0.6; font-family: var(--sieve-font-mono);", text: pr.turn_status?.replace(/_/g, " ") || "ready" })
      ]);

      spotlightCard.append(head, body, foot);
    }
    updateSpotlight(selectedPR);

    topGrid.append(kpiStrip, spotlightCard);

    // 3. Queue List Section
    const queueSection = el("section", { class: "sieve-queue-section" });
    const queueHeader = el("div", { class: "sieve-queue-header" }, [
      el("div", { class: "sieve-queue-title" }, [
        el("span", { text: "Review Queue Stream" }),
        el("span", { class: "sieve-queue-count", text: `(${rows.length} total)` })
      ]),
      el("select", {
        class: "sieve-queue-sort",
        onchange: (e) => {
          activeSort = e.target.value;
          renderCards();
        }
      }, [
        el("option", { value: "blast_desc", text: "Sort: Blast Radius (High to Low)" }),
        el("option", { value: "score_desc", text: "Sort: Sieve Score (High to Low)" }),
        el("option", { value: "num_desc", text: "Sort: Newest First (# Number)" })
      ])
    ]);

    const cardsContainer = el("div", { style: "display: flex; flex-direction: column; gap: 12px;" });

    function renderCards() {
      cardsContainer.replaceChildren();

      // If repository has zero PRs at all
      if (!rows.length) {
        cardsContainer.append(
          el("div", { class: "sieve-empty-state", style: "padding: 60px 20px; text-align: center;" }, [
            el("div", { class: "sieve-empty-icon", style: "font-size: 36px; margin-bottom: 12px;", text: "✨" }),
            el("div", { class: "sieve-empty-title", style: "font-size: 18px; font-weight: 700;", text: "All Clear — No Open Pull Requests" }),
            el("div", { class: "sieve-empty-sub", style: "font-size: 13px; color: var(--sieve-text-secondary); max-width: 440px; margin: 8px auto 0;", text: `There are no open contributions in ${repoContext.owner}/${repoContext.repo}. When a contributor submits a PR, Sieve will automatically map its AST blast radius and verify claims.` })
          ])
        );
        return;
      }

      // Filter by navigation
      let filtered = rows.filter((r) => {
        if (activeNav === "all") return true;
        if (activeNav === "action_needed_you") return r.turn_status === "action_needed_you" && !r.is_bot;
        if (activeNav === "waiting_on_contributor") return r.turn_status === "waiting_on_contributor";
        if (activeNav === "blocked") return r.turn_status === "blocked" || r.draft;
        if (activeNav === "collisions") return (r.collisions && r.collisions.length > 0) || (r.duplicate_fixes && r.duplicate_fixes.length > 0);
        if (activeNav === "bot_stream") return r.is_bot;
        if (activeNav === "merge_candidate") return r.turn_status === "merge_candidate" && !r.is_bot;
        if (activeNav.startsWith("usercol:")) {
          const colName = activeNav.replace("usercol:", "");
          const colPrs = (customCollections[colName] && customCollections[colName].prNumbers) || [];
          return colPrs.includes(r.number);
        }
        return true;
      });

      // Search query
      if (searchQuery) {
        filtered = filtered.filter((r) =>
          r.title?.toLowerCase().includes(searchQuery) ||
          r.author?.toLowerCase().includes(searchQuery) ||
          String(r.number).includes(searchQuery)
        );
      }

      // Sort
      if (activeSort === "blast_desc") {
        filtered.sort((a, b) => ((b.impact_summary || {}).direct_dependents || 0) - ((a.impact_summary || {}).direct_dependents || 0));
      } else if (activeSort === "score_desc") {
        filtered.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      } else if (activeSort === "num_desc") {
        filtered.sort((a, b) => b.number - a.number);
      }

      if (!filtered.length) {
        cardsContainer.append(
          el("div", { class: "sieve-empty-state", style: "padding: 40px 20px; text-align: center;" }, [
            el("div", { class: "sieve-empty-icon", style: "font-size: 28px; margin-bottom: 8px;", text: "📂" }),
            el("div", { class: "sieve-empty-title", style: "font-size: 15px; font-weight: 600;", text: "No pull requests match this filter" }),
            el("div", { class: "sieve-empty-sub", style: "font-size: 12.5px; color: var(--sieve-text-secondary); margin-top: 4px;", text: "Try selecting a different view from the sidebar or clear search filters." })
          ])
        );
        return;
      }

      filtered.forEach((pr) => {
        const isSelected = selectedPR && selectedPR.number === pr.number;
        const impactSum = pr.impact_summary || {};
        const depCount = impactSum.direct_dependents ?? 0;
        const testCount = impactSum.related_test_files ?? 0;

        const card = el("article", {
          class: `sieve-pr-card ${isSelected ? "selected" : ""}`,
          onclick: () => {
            selectedPR = pr;
            updateSpotlight(pr);
            renderCards();
          }
        });

        // Head: Title & Score
        const head = el("div", { class: "sieve-pr-card-head" }, [
          el("div", { class: "sieve-pr-title-group" }, [
            el("span", { class: "sieve-pr-num", text: `#${pr.number}` }),
            el("h3", { class: "sieve-pr-title", text: pr.title })
          ]),
          el("div", {
            class: `sieve-pr-score-badge ${pr.verdict || "ready"}`,
            text: `${pr.score ?? 0} ${pr.verdict ? pr.verdict.replace("-", " ") : "ready"}`
          })
        ]);

        // Collision Banner (if overlapping files or duplicate issues detected)
        let collisionBanner = null;
        if (pr.collisions && pr.collisions.length > 0) {
          const conflicting = pr.collisions.map((c) => `#${c.with_pr}`).join(", ");
          collisionBanner = el("div", { class: "sieve-collision-banner" }, [
            el("span", { text: "⚠️" }),
            el("span", { text: `File Collision: Edits overlapping files with ${conflicting}` })
          ]);
        } else if (pr.duplicate_fixes && pr.duplicate_fixes.length > 0) {
          const dupes = pr.duplicate_fixes.map((d) => `#${d.with_pr}`).join(", ");
          collisionBanner = el("div", { class: "sieve-collision-banner" }, [
            el("span", { text: "🔀" }),
            el("span", { text: `Competing Fix: Resolves same issue as ${dupes}` })
          ]);
        }

        // Meta Row
        const metaRow = el("div", { class: "sieve-pr-meta-row" }, [
          el("div", { class: "sieve-pr-author-wrap" }, [
            pr.author_avatar ? el("img", {
              class: "sieve-pr-author-avatar",
              src: pr.author_avatar,
              onerror: (e) => { e.target.style.display = "none"; }
            }) : null,
            el("span", { text: `@${pr.author}` })
          ]),
          el("span", { style: "font-family: var(--sieve-font-mono); font-size: 11px; opacity: 0.6;", text: `+${pr.additions ?? 0} / -${pr.deletions ?? 0}` }),
          el("div", { class: "sieve-chips-wrap" }, [
            depCount > 0
              ? el("span", { class: "sieve-chip", text: `+${depCount} dependents` })
              : el("span", { class: "sieve-chip pass", text: "isolated change" }),
            testCount > 0
              ? el("span", { class: "sieve-chip pass", text: `✓ ${testCount} tests` })
              : el("span", { class: "sieve-chip warn", text: "No tests" }),
            el("span", { class: "sieve-chip", text: pr.turn_status?.replace(/_/g, " ") || "ready" })
          ])
        ]);

        // Action Buttons
        const copyBtn = el("button", {
          type: "button",
          class: "btn-sieve secondary",
          text: "📋 Copy Response",
          onclick: (e) => {
            e.stopPropagation();
            const responseText = `Thanks @${pr.author} for the contribution! Checked the AST impact: ${depCount} dependents affected, ${testCount} tests linked.`;
            navigator.clipboard.writeText(responseText).then(() => {
              copyBtn.textContent = "Copied ✓";
              setTimeout(() => { copyBtn.textContent = "📋 Copy Response"; }, 2000);
            }).catch(() => {
              copyBtn.textContent = "Copied ✓";
              setTimeout(() => { copyBtn.textContent = "📋 Copy Response"; }, 2000);
            });
          }
        });

        const actions = el("div", { class: "sieve-pr-actions" }, [
          el("button", {
            type: "button",
            class: "btn-sieve primary",
            text: "⚡ Inspect Topology",
            onclick: (e) => {
              e.stopPropagation();
              callbacks.onInspectPR?.(pr.number);
            }
          }),
          copyBtn,
          el("a", {
            class: "btn-sieve secondary",
            href: pr.url,
            target: "_blank",
            rel: "noopener",
            text: "Open on GitHub ↗",
            onclick: (e) => e.stopPropagation()
          })
        ]);

        card.append(head);
        if (collisionBanner) card.append(collisionBanner);
        card.append(metaRow, actions);
        cardsContainer.append(card);
      });
    }

    function selectNav(id) {
      activeNav = id;

      // Update sidebar nav buttons
      Object.keys(navButtons).forEach((k) => {
        if (navButtons[k]) {
          navButtons[k].className = `sieve-nav-item ${k === id ? "active" : ""}`;
        }
      });

      // Update segmented top buttons
      Object.keys(segButtons).forEach((k) => {
        if (segButtons[k]) {
          segButtons[k].className = `sieve-segmented-btn ${k === id ? "active" : ""}`;
        }
      });

      // Update KPI strip active card
      Object.keys(kpiCards).forEach((k) => {
        if (kpiCards[k]) {
          kpiCards[k].className = `sieve-kpi-card ${k === id ? "active" : ""}`;
        }
      });

      renderCards();
    }

    renderCards();
    queueSection.append(queueHeader, cardsContainer);

    // 4. Floating Action Pill Bar
    const floatingBar = el("div", {
      class: "sieve-floating-pill-bar",
      onclick: () => {
        selectNav("action_needed_you");
        queueSection.scrollIntoView({ behavior: "smooth" });
      }
    }, [
      el("div", { class: "sieve-floating-pill-icon", text: "⚡" }),
      el("span", { class: "sieve-floating-pill-text", text: `Sieve Intelligence Active · ${countAction} PRs require maintainer attention` })
    ]);

    mainPane.append(topBar, topGrid, queueSection, floatingBar);
    workspaceContainer.append(sidebar, mainPane);
    appShell.append(workspaceContainer);

    const styleLink = el("link", { rel: "stylesheet", href: chrome.runtime.getURL("ui/workspace.css") });
    shadowRoot.replaceChildren(styleLink, appShell);
  }

  return { render };
})();
