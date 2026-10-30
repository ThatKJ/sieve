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
    let activeNav = "all"; // all, action_needed_you, waiting_on_contributor, blocked, bot_stream, merge_candidate, or collection:name
    let searchQuery = "";
    let activeSort = "blast_desc";
    let selectedPR = rows[0] || null;
    let customCollections = {};

    // Load saved collections from storage
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get("sieveCollections", (res) => {
        if (res.sieveCollections && res.sieveCollections[repoContext.ref]) {
          customCollections = res.sieveCollections[repoContext.ref];
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

    // Nav Group: Workspace
    const navGroupWorkspace = el("div", { class: "sieve-nav-group" });
    navGroupWorkspace.append(el("div", { class: "sieve-nav-heading", text: "Workspace" }));

    // Count helpers
    const countAction = rows.filter((r) => r.turn_status === "action_needed_you" && !r.is_bot).length;
    const countWaiting = rows.filter((r) => r.turn_status === "waiting_on_contributor").length;
    const countBlocked = rows.filter((r) => r.turn_status === "blocked" || r.draft).length;
    const countCollisions = rows.filter((r) => (r.collisions && r.collisions.length > 0) || (r.duplicate_fixes && r.duplicate_fixes.length > 0)).length;
    const countBots = rows.filter((r) => r.is_bot).length;
    const countMerge = rows.filter((r) => r.turn_status === "merge_candidate" && !r.is_bot).length;

    const navItems = [
      { id: "all", label: "All Pull Requests", icon: "📂", count: rows.length },
      { id: "action_needed_you", label: "Needs My Attention", icon: "📥", count: countAction },
      { id: "waiting_on_contributor", label: "Waiting on Author", icon: "⏳", count: countWaiting },
      { id: "blocked", label: "Blocked & Conflicts", icon: "⚠️", count: countBlocked },
      { id: "collisions", label: "Overlapping & Dups", icon: "🔀", count: countCollisions },
      { id: "bot_stream", label: "Bot PR Stream", icon: "🤖", count: countBots },
      { id: "merge_candidate", label: "Merge Candidates", icon: "✅", count: countMerge }
    ];

    const navButtons = {};
    navItems.forEach((item) => {
      const btn = el("button", {
        type: "button",
        class: `sieve-nav-item ${activeNav === item.id ? "active" : ""}`,
        onclick: () => selectNav(item.id)
      }, [
        el("span", { class: "sieve-nav-icon", text: item.icon }),
        el("span", { text: item.label }),
        item.count > 0 ? el("span", { class: "sieve-nav-count", text: String(item.count) }) : null
      ]);
      navButtons[item.id] = btn;
      navGroupWorkspace.append(btn);
    });

    // Nav Group: Collections
    const navGroupCollections = el("div", { class: "sieve-nav-group" });
    const collHeading = el("div", { class: "sieve-nav-heading", text: "Collections" });
    const collListContainer = el("div", { class: "sieve-nav-group" });

    function renderCollections() {
      collListContainer.replaceChildren();
      const standardCollections = [
        { id: "col:security", label: "Security Review", icon: "🔒" },
        { id: "col:release", label: "Release Candidates", icon: "🚀" },
        { id: "col:docs", label: "Documentation", icon: "📄" }
      ];

      standardCollections.forEach((c) => {
        const btn = el("button", {
          type: "button",
          class: `sieve-nav-item ${activeNav === c.id ? "active" : ""}`,
          onclick: () => selectNav(c.id)
        }, [
          el("span", { class: "sieve-nav-icon", text: c.icon }),
          el("span", { text: c.label })
        ]);
        collListContainer.append(btn);
      });

      // User collections
      Object.keys(customCollections).forEach((name) => {
        const btn = el("button", {
          type: "button",
          class: `sieve-nav-item ${activeNav === `usercol:${name}` ? "active" : ""}`,
          onclick: () => selectNav(`usercol:${name}`)
        }, [
          el("span", { class: "sieve-nav-icon", text: "📁" }),
          el("span", { text: name }),
          el("button", {
            type: "button",
            style: "margin-left: auto; color: #a19f9a; font-size: 11px;",
            text: "×",
            title: "Delete collection",
            onclick: (e) => {
              e.stopPropagation();
              delete customCollections[name];
              if (chrome.storage && chrome.storage.local) {
                chrome.storage.local.get("sieveCollections", (res) => {
                  const sc = res.sieveCollections || {};
                  sc[repoContext.ref] = customCollections;
                  chrome.storage.local.set({ sieveCollections: sc });
                });
              }
              renderCollections();
              if (activeNav === `usercol:${name}`) selectNav("all");
            }
          })
        ]);
        collListContainer.append(btn);
      });
    }
    renderCollections();

    const addColBtn = el("button", {
      type: "button",
      class: "btn-add-collection",
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
        alt: repoContext.owner
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
        el("span", { style: "font-size: 16px; font-weight: 400; color: #a19f9a;", text: `· ${repoContext.owner} / ${repoContext.repo}` })
      ]),
      el("div", { class: "sieve-topbar-meta", text: `Review Queue · ${rows.length} open contributions` })
    ]);

    const segmentedFilter = el("div", { class: "sieve-segmented-control" }, [
      el("button", { type: "button", class: "sieve-segmented-btn active", text: "Overview", onclick: () => selectNav("all") }),
      el("button", { type: "button", class: "sieve-segmented-btn", text: "Attention", onclick: () => selectNav("action_needed_you") }),
      el("button", { type: "button", class: "sieve-segmented-btn", text: "Waiting", onclick: () => selectNav("waiting_on_contributor") }),
      el("button", { type: "button", class: "sieve-segmented-btn", text: "Blocked", onclick: () => selectNav("blocked") })
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

    const enginePill = el("div", {
      class: `sieve-engine-pill ${engineStatus.connected ? "" : "offline"}`,
      title: "Sieve Engine running on http://127.0.0.1:8787"
    }, [
      el("span", { class: "dot" }),
      el("span", { text: engineStatus.connected ? `Engine: ${engineStatus.model}` : "Engine: Offline" })
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
    const kpis = [
      { id: "action_needed_you", title: "Action Needed", val: countAction, sub: "Waiting on maintainer", active: false },
      { id: "waiting_on_contributor", title: "Waiting on Author", val: countWaiting, sub: "Changes requested", active: false },
      { id: "collisions", title: "Overlapping Fixes", val: countCollisions, sub: "File or issue collisions", active: false },
      { id: "merge_candidate", title: "Merge Candidates", val: countMerge, sub: "Passing checks & approved", active: false }
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
            el("div", { class: "sieve-spotlight-pr-meta", text: "Select a pull request from the queue to inspect impact." })
          ])
        );
        return;
      }

      const impactSum = pr.impact_summary || {};
      const dependentsCount = impactSum.direct_dependents ?? 0;
      const testsCount = impactSum.related_test_files ?? 0;
      const changedFiles = pr.changed_files ?? 0;

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
          pr.author_avatar ? el("img", { class: "sieve-spotlight-author-avatar", src: pr.author_avatar }) : null,
          el("span", { class: "sieve-spotlight-author-name", text: `@${pr.author}` })
        ]),
        el("span", { style: "font-size: 11px; color: rgba(255,255,255,0.5); font-family: var(--sieve-font-mono);", text: pr.turn_status?.replace(/_/g, " ") || "ready" })
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
          el("div", { class: "sieve-empty-state" }, [
            el("div", { class: "sieve-empty-icon", text: "📂" }),
            el("div", { class: "sieve-empty-title", text: "No pull requests in this view" }),
            el("div", { class: "sieve-empty-sub", text: "Select a different category from the sidebar or clear search filters." })
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
        const head = el("div", { class: "sieve-pr-head" }, [
          el("div", { class: "sieve-pr-title-row" }, [
            el("span", { class: "sieve-pr-num", text: `#${pr.number}` }),
            el("a", { class: "sieve-pr-title", href: pr.url, text: pr.title, target: "_blank", onclick: (e) => e.stopPropagation() })
          ]),
          el("div", { class: `sieve-pr-score-badge ${pr.verdict || "ready"}` }, [
            el("span", { text: `${pr.score ?? 0}` }),
            el("span", { style: "font-weight: 400; opacity: 0.8;", text: (pr.verdict || "ready").replace("-", " ") })
          ])
        ]);

        // Cross-PR Collision Banner
        let collisionBanner = null;
        if (pr.collisions && pr.collisions.length > 0) {
          const colInfo = pr.collisions[0];
          collisionBanner = el("div", { class: "sieve-collision-banner" }, [
            el("span", { text: "⚠️" }),
            el("span", { text: `File Collision: PR #${colInfo.with_pr} also modifies ${colInfo.file.split("/").pop()}` })
          ]);
        } else if (pr.duplicate_fixes && pr.duplicate_fixes.length > 0) {
          const dupInfo = pr.duplicate_fixes[0];
          collisionBanner = el("div", { class: "sieve-collision-banner" }, [
            el("span", { text: "🔀" }),
            el("span", { text: `Duplicate Fix: PR #${dupInfo.with_pr} also targets Issue #${dupInfo.issue}` })
          ]);
        }

        // Meta & Chips
        const metaRow = el("div", { class: "sieve-pr-meta-row" }, [
          el("div", { class: "sieve-pr-author-wrap" }, [
            pr.author_avatar ? el("img", { class: "sieve-pr-author-avatar", src: pr.author_avatar }) : null,
            el("span", { text: `@${pr.author}` })
          ]),
          el("span", { style: "color: var(--sieve-text-muted);", text: `+${pr.additions ?? 0} / -${pr.deletions ?? 0}` }),
          el("div", { class: "sieve-chips-wrap" }, [
            depCount > 0 ? el("span", { class: "sieve-chip blast", text: `+${depCount} dependents` }) : null,
            testCount > 0 ? el("span", { class: "sieve-chip pass", text: `✓ ${testCount} tests` }) : el("span", { class: "sieve-chip warn", text: "No tests" }),
            pr.is_bot ? el("span", { class: "sieve-chip", text: "🤖 Bot" }) : null,
            el("span", { class: "sieve-chip", text: pr.turn_status?.replace(/_/g, " ") || "action needed" })
          ])
        ]);

        // Action Buttons
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
          el("button", {
            type: "button",
            class: "btn-sieve secondary",
            text: "📋 Copy Response",
            onclick: (e) => {
              e.stopPropagation();
              const responseText = `Thanks @${pr.author} for the contribution! Checked the AST impact: ${depCount} dependents affected.`;
              navigator.clipboard.writeText(responseText);
              alert("Copied suggested maintainer response to clipboard!");
            }
          }),
          el("a", {
            class: "btn-sieve secondary",
            href: pr.url,
            target: "_blank",
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
      Object.keys(navButtons).forEach((k) => {
        if (navButtons[k]) {
          navButtons[k].className = `sieve-nav-item ${k === id ? "active" : ""}`;
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
      }
    }, [
      el("div", { class: "sieve-floating-pill-icon", text: "⚡" }),
      el("span", { class: "sieve-floating-pill-text", text: `Sieve Intelligence Active · ${countAction} PRs require maintainer attention` })
    ]);

    mainPane.append(topBar, topGrid, queueSection, floatingBar);
    workspaceContainer.append(sidebar, mainPane);
    appShell.append(workspaceContainer);

    shadowRoot.replaceChildren(appShell);
  }

  return { render };
})();
