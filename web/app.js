/**
 * SIEVE — FRONTEND CONTROLLER
 * Architecture: Vanilla JavaScript, zero external dependencies.
 * Security: Strict DOM construction. Never innerHTML untrusted strings.
 */

// DOM Selector Helper
const $ = (id) => document.getElementById(id);

// Regex Validators
const PR_RE = /^(?:https?:\/\/github\.com\/)?([\w.-]+\/[\w.-]+)(?:\/pull\/|#)(\d+)\/?$/;
const REPO_RE = /^(?:https?:\/\/github\.com\/)?([\w.-]+\/[\w.-]+)\/?$/;

// Product Configuration
const EXAMPLES = [
  { ref: "ThatKJ/sieve-demo-target#1", note: "A solid fix with tests" },
  { ref: "ThatKJ/sieve-demo-target#2", note: "Looks polished, doesn't check out" },
  { ref: "ThatKJ/sieve-demo-target#3", note: "Drive-by README edit" },
  { ref: "ThatKJ/sieve-demo-target", note: "Rank every open PR in a repository" },
];

const VERDICT_LABELS = {
  ready: "Ready for review",
  "needs-work": "Needs work before review",
  "low-effort": "Low-effort signals"
};

const GROUPS = [
  { status: "fail", label: "Doesn't check out", glyph: "✕" },
  { status: "warn", label: "Needs attention", glyph: "!" },
  { status: "info", label: "Context", glyph: "ℹ" },
  { status: "pass", label: "Verified", glyph: "✓" }
];

// Application State
let health = { ollama: false, model: "qwen3.5:9b", model_installed: false, offline: false };
let activeRunId = 0; // Discards stale async responses

// ==========================================================================
// SECURE DOM HELPERS (Zero-XSS Construction)
// ==========================================================================

/**
 * Creates an HTML element with safe attributes and children.
 * String children are ALWAYS converted to TextNodes (never innerHTML).
 */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "className" || key === "class") {
      node.className = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset" && typeof value === "object") {
      for (const [dKey, dVal] of Object.entries(value)) {
        node.dataset[dKey] = dVal;
      }
    } else {
      node.setAttribute(key, value);
    }
  }

  const childList = Array.isArray(children) ? children : [children];
  for (const child of childList) {
    if (child === null || child === undefined) continue;
    if (typeof child === "string" || typeof child === "number") {
      node.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      node.appendChild(child);
    }
  }
  return node;
}

/**
 * Validates that a URL is strictly a GitHub URL before rendering it as a link.
 */
function isSafeGitHubUrl(url) {
  if (typeof url !== "string") return false;
  return url.startsWith("https://github.com/");
}

/**
 * Validates that an avatar URL is strictly from the permitted GitHub avatar CDN.
 */
function isSafeAvatarUrl(url) {
  if (typeof url !== "string") return false;
  return url.startsWith("https://avatars.githubusercontent.com/");
}

// ==========================================================================
// API CLIENT
// ==========================================================================

async function fetchApi(path) {
  let res;
  try {
    res = await fetch(path);
  } catch (err) {
    throw new Error("Unable to reach Sieve server. Is the local service running on port 8787?");
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned an invalid response (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(data.error || `Server returned HTTP ${res.status}`);
  }
  return data;
}

// ==========================================================================
// VIEW SWITCHING & UI FEEDBACK
// ==========================================================================

function showSection(activeId) {
  const sections = ["intro", "report", "queue"];
  for (const id of sections) {
    const sectionEl = $(id);
    if (sectionEl) {
      sectionEl.hidden = id !== activeId;
    }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setError(message) {
  const errorEl = $("error");
  if (!message) {
    errorEl.textContent = "";
    errorEl.hidden = true;
    return;
  }
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setBusy(isBusy, buttonText = "Checking…") {
  const goBtn = $("go");
  const targetInput = $("target");
  if (goBtn) {
    goBtn.disabled = isBusy;
    const btnTextEl = goBtn.querySelector(".btn-text");
    if (btnTextEl) {
      btnTextEl.textContent = isBusy ? buttonText : "Check";
    } else {
      goBtn.textContent = isBusy ? buttonText : "Check";
    }
  }
  if (targetInput) {
    targetInput.disabled = isBusy;
  }
}

// ==========================================================================
// HEALTH & HEADER STATUS
// ==========================================================================

async function loadHealth() {
  try {
    health = await fetchApi("/api/health");
  } catch {
    health = { ollama: false, model: "qwen3.5:9b", model_installed: false, offline: false };
  }

  // Update hero model pill text
  const heroModelPill = $("hero-model-pill");
  if (heroModelPill) {
    heroModelPill.textContent = health.model || "qwen3.5:9b";
  }

  // Render header status strip
  const statusStrip = $("status");
  statusStrip.textContent = "";

  const modelOk = health.ollama && health.model_installed;
  const modelPill = el("span", {
    class: `status-pill ${modelOk ? "ok" : "bad"}`,
    title: modelOk
      ? "Ollama is running with the required model installed locally"
      : "Ollama not reachable or model missing: model checks will be skipped"
  }, [
    el("span", { class: "status-dot", "aria-hidden": "true" }),
    `${health.model || "local model"} · local`
  ]);
  statusStrip.appendChild(modelPill);

  const readOnlyPill = el("span", {
    class: "status-pill",
    title: "Sieve operates in read-only mode: it never posts comments, modifies labels, or closes PRs"
  }, [
    el("span", { class: "status-dot", "aria-hidden": "true" }),
    "read-only"
  ]);
  statusStrip.appendChild(readOnlyPill);

  if (health.offline) {
    const offlinePill = el("span", {
      class: "status-pill",
      title: "Serving cached GitHub data (SIEVE_OFFLINE=1)"
    }, [
      el("span", { class: "status-dot", "aria-hidden": "true" }),
      "offline cache"
    ]);
    statusStrip.appendChild(offlinePill);
  }
}

// ==========================================================================
// TRY EXAMPLES
// ==========================================================================

function renderExamples() {
  const container = $("examples");
  container.textContent = "";

  for (const item of EXAMPLES) {
    const card = el("button", {
      type: "button",
      class: "example-card",
      dataset: { ref: item.ref }
    }, [
      el("div", { class: "example-top" }, [
        el("span", { class: "example-ref" }, item.ref),
        el("span", { class: "example-action-hint", "aria-hidden": "true" }, [
          "Inspect",
          el("span", {}, "→")
        ])
      ]),
      el("span", { class: "example-note" }, item.note)
    ]);

    card.addEventListener("click", () => {
      $("target").value = item.ref;
      updateClearBtnVisibility();
      startNavigation(item.ref, true);
    });

    container.appendChild(card);
  }
}

// ==========================================================================
// ROUTING & USER INTENT HANDLING
// ==========================================================================

function normalizeRef(raw) {
  return raw.trim();
}

function startNavigation(rawRef, pushToHistory = true) {
  const ref = normalizeRef(rawRef);
  setError("");

  if (!ref) {
    return setError("Please enter a GitHub pull request (e.g. owner/repo#123) or a repository (e.g. owner/repo).");
  }

  // Check for PR match: e.g. "owner/repo#12" or "github.com/owner/repo/pull/12"
  const prMatch = ref.match(PR_RE);
  if (prMatch) {
    const cleanRef = `${prMatch[1]}#${prMatch[2]}`;
    if (pushToHistory) {
      history.pushState(null, "", `?pr=${encodeURIComponent(cleanRef)}`);
    }
    return executePrAnalysis(cleanRef);
  }

  // Check for Repo match: e.g. "owner/repo" or "https://github.com/owner/repo"
  const repoMatch = ref.match(REPO_RE);
  if (repoMatch) {
    const cleanRepo = repoMatch[1];
    if (pushToHistory) {
      history.pushState(null, "", `?repo=${encodeURIComponent(cleanRepo)}`);
    }
    return executeQueueLoad(cleanRepo);
  }

  setError("Input not recognized. Please provide a pull request (e.g. owner/repo#123) or repository (e.g. owner/repo).");
}

function handleUrlState() {
  const params = new URLSearchParams(window.location.search);
  const prParam = params.get("pr");
  const repoParam = params.get("repo");

  if (prParam) {
    $("target").value = prParam;
    updateClearBtnVisibility();
    startNavigation(prParam, false);
  } else if (repoParam) {
    $("target").value = repoParam;
    updateClearBtnVisibility();
    startNavigation(repoParam, false);
  } else {
    $("target").value = "";
    updateClearBtnVisibility();
    showSection("intro");
  }
}

// ==========================================================================
// SINGLE PR ANALYSIS WORKFLOW
// ==========================================================================

async function executePrAnalysis(prRef) {
  const currentRun = ++activeRunId;
  setBusy(true, "Inspecting…");
  showSection("report");

  const reportContainer = $("report");
  reportContainer.dataset.currentPr = "";
  reportContainer.textContent = "";

  // Render initial skeleton loader
  const skeleton = el("div", { class: "skeleton-loading", role: "status" }, [
    el("div", { class: "spinner", "aria-hidden": "true" }),
    el("div", {}, "Fetching pull request, diffs, linked issues, and repository tree from GitHub…")
  ]);
  reportContainer.appendChild(skeleton);

  try {
    // Stage 1: Deterministic pass (model=0)
    const fastResult = await fetchApi(`/api/analyze?pr=${encodeURIComponent(prRef)}&model=0`);
    if (currentRun !== activeRunId) return; // Stale check guard

    const isModelAvailable = health.ollama && health.model_installed;
    renderOrUpdatePrReport(fastResult, isModelAvailable ? "pending" : "off");

    // If model is not available or disabled, we are done
    if (!isModelAvailable) {
      return;
    }

    // Stage 2: Local Model judgment pass (model=1)
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      if (currentRun !== activeRunId) {
        clearInterval(timerInterval);
        return;
      }
      const elapsedSpan = $("model-elapsed-timer");
      if (elapsedSpan) {
        const secs = Math.round((Date.now() - startTime) / 1000);
        elapsedSpan.textContent = `${secs}s`;
      }
    }, 1000);

    try {
      const fullResult = await fetchApi(`/api/analyze?pr=${encodeURIComponent(prRef)}&model=1`);
      if (currentRun === activeRunId) {
        renderOrUpdatePrReport(fullResult, "done");
      }
    } catch (modelErr) {
      if (currentRun === activeRunId) {
        renderOrUpdatePrReport(fastResult, "error", modelErr.message);
      }
    } finally {
      clearInterval(timerInterval);
    }
  } catch (err) {
    if (currentRun !== activeRunId) return;
    showSection("intro");
    setError(err.message);
  } finally {
    if (currentRun === activeRunId) {
      setBusy(false);
    }
  }
}

// ==========================================================================
// FINDING CARD BUILDER
// ==========================================================================

function createFindingCard(finding) {
  const isModelOpinion = ["model", "guidelines"].includes(finding.check);
  const glyphMap = { fail: "✕", warn: "!", info: "ℹ", pass: "✓" };

  const titleRowChildren = [
    el("span", { class: "finding-title" }, finding.title)
  ];

  if (isModelOpinion) {
    titleRowChildren.push(el("span", { class: "model-tag" }, "Model Opinion"));
  }

  if (finding.check) {
    titleRowChildren.push(el("span", { class: "category-tag" }, finding.check));
  }

  const bodyChildren = [
    el("div", { class: "finding-title-row" }, titleRowChildren)
  ];

  if (finding.detail) {
    bodyChildren.push(el("div", { class: "finding-detail" }, finding.detail));
  }

  if (finding.fix) {
    bodyChildren.push(el("div", { class: "finding-fix" }, [
      el("strong", {}, "Suggested fix: "),
      finding.fix
    ]));
  }

  // Evidence list with strict URL validation
  if (Array.isArray(finding.evidence) && finding.evidence.length > 0) {
    const evidenceList = el("ul", { class: "evidence-list" });
    for (const evItem of finding.evidence) {
      const evStr = String(evItem ?? "");
      let evContent;
      if (isSafeGitHubUrl(evStr)) {
        const displayLabel = evStr.replace(/^https:\/\/github\.com\//, "");
        evContent = el("a", {
          href: evStr,
          target: "_blank",
          rel: "noopener noreferrer"
        }, displayLabel);
      } else {
        evContent = evStr;
      }
      evidenceList.appendChild(el("li", { class: "evidence-item" }, evContent));
    }
    bodyChildren.push(evidenceList);
  }

  return el("div", { class: `finding-card ${finding.status}` }, [
    el("div", {
      class: "finding-status-icon",
      "aria-label": finding.status
    }, glyphMap[finding.status] || "•"),
    el("div", { class: "finding-body" }, bodyChildren)
  ]);
}

// ==========================================================================
// PR REPORT RENDERER & IN-PLACE UPDATER
// ==========================================================================

function renderFindingsColumn(findings, modelState) {
  const container = el("div", { class: "findings-column", id: "findings-column-container" });

  for (const group of GROUPS) {
    const groupItems = findings.filter(f => f.status === group.status);
    const isInfoPending = group.status === "info" && modelState === "pending";

    if (groupItems.length === 0 && !isInfoPending) {
      continue;
    }

    const itemsContainer = el("div", { class: "finding-items-list" });
    for (const f of groupItems) {
      itemsContainer.appendChild(createFindingCard(f));
    }

    if (isInfoPending) {
      itemsContainer.appendChild(el("div", { class: "pending-finding-row" }, [
        el("div", { class: "spinner", "aria-hidden": "true" }),
        el("div", {}, `Evaluating diff against PR intent with ${health.model || "qwen3.5:9b"}…`)
      ]));
    }

    const groupSection = el("div", { class: "finding-group" }, [
      el("div", { class: "finding-group-header" }, [
        el("h3", { class: "finding-group-title" }, group.label),
        el("span", { class: "finding-group-count" }, groupItems.length)
      ]),
      itemsContainer
    ]);

    container.appendChild(groupSection);
  }

  return container;
}

function renderModelPanelContent(reportData, modelState, modelErrorMsg) {
  if (modelState === "pending") {
    return el("p", { class: "panel-sub" }, "Running local evaluation… deterministic checks are already completed above.");
  }
  if (modelState === "off") {
    return el("p", { class: "panel-sub" }, "Ollama is not reachable or model is missing. The relevance check was skipped; all deterministic checks remain active.");
  }
  if (modelState === "error") {
    return el("div", { class: "finding-fix" }, [
      el("strong", {}, "Model check notice: "),
      modelErrorMsg || "Model inference failed or timed out."
    ]);
  }
  if (reportData.model && reportData.model.used && reportData.model.judgment) {
    const j = reportData.model.judgment;
    const confidencePct = Math.round((j.confidence ?? 0) * 100);

    const judgmentGridChildren = [
      el("div", { class: "judgment-stat-row" }, [
        el("span", { class: "judgment-label" }, "Verdict"),
        el("span", { class: "judgment-val" }, j.verdict)
      ]),
      el("div", { class: "judgment-stat-row" }, [
        el("span", { class: "judgment-label" }, "Confidence"),
        el("span", { class: "judgment-val" }, `${confidencePct}%`)
      ]),
      el("div", { class: "judgment-reason-box" }, [
        el("strong", {}, "Model Analysis"),
        j.reason || "No detail provided."
      ])
    ];

    if (Array.isArray(j.gaps) && j.gaps.length > 0) {
      const gapsList = el("ul", { class: "evidence-list" });
      for (const g of j.gaps) {
        gapsList.appendChild(el("li", { class: "evidence-item" }, g));
      }
      judgmentGridChildren.push(el("div", { class: "judgment-reason-box" }, [
        el("strong", {}, "Identified Gaps"),
        gapsList
      ]));
    }

    return el("div", { class: "model-judgment-grid" }, judgmentGridChildren);
  }
  return el("p", { class: "panel-sub" }, (reportData.model && reportData.model.error) ? reportData.model.error : "Model judgment was not used for this report.");
}

function renderOrUpdatePrReport(reportData, modelState, modelErrorMsg = "") {
  const reportContainer = $("report");
  const pr = reportData.pr;
  const prRef = `${pr.owner}/${pr.repo}#${pr.number}`;
  const findings = reportData.findings || [];

  const countFails = findings.filter(f => f.status === "fail").length;
  const countWarns = findings.filter(f => f.status === "warn").length;
  const countPass = findings.filter(f => f.status === "pass").length;

  // Build findings tally DOM
  const tallySpans = [];
  if (countFails > 0) tallySpans.push(el("span", { class: "tally-item-fail" }, `${countFails} don't check out`));
  if (countWarns > 0) tallySpans.push(el("span", { class: "tally-item-warn" }, `${countWarns} need attention`));
  if (countPass > 0) tallySpans.push(el("span", { class: "tally-item-pass" }, `${countPass} verified`));

  const tallyContainer = el("div", { class: "findings-tally", id: "report-findings-tally" });
  for (let i = 0; i < tallySpans.length; i++) {
    tallyContainer.appendChild(tallySpans[i]);
    if (i < tallySpans.length - 1) {
      tallyContainer.appendChild(document.createTextNode("  ·  "));
    }
  }

  // Check if we are updating an existing rendered report for this same PR
  if (reportContainer.dataset.currentPr === prRef) {
    // 1. Update Verdict Card
    const verdictHero = $("verdict-hero-card");
    if (verdictHero) {
      verdictHero.className = `verdict-hero ${reportData.verdict}`;
    }
    const scoreNum = $("score-num-display");
    if (scoreNum) {
      scoreNum.textContent = reportData.score;
    }
    const verdictTitle = $("verdict-title-display");
    if (verdictTitle) {
      verdictTitle.textContent = VERDICT_LABELS[reportData.verdict] || reportData.verdict;
    }
    const existingTally = $("report-findings-tally");
    if (existingTally && existingTally.parentNode) {
      existingTally.parentNode.replaceChild(tallyContainer, existingTally);
    }

    // Remove or update model loading strip
    const loadingStrip = $("model-loading-strip-container");
    if (loadingStrip) {
      if (modelState === "pending") {
        // Keep it
      } else {
        loadingStrip.remove();
      }
    }

    // 2. Update Findings Column
    const oldFindingsCol = $("findings-column-container");
    const newFindingsCol = renderFindingsColumn(findings, modelState);
    if (oldFindingsCol && oldFindingsCol.parentNode) {
      oldFindingsCol.parentNode.replaceChild(newFindingsCol, oldFindingsCol);
    }

    // 3. Update Model Panel Content
    const modelContainer = $("model-panel-content-container");
    if (modelContainer) {
      modelContainer.textContent = "";
      modelContainer.appendChild(renderModelPanelContent(reportData, modelState, modelErrorMsg));
    }

    // 4. Update Reply Content (preserves copy button state!)
    const replyText = $("reply-text");
    if (replyText) {
      replyText.textContent = reportData.comment || "No comment generated.";
    }

    // 5. Update Audit Summary
    const totalFindingsVal = $("audit-total-findings");
    if (totalFindingsVal) {
      totalFindingsVal.textContent = `${findings.length} item${findings.length === 1 ? "" : "s"}`;
    }
    const elapsedVal = $("audit-elapsed-time");
    if (elapsedVal) {
      elapsedVal.textContent = `${reportData.elapsed_s ?? 0}s`;
    }
    return;
  }

  // --- FULL FIRST RENDER ---
  reportContainer.textContent = "";
  reportContainer.dataset.currentPr = prRef;

  // 1. Breadcrumbs Bar
  const repoSlug = `${pr.owner}/${pr.repo}`;
  const crumbs = el("div", { class: "crumbs-bar" }, [
    el("a", {
      class: "crumb-back",
      href: `?repo=${encodeURIComponent(repoSlug)}`,
      onClick: (e) => {
        e.preventDefault();
        $("target").value = repoSlug;
        updateClearBtnVisibility();
        startNavigation(repoSlug, true);
      }
    }, [
      el("span", { "aria-hidden": "true" }, "←"),
      repoSlug
    ]),
    el("span", { class: "footer-sep" }, "·"),
    el("span", { class: "crumb-pr-num" }, `#${pr.number}`)
  ]);
  reportContainer.appendChild(crumbs);

  // 2. PR Title
  const prTitle = el("h1", { class: "report-pr-title" }, pr.title);
  reportContainer.appendChild(prTitle);

  // 3. Meta Strip
  const metaChildren = [];

  // Author & Avatar
  const authorChipChildren = [];
  if (isSafeAvatarUrl(pr.author_avatar)) {
    authorChipChildren.push(el("img", {
      class: "author-avatar",
      src: `${pr.author_avatar}&s=48`,
      alt: `@${pr.author}`
    }));
  }
  authorChipChildren.push(el("span", {}, `@${pr.author}`));

  if (pr.association && pr.association !== "NONE") {
    authorChipChildren.push(el("span", { class: "association-pill" }, pr.association.toLowerCase().replace(/_/g, " ")));
  }
  metaChildren.push(el("div", { class: "author-chip" }, authorChipChildren));

  // Additions / Deletions / Changed Files
  metaChildren.push(el("div", { class: "diff-stats" }, [
    el("span", { class: "stat-adds" }, `+${pr.additions ?? 0}`),
    el("span", { class: "stat-dels" }, `−${pr.deletions ?? 0}`),
    el("span", { class: "stat-files" }, `· ${pr.changed_files ?? 0} file${(pr.changed_files ?? 0) === 1 ? "" : "s"}`)
  ]));

  // State Badge
  let stateClass = "state-open";
  let stateLabel = pr.state;
  if (pr.merged) {
    stateClass = "state-merged";
    stateLabel = "merged";
  } else if (pr.state === "closed") {
    stateClass = "state-closed";
    stateLabel = "closed";
  }
  metaChildren.push(el("span", { class: `pr-state-badge ${stateClass}` }, stateLabel));

  // External GitHub Link
  if (isSafeGitHubUrl(pr.url)) {
    metaChildren.push(el("a", {
      class: "github-link",
      href: pr.url,
      target: "_blank",
      rel: "noopener noreferrer"
    }, [
      "Open on GitHub",
      el("span", { "aria-hidden": "true" }, "↗")
    ]));
  }

  reportContainer.appendChild(el("div", { class: "report-meta-strip" }, metaChildren));

  // 4. Hero Verdict Card
  const verdictHeadlineRow = el("div", { class: "verdict-headline-row" }, [
    el("h2", { class: "verdict-title", id: "verdict-title-display" }, VERDICT_LABELS[reportData.verdict] || reportData.verdict)
  ]);

  const verdictInfoChildren = [
    verdictHeadlineRow,
    tallyContainer
  ];

  if (modelState === "pending") {
    verdictInfoChildren.push(el("div", {
      class: "model-loading-strip",
      id: "model-loading-strip-container",
      role: "status"
    }, [
      el("div", { class: "spinner", "aria-hidden": "true" }),
      el("span", {}, `Asking ${health.model || "qwen3.5:9b"} whether the diff addresses the linked issue… `),
      el("span", { class: "model-timer-pill", id: "model-elapsed-timer" }, "0s")
    ]));
  }

  const verdictCard = el("section", {
    class: `verdict-hero ${reportData.verdict}`,
    id: "verdict-hero-card",
    "aria-label": "Inspection Verdict"
  }, [
    el("div", { class: "score-display" }, [
      el("span", { class: "score-num", id: "score-num-display" }, reportData.score),
      el("span", { class: "score-max" }, "/ 100")
    ]),
    el("div", { class: "verdict-info" }, verdictInfoChildren)
  ]);
  reportContainer.appendChild(verdictCard);

  // 5. Findings Column
  const findingsColumn = renderFindingsColumn(findings, modelState);

  // 6. Sidebar Workspace
  const sidebar = el("aside", { class: "report-sidebar" });

  // A. Reply to Contributor Panel
  const copyBtn = el("button", {
    type: "button",
    class: "copy-btn",
    id: "copy-reply-btn"
  }, [
    el("span", { class: "copy-label" }, "Copy Draft")
  ]);

  function copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackExecCopy(text);
      });
    } else {
      fallbackExecCopy(text);
    }
  }

  function fallbackExecCopy(text) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch {
      // Ignored
    }
  }

  copyBtn.addEventListener("click", () => {
    const textToCopy = $("reply-text") ? $("reply-text").textContent : (reportData.comment || "");
    copyToClipboard(textToCopy);

    copyBtn.textContent = "Copied ✓";
    copyBtn.classList.add("copied");

    setTimeout(() => {
      copyBtn.textContent = "Copy Draft";
      copyBtn.classList.remove("copied");
    }, 2000);
  });

  const replyPanel = el("div", { class: "sidebar-panel" }, [
    el("div", { class: "panel-header-row" }, [
      el("h3", { class: "panel-title" }, "Reply to contributor"),
      copyBtn
    ]),
    el("p", { class: "panel-sub" }, "Draft only. Sieve never posts or comments to GitHub."),
    el("div", { class: "reply-preview-box" }, [
      el("pre", { class: "reply-pre", id: "reply-text" }, reportData.comment || "No comment generated.")
    ])
  ]);
  sidebar.appendChild(replyPanel);

  // B. Model Judgment Panel
  const modelPanelContentContainer = el("div", { id: "model-panel-content-container" }, [
    renderModelPanelContent(reportData, modelState, modelErrorMsg)
  ]);

  const modelPanel = el("div", { class: "sidebar-panel" }, [
    el("div", { class: "panel-header-row" }, [
      el("h3", { class: "panel-title" }, "Relevance judgment"),
      el("span", { class: "model-opinion-badge" }, `${health.model || "qwen3.5:9b"} · Ollama`)
    ]),
    modelPanelContentContainer
  ]);
  sidebar.appendChild(modelPanel);

  // C. Audit Metadata Panel
  const auditPanel = el("div", { class: "sidebar-panel" }, [
    el("h3", { class: "panel-title", style: "margin-bottom: 12px;" }, "Inspection summary"),
    el("dl", { class: "audit-dl" }, [
      el("dt", {}, "Total findings"),
      el("dd", { id: "audit-total-findings" }, `${findings.length} item${findings.length === 1 ? "" : "s"}`),
      el("dt", {}, "Tree scope"),
      el("dd", {}, reportData.tree_truncated ? "Truncated (repository tree exceeded limits)" : "Complete repository tree"),
      el("dt", {}, "Elapsed time"),
      el("dd", { id: "audit-elapsed-time" }, `${reportData.elapsed_s ?? 0}s`)
    ])
  ]);
  sidebar.appendChild(auditPanel);

  // Combine Findings Column and Sidebar into Grid
  const reportGrid = el("div", { class: "report-grid" }, [
    findingsColumn,
    sidebar
  ]);
  reportContainer.appendChild(reportGrid);
}

// ==========================================================================
// REPOSITORY QUEUE WORKFLOW
// ==========================================================================

async function executeQueueLoad(repoRef) {
  const currentRun = ++activeRunId;
  setBusy(true, "Scanning repository…");
  showSection("queue");

  const queueContainer = $("queue");
  queueContainer.textContent = "";

  const skeleton = el("div", { class: "skeleton-loading", role: "status" }, [
    el("div", { class: "spinner", "aria-hidden": "true" }),
    el("div", {}, "Running fast intake checks across open pull requests…")
  ]);
  queueContainer.appendChild(skeleton);

  try {
    const queueData = await fetchApi(`/api/queue?repo=${encodeURIComponent(repoRef)}`);
    if (currentRun !== activeRunId) return;

    renderQueueView(queueData);
  } catch (err) {
    if (currentRun !== activeRunId) return;
    showSection("intro");
    setError(err.message);
  } finally {
    if (currentRun === activeRunId) {
      setBusy(false);
    }
  }
}

function renderQueueView(queueData) {
  const queueContainer = $("queue");
  queueContainer.textContent = "";

  const rows = queueData.rows || [];
  const countReady = rows.filter(r => r.verdict === "ready").length;
  const countNeedsWork = rows.filter(r => r.verdict === "needs-work").length;
  const countLowEffort = rows.filter(r => r.verdict === "low-effort").length;

  // 1. Header Panel
  const headerPanel = el("div", { class: "queue-header-panel" }, [
    el("div", { class: "queue-title-area" }, [
      el("h2", {}, `${queueData.owner}/${queueData.repo}`),
      el("p", { class: "queue-subtitle" }, `${rows.length} open pull request${rows.length === 1 ? "" : "s"} evaluated with fast deterministic checks. Select any row to inspect the full report.`)
    ]),
    el("div", { class: "queue-breakdown-strip" }, [
      el("span", { class: "queue-pill ready" }, `${countReady} ready`),
      el("span", { class: "queue-pill needs-work" }, `${countNeedsWork} need work`),
      el("span", { class: "queue-pill low-effort" }, `${countLowEffort} low-effort`)
    ])
  ]);
  queueContainer.appendChild(headerPanel);

  // 2. Table of Pull Requests
  const table = el("table", { class: "queue-table" });
  table.appendChild(el("thead", {}, [
    el("tr", {}, [
      el("th", { style: "width: 80px;" }, "Score"),
      el("th", { style: "width: 170px;" }, "Verdict"),
      el("th", {}, "Pull Request"),
      el("th", { style: "width: 160px;" }, "Author")
    ])
  ]));

  const tbody = el("tbody");

  if (rows.length === 0) {
    tbody.appendChild(el("tr", {}, [
      el("td", { colspan: "4", style: "text-align: center; padding: 36px; color: var(--text-tertiary);" }, "No open pull requests found in this repository.")
    ]));
  } else {
    for (const r of rows) {
      if (r.error) {
        tbody.appendChild(el("tr", {}, [
          el("td", { class: "q-score-cell", style: "color: var(--text-tertiary);" }, "–"),
          el("td", {}, "–"),
          el("td", {}, [
            el("div", { class: "q-pr-title-row" }, [
              el("span", { class: "q-pr-num" }, `#${r.number}`),
              el("span", { class: "q-pr-title" }, r.title)
            ]),
            el("div", { class: "finding-fix" }, r.error)
          ]),
          el("td", {}, "")
        ]));
        continue;
      }

      const rowRef = `${queueData.owner}/${queueData.repo}#${r.number}`;

      const titleRowChildren = [
        el("span", { class: "q-pr-num" }, `#${r.number}`),
        el("span", { class: "q-pr-title" }, r.title)
      ];

      if (r.draft) {
        titleRowChildren.push(el("span", { class: "q-draft-pill" }, "draft"));
      }

      const issuesText = (Array.isArray(r.top_issues) && r.top_issues.length > 0)
        ? r.top_issues.join("  ·  ")
        : "No immediate issues detected by fast checks";

      const tr = el("tr", {
        tabindex: "0",
        role: "button",
        "aria-label": `Open report for PR #${r.number}: ${r.title}`,
        dataset: { ref: rowRef }
      }, [
        el("td", { class: `q-score-cell tally-item-${r.verdict === "ready" ? "pass" : r.verdict === "needs-work" ? "warn" : "fail"}` }, r.score ?? "–"),
        el("td", {}, [
          el("span", { class: `q-verdict-chip ${r.verdict}` }, VERDICT_LABELS[r.verdict] || r.verdict)
        ]),
        el("td", {}, [
          el("div", { class: "q-pr-title-row" }, titleRowChildren),
          el("div", { class: "q-issues-summary" }, issuesText)
        ]),
        el("td", { class: "q-author-cell" }, `@${r.author || "unknown"}`)
      ]);

      const openItem = () => {
        $("target").value = rowRef;
        updateClearBtnVisibility();
        startNavigation(rowRef, true);
      };

      tr.addEventListener("click", openItem);
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openItem();
        }
      });

      tbody.appendChild(tr);
    }
  }

  table.appendChild(tbody);

  const tableContainer = el("div", { class: "queue-table-container" }, [table]);
  queueContainer.appendChild(tableContainer);
}

// ==========================================================================
// INPUT CONTROLS & CLEAR BUTTON
// ==========================================================================

function updateClearBtnVisibility() {
  const input = $("target");
  const clearBtn = $("clear-btn");
  if (clearBtn && input) {
    clearBtn.hidden = !input.value;
  }
}

// ==========================================================================
// INITIALIZATION & EVENT BINDINGS
// ==========================================================================

function initApp() {
  const form = $("form");
  const targetInput = $("target");
  const clearBtn = $("clear-btn");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      startNavigation(targetInput.value, true);
    });
  }

  if (targetInput) {
    targetInput.addEventListener("input", updateClearBtnVisibility);
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      targetInput.value = "";
      updateClearBtnVisibility();
      targetInput.focus();
    });
  }

  // Keyboard shortcut: Pressing / or Cmd+K / Ctrl+K focuses search
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      targetInput.focus();
      targetInput.select();
    } else if (e.key === "/" && document.activeElement !== targetInput && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      targetInput.focus();
      targetInput.select();
    }
  });

  window.addEventListener("popstate", handleUrlState);

  renderExamples();
  loadHealth().then(handleUrlState);
}

// Boot on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
