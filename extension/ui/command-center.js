// Sieve Workspace — Maintainer Command Center
// Answers: what needs my attention, who needs to act, what should happen next, and why.
// Every status comes from the engine's deterministic lifecycle classifier (sieve/lifecycle.py) and
// carries its evidence. Read-only: nothing here writes to GitHub.

window.SieveCommandCenter = (function () {
  "use strict";

  let syncTimer = 0; // one "Synced N min ago" ticker per page, replaced on every render

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

  const STATUS = {
    action_needed: { label: "Action needed", tone: "act" },
    waiting_on_author: { label: "Waiting on author", tone: "wait" },
    waiting_for_review: { label: "Waiting for review", tone: "wait" },
    blocked: { label: "Blocked", tone: "block" },
    ready_to_merge: { label: "Ready to merge", tone: "ready" },
    draft: { label: "Draft", tone: "muted" },
    needs_triage: { label: "Needs triage", tone: "muted" },
  };
  const RESPONSIBLE = { maintainer: "You / maintainers", author: "Author", reviewer: "Reviewer", ci: "CI", unknown: "Unknown", nobody: "Nobody" };
  const CHECKS = { SUCCESS: "Checks passing", FAILURE: "Checks failing", PENDING: "Checks running", NONE: "No checks", null: "Checks unknown" };
  const FILTERS = [
    ["all", "All"], ["action_needed", "Action needed"], ["waiting_on_author", "Waiting on author"],
    ["waiting_for_review", "Waiting for review"], ["blocked", "Blocked"], ["ready_to_merge", "Ready to merge"],
    ["draft", "Draft"], ["stale", "Stale"], ["needs_triage", "Needs triage"],
  ];
  const KPIS = [
    ["all", "Open"], ["action_needed", "Action needed"], ["waiting_on_author", "Waiting on author"],
    ["waiting_for_review", "Waiting for review"], ["blocked", "Blocked"], ["ready_to_merge", "Ready to merge"],
  ];

  // Urgency is explicit, not a score: lower rank first, then longest-waiting first.
  function urgencyRank(r) {
    const lc = r.lifecycle;
    if (lc.status === "action_needed" && lc.evidence.some((e) => e.startsWith("Review requested from you"))) return 0;
    if (lc.status === "action_needed" && lc.next_action.startsWith("Re-review")) return 1;
    if (lc.status === "blocked" && lc.blockers.some((b) => b.severity === "hard")) return 2;
    if (lc.status === "action_needed") return 3;
    if (lc.status === "ready_to_merge") return 4;
    if (lc.status === "blocked") return 5;
    if (lc.status === "needs_triage") return 6;
    if (lc.status === "waiting_for_review") return 7;
    if (lc.status === "waiting_on_author") return 8;
    return 9;
  }

  const DAY = 86400000;
  function ageText(iso) {
    if (!iso) return "activity unknown";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 3600000) return `${Math.max(1, Math.round(ms / 60000))}m ago`;
    if (ms < DAY) return `${Math.round(ms / 3600000)}h ago`;
    return `${Math.round(ms / DAY)}d ago`;
  }

  function reviewState(r) {
    const ev = r.lifecycle.evidence.join(" ");
    if (/requested changes/.test(ev)) return "Changes requested";
    if (/Approved by/.test(ev)) return "Approved";
    if ((r.requested_reviewers || []).length) return `Review requested (${r.requested_reviewers.length})`;
    if (r.lifecycle.missing.includes("reviews")) return "Reviews unknown";
    return "No reviews";
  }

  // Normalize row to canonical 7-status lifecycle schema, mapping legacy fields if missing
  function normalizeRow(r) {
    if (!r) return null;
    if (r.lifecycle && r.lifecycle.status) {
      return {
        ...r,
        lifecycle: {
          status: r.lifecycle.status || "needs_triage",
          reason: r.lifecycle.reason || "Classified by deterministic lifecycle engine.",
          responsible: r.lifecycle.responsible || "unknown",
          next_action: r.lifecycle.next_action || "Triage pull request",
          last_activity_at: r.lifecycle.last_activity_at || r.updated_at || r.created_at || null,
          evidence: Array.isArray(r.lifecycle.evidence) ? r.lifecycle.evidence : [],
          blockers: Array.isArray(r.lifecycle.blockers) ? r.lifecycle.blockers : [],
          missing: Array.isArray(r.lifecycle.missing) ? r.lifecycle.missing : [],
        }
      };
    }

    // Map legacy queue fields:
    let status = "needs_triage";
    let responsible = "unknown";
    let reason = r.verdict ? `Intake verdict: ${r.verdict}` : "Legacy queue row without lifecycle payload.";
    let nextAction = "Triage pull request";

    if (r.draft) {
      status = "draft";
      responsible = "author";
      reason = "Marked as draft on GitHub.";
      nextAction = "Mark ready for review";
    } else if (r.turn_status === "action_needed_you") {
      status = "action_needed";
      responsible = "maintainer";
      reason = "Legacy queue flagged for maintainer action.";
      nextAction = "Review and address changes";
    } else if (r.turn_status === "waiting_on_contributor") {
      status = "waiting_on_author";
      responsible = "author";
      reason = "Waiting on author revision.";
      nextAction = "Address requested changes";
    } else if (r.turn_status === "blocked") {
      status = "blocked";
      responsible = "maintainer";
      reason = "Blocked by conflicts or checks.";
      nextAction = "Resolve merge conflicts or blocking checks";
    } else if (r.turn_status === "merge_candidate") {
      status = "ready_to_merge";
      responsible = "maintainer";
      reason = "Passing checks and ready for integration.";
      nextAction = "Merge pull request";
    } else if (r.category === "needs_review" || r.turn_status === "waiting_for_review") {
      status = "waiting_for_review";
      responsible = "reviewer";
      reason = "Awaiting review from assigned reviewers.";
      nextAction = "Submit pull request review";
    }

    const blockers = [];
    if (Array.isArray(r.collisions) && r.collisions.length > 0) {
      blockers.push({ severity: "soft", detail: `Overlaps with PR #${r.collisions[0].with_pr} on ${r.collisions[0].file}` });
    }
    if (r.checks === "FAILURE") {
      blockers.push({ severity: "hard", detail: "CI checks are failing" });
    }

    return {
      ...r,
      author: r.author || "unknown",
      title: r.title || `PR #${r.number || "unknown"}`,
      lifecycle: {
        status,
        reason,
        responsible,
        next_action: nextAction,
        last_activity_at: r.updated_at || r.created_at || null,
        evidence: Array.isArray(r.top_issues) && r.top_issues.length ? r.top_issues : [reason],
        blockers,
        missing: ["graphql_lifecycle"],
      }
    };
  }

  function render(shadowRoot, repoContext, queueData, engineStatus, callbacks = {}) {
    const meta = queueData.lifecycle || {};
    const rows = (queueData.rows || []).map(normalizeRow).filter(Boolean);
    const errored = (queueData.rows || []).filter((r) => r.error);
    const repoRef = repoContext.ref || (repoContext.owner && repoContext.repo ? `${repoContext.owner}/${repoContext.repo}` : "default");

    let collections = {}; // { [colName]: [prNumbers...] }
    const state = {
      filter: "all",
      query: "",
      sort: "urgency",
      author: "",
      reviewer: "",
      label: "",
      drafts: "include",
      selected: rows[0]?.number || null,
      staleDays: meta.stale_days || 14
    };

    // Load custom collections from storage
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get("sieveCollections", (res) => {
          if (res?.sieveCollections && res.sieveCollections[repoRef]) {
            const raw = res.sieveCollections[repoRef];
            collections = {};
            for (const [name, val] of Object.entries(raw)) {
              if (Array.isArray(val)) collections[name] = val;
              else if (val && Array.isArray(val.prNumbers)) collections[name] = val.prNumbers;
              else if (val && Array.isArray(val.prs)) collections[name] = val.prs;
            }
            paintChips();
            paintList();
            paintDetail();
          }
        });
      }
    } catch { /* storage unavailable */ }

    function saveCollections() {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local.get("sieveCollections", (res) => {
            const all = res?.sieveCollections || {};
            all[repoRef] = collections;
            chrome.storage.local.set({ sieveCollections: all });
          });
        }
      } catch { /* storage unavailable */ }
    }

    const isStale = (r) => {
      const at = r.lifecycle.last_activity_at;
      return at ? (Date.now() - new Date(at).getTime()) / DAY >= state.staleDays : false;
    };
    const isPrInCollection = (colName, prNum) => Array.isArray(collections[colName]) && collections[colName].includes(prNum);

    const matchesFilter = (r, f) => {
      if (f === "all") return true;
      if (f === "stale") return isStale(r);
      if (f.startsWith("col:")) return isPrInCollection(f.slice(4), r.number);
      return r.lifecycle.status === f;
    };
    const counts = () => Object.fromEntries(FILTERS.map(([id]) => [id, rows.filter((r) => matchesFilter(r, id)).length]));

    // ------------------------------------------------------------ header
    const synced = meta.fetched_at ? new Date(meta.fetched_at * 1000) : null;
    const syncText = el("span", { class: "scc-sync", title: synced ? synced.toISOString() : "" });
    const updateSync = () => { syncText.textContent = synced ? `Synced ${ageText(synced.toISOString())}` : "Sync time unknown"; };
    updateSync();
    clearInterval(syncTimer);
    syncTimer = setInterval(updateSync, 60000); // keeps "Synced N min ago" honest while the page stays open

    const search = el("input", { class: "scc-search", type: "search", placeholder: "Search #, title or author", "aria-label": "Search pull requests" });
    search.addEventListener("input", () => { state.query = search.value.trim().toLowerCase(); paintList(); });

    const staleInput = el("input", { type: "number", min: "1", max: "365", value: String(state.staleDays), id: "scc-stale-days", class: "scc-num" });
    staleInput.addEventListener("change", () => {
      const v = Math.max(1, Math.min(365, parseInt(staleInput.value, 10) || 14));
      state.staleDays = v;
      staleInput.value = String(v);
      try { chrome.storage.local.set({ sieveStaleDays: v }); } catch { /* storage unavailable: applies to this session only */ }
      paintAll();
    });
    try {
      chrome.storage.local.get("sieveStaleDays", (res) => {
        if (res && Number.isFinite(res.sieveStaleDays)) { state.staleDays = res.sieveStaleDays; staleInput.value = String(res.sieveStaleDays); paintAll(); }
      });
    } catch { /* storage unavailable */ }
    const settingsPanel = el("div", { class: "scc-settings", id: "scc-settings", hidden: true }, [
      el("label", { for: "scc-stale-days" }, ["Mark stale after ", staleInput, " days without a commit or review"]),
    ]);
    const settingsBtn = el("button", { type: "button", class: "scc-btn ghost", "aria-expanded": "false", "aria-controls": "scc-settings", text: "Settings",
      onclick: () => { settingsPanel.hidden = !settingsPanel.hidden; settingsBtn.setAttribute("aria-expanded", String(!settingsPanel.hidden)); } });
    const refreshBtn = callbacks.onRefresh
      ? el("button", { type: "button", class: "scc-btn ghost", text: "Refresh", onclick: () => { refreshBtn.disabled = true; refreshBtn.textContent = "Refreshing…"; callbacks.onRefresh(); } })
      : null;

    const header = el("header", { class: "scc-head" }, [
      el("div", { class: "scc-title" }, [
        el("p", { class: "scc-brand", text: "SIEVE" }),
        el("h1", { text: "Maintainer Command Center" }),
        el("p", { class: "scc-meta" }, [
          el("strong", { text: `${repoContext.owner} / ${repoContext.repo}` }), " · ", syncText,
          meta.viewer ? ` · viewing as @${meta.viewer}` : "",
          engineStatus && !engineStatus.connected ? " · engine offline" : "",
        ]),
      ]),
      el("div", { class: "scc-tools" }, [search, refreshBtn, settingsBtn]),
    ]);

    // partial-data notices: state exactly what Sieve couldn't see
    const notices = [];
    if (meta.source === "rest") notices.push(`Review, check and merge data unavailable (${meta.error || "GitHub GraphQL failed"}). Statuses use only what the pull request list shows.`);
    if (meta.truncated) notices.push(`Showing the ${rows.length} most recently updated of ${meta.total_count} open pull requests.`);
    if (!meta.viewer && meta.source !== "rest") notices.push("Your GitHub identity is unknown, so “review requested from you” can't be detected.");
    if (errored.length) notices.push(`${errored.length} pull request(s) failed to load.`);
    const noticeBox = notices.length ? el("div", { class: "scc-notice", role: "status" }, notices.map((n) => el("p", { text: n }))) : null;

    // ------------------------------------------------------------ KPIs
    const kpiBox = el("div", { class: "scc-kpis", role: "group", "aria-label": "Pull request counts by status" });
    function paintKpis() {
      const c = counts();
      kpiBox.replaceChildren(...KPIS.map(([id, label]) => el("button", {
        type: "button", class: `scc-kpi ${STATUS[id]?.tone || ""}`, "aria-pressed": String(state.filter === id), onclick: () => setFilter(id),
      }, [el("span", { class: "scc-kpi-num", text: String(c[id]) }), el("span", { class: "scc-kpi-label", text: label })])));
    }

    // ------------------------------------------------------------ attention queue
    const attention = el("section", { class: "scc-attention", "aria-labelledby": "scc-att-h" });
    function paintAttention() {
      const items = rows.filter((r) => r.lifecycle.status === "action_needed" || urgencyRank(r) === 2)
        .sort((a, b) => urgencyRank(a) - urgencyRank(b) || (a.lifecycle.last_activity_at || "").localeCompare(b.lifecycle.last_activity_at || ""))
        .slice(0, 5);
      attention.replaceChildren(
        el("h2", { id: "scc-att-h", text: "Your attention required" }),
        items.length
          ? el("ol", { class: "scc-att-list" }, items.map((r) => el("li", {}, [
              el("button", { type: "button", class: "scc-att-item", onclick: () => select(r.number) }, [
                el("span", { class: "scc-num-tag", text: `#${r.number}` }),
                el("span", { class: "scc-att-title", text: r.title }),
                el("span", { class: "scc-att-why", text: `${r.lifecycle.reason} · ${ageText(r.lifecycle.last_activity_at)}` }),
              ]),
            ])))
          : el("p", { class: "scc-empty", text: "Nothing needs you right now." }),
      );
    }

    // ------------------------------------------------------------ filters + toolbar
    const chipBox = el("div", { class: "scc-chips", role: "group", "aria-label": "Filter by status" });
    function paintChips() {
      const c = counts();
      const standardChips = FILTERS.map(([id, label]) => el("button", {
        type: "button", class: "scc-chip", "aria-pressed": String(state.filter === id), onclick: () => setFilter(id),
      }, [label, el("span", { class: "scc-chip-count", text: String(c[id]) })]));

      const colChips = Object.keys(collections).map((name) => {
        const count = rows.filter((r) => isPrInCollection(name, r.number)).length;
        const chipId = `col:${name}`;
        const delBtn = el("span", {
          class: "scc-chip-del",
          text: "×",
          title: `Delete collection "${name}"`,
          onclick: (e) => {
            e.stopPropagation();
            delete collections[name];
            if (state.filter === chipId) state.filter = "all";
            saveCollections();
            paintAll();
          }
        });
        return el("button", {
          type: "button",
          class: "scc-chip custom-col",
          "aria-pressed": String(state.filter === chipId),
          onclick: () => setFilter(chipId)
        }, [`📁 ${name}`, el("span", { class: "scc-chip-count", text: String(count) }), delBtn]);
      });

      const addColBtn = el("button", {
        type: "button",
        class: "scc-chip ghost-chip",
        text: "+ Collection",
        onclick: () => {
          const name = window.prompt("New collection name:")?.trim();
          if (name && !collections[name]) {
            collections[name] = [];
            saveCollections();
            setFilter(`col:${name}`);
          }
        }
      });

      chipBox.replaceChildren(...standardChips, ...colChips, addColBtn);
    }
    const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const selectBox = (key, label, options, allLabel) => {
      const s = el("select", { class: "scc-select", "aria-label": label },
        [el("option", { value: "", text: allLabel }), ...options.map((o) => el("option", { value: o, text: o }))]);
      s.addEventListener("change", () => { state[key] = s.value; paintList(); });
      return s;
    };
    const sortSel = el("select", { class: "scc-select", "aria-label": "Sort" }, [
      ["urgency", "Sort: urgency"],
      ["oldest", "Sort: longest waiting"],
      ["recent", "Sort: recent activity"],
      ["status", "Sort: status"],
      ["blast_desc", "Sort: blast radius"],
      ["number", "Sort: PR number"],
    ].map(([v, t]) => el("option", { value: v, text: t })));
    sortSel.addEventListener("change", () => { state.sort = sortSel.value; paintList(); });
    const draftSel = el("select", { class: "scc-select", "aria-label": "Drafts" },
      [["include", "Drafts: include"], ["exclude", "Drafts: hide"], ["only", "Drafts: only"]].map(([v, t]) => el("option", { value: v, text: t })));
    draftSel.addEventListener("change", () => { state.drafts = draftSel.value; paintList(); });
    const toolbar = el("div", { class: "scc-toolbar" }, [
      sortSel,
      selectBox("author", "Filter by author", uniq(rows.map((r) => r.author)), "All authors"),
      selectBox("reviewer", "Filter by reviewer", uniq(rows.flatMap((r) => [...(r.requested_reviewers || []), ...(r.reviewers || [])])), "All reviewers"),
      selectBox("label", "Filter by label", uniq(rows.flatMap((r) => r.labels || [])), "All labels"),
      draftSel,
    ]);

    // ------------------------------------------------------------ list + detail
    const list = el("ul", { class: "scc-list", "aria-label": "Pull requests" });
    const detail = el("aside", { class: "scc-detail", "aria-live": "polite", "aria-label": "Pull request details" });

    function visibleRows() {
      const q = state.query;
      const out = rows.filter((r) => matchesFilter(r, state.filter)
        && (!q || String(r.number) === q.replace("#", "") || r.title.toLowerCase().includes(q) || (r.author || "").toLowerCase().includes(q))
        && (!state.author || r.author === state.author)
        && (!state.reviewer || (r.requested_reviewers || []).includes(state.reviewer) || (r.reviewers || []).includes(state.reviewer))
        && (!state.label || (r.labels || []).includes(state.label))
        && (state.drafts === "include" || (state.drafts === "only" ? r.draft : !r.draft)));
      const act = (r) => r.lifecycle.last_activity_at || "";
      const blastScore = (r) => {
        if (r.impact && Array.isArray(r.impact.nodes)) return r.impact.nodes.length;
        if (typeof r.blast_radius === "number") return r.blast_radius;
        if (typeof r.score === "number") return r.score;
        return 0;
      };
      const cmp = {
        urgency: (a, b) => urgencyRank(a) - urgencyRank(b) || act(a).localeCompare(act(b)),
        oldest: (a, b) => act(a).localeCompare(act(b)),
        recent: (a, b) => act(b).localeCompare(act(a)),
        status: (a, b) => a.lifecycle.status.localeCompare(b.lifecycle.status) || b.number - a.number,
        blast_desc: (a, b) => blastScore(b) - blastScore(a) || b.number - a.number,
        number: (a, b) => b.number - a.number,
      }[state.sort] || ((a, b) => b.number - a.number);
      return out.sort(cmp);
    }

    function row(r) {
      const lc = r.lifecycle;
      const st = STATUS[lc.status];
      return el("li", {}, [el("button", {
        type: "button", class: "scc-row", "aria-current": state.selected === r.number ? "true" : null, onclick: () => select(r.number),
      }, [
        el("span", { class: "scc-row-main" }, [
          el("span", { class: "scc-row-title" }, [el("span", { class: "scc-num-tag", text: `#${r.number}` }), r.title,
            r.draft ? el("span", { class: "scc-tag", text: "draft" }) : null,
            isStale(r) ? el("span", { class: "scc-tag", text: "stale" }) : null,
            ...(r.labels || []).slice(0, 3).map((l) => el("span", { class: "scc-tag label", text: l }))]),
          el("span", { class: "scc-row-next" }, [el("strong", { text: RESPONSIBLE[lc.responsible] || lc.responsible }), ` → ${lc.next_action}`]),
          el("span", { class: "scc-row-facts", text: `@${r.author} · ${reviewState(r)} · ${CHECKS[r.checks] || CHECKS.null} · ${ageText(lc.last_activity_at)}` }),
        ]),
        el("span", { class: `scc-status ${st.tone}`, text: st.label }),
      ])]);
    }

    function paintList() {
      const items = visibleRows();
      list.replaceChildren(...(items.length ? items.map(row)
        : [el("li", { class: "scc-empty", text: rows.length ? "No pull requests match these filters." : "No open pull requests." })]));
    }

    function paintDetail() {
      const r = rows.find((x) => x.number === state.selected);
      if (!r) {
        detail.replaceChildren(el("p", { class: "scc-empty", text: "Select a pull request to see why it is in its queue, who needs to act, and what's next." }));
        return;
      }
      const lc = r.lifecycle;
      const gh = /^https:\/\/github\.com\//.test(r.url || "") ? r.url : null;
      detail.replaceChildren(
        el("p", { class: "scc-num-tag", text: `#${r.number} · @${r.author}` }),
        el("h3", { text: r.title }),
        el("span", { class: `scc-status ${STATUS[lc.status].tone}`, text: STATUS[lc.status].label }),
        el("dl", { class: "scc-facts" }, [
          el("dt", { text: "Why this queue" }), el("dd", { text: lc.reason }),
          el("dt", { text: "Who acts" }), el("dd", { text: RESPONSIBLE[lc.responsible] || lc.responsible }),
          el("dt", { text: "Next action" }), el("dd", { text: lc.next_action }),
          el("dt", { text: "Last activity" }), el("dd", { text: lc.last_activity_at ? `${ageText(lc.last_activity_at)} (commit or review)` : "Unknown" }),
        ]),
        el("h4", { text: "Evidence from GitHub" }),
        el("ul", { class: "scc-evidence" }, lc.evidence.map((e) => el("li", { text: e }))),
        lc.blockers.length ? el("h4", { text: "Blockers" }) : null,
        lc.blockers.length ? el("ul", { class: "scc-evidence" }, lc.blockers.map((b) => el("li", {}, [el("span", { class: `scc-sev ${b.severity}`, text: b.severity }), b.detail]))) : null,
        lc.missing.length ? el("p", { class: "scc-missing", text: `Not available to Sieve: ${lc.missing.join(", ")}.` }) : null,
        r.analyzed && r.score !== null && r.score !== undefined ? el("p", { class: "scc-missing", text: `Sieve intake score ${r.score}/100 (${r.verdict}).` }) : null,
        el("div", { class: "scc-detail-cols" }, [
          el("h4", { text: "Collections" }),
          Object.keys(collections).filter((name) => isPrInCollection(name, r.number)).length
            ? el("div", { class: "scc-col-tags" }, Object.keys(collections).filter((name) => isPrInCollection(name, r.number)).map((name) => el("span", { class: "scc-tag" }, [
                `📁 ${name} `,
                el("span", {
                  class: "scc-tag-del",
                  text: "×",
                  title: `Remove from ${name}`,
                  onclick: () => {
                    collections[name] = collections[name].filter((n) => n !== r.number);
                    saveCollections();
                    paintAll();
                  }
                })
              ])))
            : el("p", { class: "scc-missing", text: "Not in any custom collection." }),
          Object.keys(collections).filter((name) => !isPrInCollection(name, r.number)).length
            ? el("select", {
                class: "scc-select scc-col-select",
                "aria-label": "Add to collection",
                onchange: (e) => {
                  const targetCol = e.target.value;
                  if (targetCol && collections[targetCol]) {
                    if (!collections[targetCol].includes(r.number)) {
                      collections[targetCol].push(r.number);
                      saveCollections();
                      paintAll();
                    }
                  }
                }
              }, [el("option", { value: "", text: "+ Add to collection…" }), ...Object.keys(collections).filter((name) => !isPrInCollection(name, r.number)).map((c) => el("option", { value: c, text: c }))])
            : null,
        ]),
        el("div", { class: "scc-detail-actions" }, [
          el("button", { type: "button", class: "scc-btn primary", text: "Open PR intelligence", onclick: () => callbacks.onInspectPR?.(r.number) }),
          gh ? el("a", { class: "scc-btn ghost", href: gh, target: "_blank", rel: "noopener", text: "Open on GitHub ↗" }) : null,
        ]),
      );
    }

    function select(n) { state.selected = n; paintList(); paintDetail(); }
    function setFilter(id) { state.filter = id; paintAll(); }
    function paintAll() { paintKpis(); paintAttention(); paintChips(); paintList(); paintDetail(); }

    const app = el("div", { class: "sieve-workspace scc" }, [
      header, settingsPanel, noticeBox, kpiBox, attention,
      el("section", { class: "scc-queue", "aria-label": "Pull request queue" }, [chipBox, toolbar, el("div", { class: "scc-split" }, [list, detail])]),
    ]);
    paintAll();

    const styleLink = el("link", { rel: "stylesheet", href: chrome.runtime.getURL("ui/workspace.css") });
    shadowRoot.replaceChildren(styleLink, app);
  }

  return { render, normalizeRow, FILTERS, STATUS };
})();
