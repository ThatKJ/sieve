// Sieve Workspace — PR Control Center
// Live GitHub state for one PR plus human-confirmed lifecycle actions, rendered inside PR Intelligence.
// Every write: form -> explicit confirmation panel -> PR_ACTION (service worker -> engine -> GitHub) -> GitHub-confirmed result.
// Availability and reasons come from the engine (sieve/actions.py); this file never decides on its own that an action is allowed.
// All GitHub text is set through textContent (el()).

window.SievePRControls = (function () {
  "use strict";

  const MODE = {
    write: ["Write access", "pass"], read_only: ["Read-only mode", "warn"], no_token: ["No GitHub token", "fail"],
    offline: ["Offline", "warn"], auth_expired: ["Authentication expired", "fail"], token_read_only: ["Token is read-only", "warn"],
  };
  const METHOD = { merge: "Create a merge commit", squash: "Squash and merge", rebase: "Rebase and merge" };
  const REVIEW = { approve: "Approve", request_changes: "Request changes", review_comment: "Comment (no verdict)" };

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

  const defaultSend = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (res) => resolve(res || { ok: false, error: "No response from the Sieve service worker." })); }
    catch (err) { resolve({ ok: false, error: "Sieve was reloaded or updated. Refresh this tab to reconnect." }); }
  });
  const requestId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const ghLink = (href, text) => (typeof href === "string" && /^https:\/\/github\.com\//.test(href)
    ? el("a", { href, target: "_blank", rel: "noopener", class: "sieve-ws-link", text }) : null);
  const list = (v) => String(v || "").split(/[\s,]+/).map((x) => x.replace(/^@/, "")).filter(Boolean);

  // mount(container, prRef[, send]) loads live state and renders. Returns { reload }.
  function mount(container, prRef, send = defaultSend) {
    let c = null;
    let busy = false;
    let formsNode = null;
    const root = el("div", { class: "sieve-ctl", "aria-live": "polite" });
    container.replaceChildren(root);

    async function reload(notice) {
      root.replaceChildren(el("p", { class: "sieve-ws-sub", role: "status" }, [el("span", { class: "sieve-ws-spinner", "aria-hidden": "true" }), " Reading live state from GitHub…"]));
      const res = await send({ type: "GET_PR_CONTROLS", pr: prRef });
      if (!res.ok) {
        root.replaceChildren(el("div", { class: "sieve-ctl-msg fail", role: "alert" }, [
          el("strong", { text: "Couldn't load pull request controls" }), el("p", { text: res.error || "Unknown error" }),
          el("button", { type: "button", class: "btn-sieve", text: "Retry", onclick: () => reload() })]));
        return;
      }
      c = res.data;
      render(notice);
    }

    const reason = (action) => (c.available[action] ? c.available[action].reason : null);

    // A button that opens the confirmation for `action`, or is disabled with the engine's reason shown beside it.
    function actionButton(label, action, spec, primary) {
      const why = reason(action);
      const btn = el("button", { type: "button", class: `btn-sieve${primary ? " primary" : ""}`, text: label, disabled: Boolean(why) || busy,
        "data-action": action, "aria-describedby": why ? `sieve-why-${action}` : null,
        onclick: () => { const s = spec(); if (s) confirm(action, s); } });
      return el("div", { class: "sieve-ctl-act" }, [btn, why ? el("span", { class: "sieve-ctl-why", id: `sieve-why-${action}`, text: why }) : null]);
    }

    function readiness() {
      const m = c.merge, pr = c.pr, a = c.access;
      const failing = m.checks.filter((x) => x.required && x.state !== "pass");
      const rows = [
        ["State", `${pr.state}${pr.draft ? " · draft" : ""} · ${pr.head} → ${pr.base} @ ${pr.head_sha.slice(0, 7)}`],
        ["Mergeable", `${m.mergeable.toLowerCase()} · ${m.state_text}`],
        ["Reviews", `${m.review_decision ? m.review_decision.toLowerCase().replaceAll("_", " ") : "no review requirement reported"}` +
          (c.reviews.length ? ` · ${c.reviews.map((r) => `${r.login}: ${r.state.toLowerCase().replaceAll("_", " ")}`).join(", ")}` : "") +
          (c.requested_reviewers.length ? ` · waiting on ${c.requested_reviewers.join(", ")}` : "")],
        ["Checks", m.checks.length ? `${(m.checks_state || "").toLowerCase()} · ${m.checks.filter((x) => x.required).length} required` +
          (failing.length ? ` · not passing: ${failing.map((x) => x.name).join(", ")}` : "") : "none reported"],
        ["Merge queue", m.queue.enabled ? (m.queue.queued ? `queued (${m.queue.state || "?"}, position ${m.queue.position ?? "?"})` : "required, not queued") : "not used"],
        ["Labels", c.labels.join(", ") || "none"], ["Assignees", c.assignees.join(", ") || "none"],
        ["Milestone", c.milestone ? c.milestone.title : "none"],
        ["You", `${c.viewer.login || "?"} · ${c.viewer.permission.toLowerCase()} access`],
        ["Sieve access", `${(MODE[a.mode] || [a.mode])[0]} · token from ${a.source}${a.write_capable ? ` · token write: ${a.write_capable}` : ""}`],
      ];
      return el("dl", { class: "sieve-ctl-state" }, rows.map(([k, v]) => el("div", {}, [el("dt", { text: k }), el("dd", { text: v })])));
    }

    function forms() {
      const pr = c.pr;
      const reviewType = el("select", { "aria-label": "Review type" }, Object.entries(REVIEW).map(([v, t]) => el("option", { value: v, text: t })));
      const reviewBody = el("textarea", { class: "sieve-composer-area", rows: "3", "aria-label": "Review message", placeholder: "Review message (required to request changes or comment)" });
      const method = el("select", { "aria-label": "Merge method" }, c.merge.methods.map((v) => el("option", { value: v, text: METHOD[v] })));
      const closeBody = el("input", { type: "text", class: "sieve-ctl-input", "aria-label": "Optional closing comment", placeholder: "Optional closing comment" });
      const commentBody = el("textarea", { class: "sieve-composer-area", rows: "3", "aria-label": "Comment", placeholder: "Comment on the conversation" });
      const reviewBtnHost = el("div");
      const drawReviewBtn = () => reviewBtnHost.replaceChildren(actionButton("Submit review…", reviewType.value, () => {
        const t = reviewType.value, body = reviewBody.value;
        if (t !== "approve" && !body.trim()) { reviewBody.focus(); return null; }
        return { params: { body }, lines: [`Review: ${REVIEW[t]}`, `On commit ${pr.head_sha.slice(0, 7)}`, body.trim() ? `Message: ${body}` : "No message"] };
      }, true));
      reviewType.addEventListener("change", drawReviewBtn);
      drawReviewBtn();

      return el("div", { class: "sieve-ctl-forms" }, [
        el("h4", { text: "Review" }), reviewType, reviewBody, reviewBtnHost,
        el("h4", { text: "Merge" }), c.merge.methods.length ? method : null,
        actionButton("Merge…", "merge", () => ({ params: { method: method.value }, lines: [
          `Method: ${METHOD[method.value]}`, `Head commit: ${pr.head_sha.slice(0, 7)} (refused if it changes before GitHub merges)`,
          `GitHub says: ${c.merge.state_text}`, `Checks: ${(c.merge.checks_state || "none").toLowerCase()}`] }), true),
        el("h4", { text: "Close" }), closeBody,
        actionButton("Close pull request…", "close", () => ({ params: { body: closeBody.value }, lines: [
          closeBody.value.trim() ? `Closing comment: ${closeBody.value}` : "No closing comment", "The branch will not be deleted."] })),
        el("h4", { text: "Comment" }), commentBody,
        actionButton("Comment…", "comment", () => (commentBody.value.trim() ? { params: { body: commentBody.value }, lines: [`Comment: ${commentBody.value}`] } : (commentBody.focus(), null))),
        el("details", { class: "sieve-ctl-more" }, [el("summary", { text: "More actions" }), ...moreForms()]),
      ]);
    }

    function moreForms() {
      const pr = c.pr;
      const labelSel = el("select", { "aria-label": "Label" }, c.repo_labels.map((n) => el("option", { value: n, text: n })));
      const people = (key, addAction, removeAction, current, noun) => {
        const input = el("input", { type: "text", class: "sieve-ctl-input", "aria-label": `${noun} usernames`, placeholder: `${noun}: username, username` });
        const spec = (verb) => () => (list(input.value).length
          ? { params: { [key]: list(input.value) }, lines: [`${verb}: ${list(input.value).join(", ")}`, `Currently: ${current.join(", ") || "none"}`] }
          : (input.focus(), null));
        return el("div", { class: "sieve-ctl-row" }, [input, actionButton("Add…", addAction, spec(`Add ${noun.toLowerCase()}`)),
          actionButton("Remove…", removeAction, spec(`Remove ${noun.toLowerCase()}`))]);
      };
      const msSel = el("select", { "aria-label": "Milestone" }, c.repo_milestones.map((m) => el("option", { value: String(m.number), text: m.title })));
      const files = c.files || [];
      const fileSel = el("select", { "aria-label": "Changed file" }, files.map((f) => el("option", { value: f.path, text: f.path })));
      const side = el("select", { "aria-label": "Diff side" }, [el("option", { value: "RIGHT", text: "New file" }), el("option", { value: "LEFT", text: "Old file" })]);
      const line = el("input", { type: "number", min: "1", class: "sieve-ctl-input", "aria-label": "Line number", placeholder: "Line" });
      const rangeHint = el("span", { class: "sieve-ctl-why" });
      const showRange = () => { const f = files.find((x) => x.path === fileSel.value); rangeHint.textContent = f ? `Commentable lines: ${(side.value === "RIGHT" ? f.right : f.left) || "none"}` : ""; };
      fileSel.addEventListener("change", showRange);
      side.addEventListener("change", showRange);
      showRange();
      const inlineBody = el("textarea", { class: "sieve-composer-area", rows: "2", "aria-label": "Line comment", placeholder: "Line comment" });
      return [
        el("div", { class: "sieve-ctl-row" }, [
          pr.state !== "open" ? actionButton("Reopen…", "reopen", () => ({ params: {}, lines: ["Reopen this pull request."] })) : null,
          pr.draft ? actionButton("Ready for review…", "ready_for_review", () => ({ params: {}, lines: ["Mark as ready for review."] }))
            : actionButton("Convert to draft…", "convert_to_draft", () => ({ params: {}, lines: ["Convert back to a draft."] })),
          actionButton("Update branch…", "update_branch", () => ({ params: {}, lines: [`Merge ${pr.base} into ${pr.head} on GitHub.`] }))]),
        el("h4", { text: "Labels" }),
        el("div", { class: "sieve-ctl-row" }, [labelSel,
          actionButton("Add label…", "add_labels", () => (labelSel.value ? { params: { labels: [labelSel.value] }, lines: [`Add label: ${labelSel.value}`] } : null)),
          actionButton("Remove label…", "remove_labels", () => (labelSel.value ? { params: { labels: [labelSel.value] }, lines: [`Remove label: ${labelSel.value}`] } : null))]),
        el("h4", { text: "Assignees" }), people("assignees", "add_assignees", "remove_assignees", c.assignees, "Assignees"),
        el("h4", { text: "Reviewers" }), people("reviewers", "request_reviewers", "remove_reviewers", c.requested_reviewers, "Reviewers"),
        el("h4", { text: "Milestone" }),
        el("div", { class: "sieve-ctl-row" }, [c.repo_milestones.length ? msSel : el("span", { class: "sieve-ctl-why", text: "No open milestones in this repository." }),
          c.repo_milestones.length ? actionButton("Set…", "set_milestone", () => ({ params: { milestone: Number(msSel.value) }, lines: [`Set milestone: ${msSel.selectedOptions[0]?.textContent}`] })) : null,
          actionButton("Clear…", "clear_milestone", () => ({ params: {}, lines: [`Clear milestone ${c.milestone?.title || ""}`] }))]),
        el("h4", { text: "Line comment" }),
        files.length ? el("div", { class: "sieve-ctl-row" }, [fileSel, side, line]) : null, files.length ? rangeHint : null, inlineBody,
        actionButton("Comment on line…", "inline_comment", () => {
          const n = Number(line.value);
          if (!fileSel.value || !Number.isInteger(n) || n < 1 || !inlineBody.value.trim()) { (n >= 1 ? inlineBody : line).focus(); return null; }
          return { params: { path: fileSel.value, line: n, side: side.value, body: inlineBody.value },
            lines: [`${fileSel.value}:${n} (${side.value === "RIGHT" ? "new" : "old"} file) at ${pr.head_sha.slice(0, 7)}`, `Comment: ${inlineBody.value}`,
              "The engine re-checks that this line is in the current diff before posting."] };
        }),
      ];
    }

    function render(notice) {
      formsNode = forms();
      root.replaceChildren(...[notice, readiness(), formsNode].filter(Boolean));
    }

    function confirm(action, spec) {
      const pr = c.pr;
      const rid = requestId(); // one per confirmation: the engine accepts it once
      const status = el("div", { role: "status" });
      const yes = el("button", { type: "button", class: "btn-sieve primary", "data-confirm": action, text: `Confirm: ${action.replaceAll("_", " ")}` });
      // Back restores the untouched form node, so typed text survives a cancel or a failure.
      const back = el("button", { type: "button", class: "btn-sieve", text: "Cancel", onclick: () => root.replaceChildren(readiness(), formsNode) });
      root.replaceChildren(el("div", { class: "sieve-ctl-confirm", role: "group", "aria-label": "Confirm GitHub action" }, [
        el("strong", { text: `${pr.owner}/${pr.repo} #${pr.number}: ${pr.title}` }),
        el("ul", {}, [`Action: ${action.replaceAll("_", " ")}`, ...spec.lines].map((t) => el("li", { text: t }))),
        el("p", { class: "sieve-ws-hint", text: "Sent to GitHub as you, only after you confirm. Nothing is shown as done until GitHub confirms it." }),
        el("div", { class: "sieve-ws-actions" }, [yes, back]), status,
      ]));
      yes.addEventListener("click", async () => {
        if (busy) return; // duplicate clicks while in flight are ignored
        busy = true;
        yes.disabled = true;
        back.disabled = true;
        yes.textContent = "Sending to GitHub…";
        const res = await send({ type: "PR_ACTION", pr: `${pr.owner}/${pr.repo}#${pr.number}`, action, params: spec.params,
          expected_head_sha: pr.head_sha, request_id: rid });
        busy = false;
        if (!res.ok) {
          yes.textContent = "Not applied";
          back.disabled = false;
          back.textContent = "Back";
          status.replaceChildren(el("div", { class: "sieve-ctl-msg fail", role: "alert" }, [
            el("strong", { text: "GitHub did not apply this" }), el("p", { text: res.error || "Unknown error" }),
            el("button", { type: "button", class: "btn-sieve", text: "Reload live state", onclick: () => reload() })]));
          return;
        }
        const d = res.data;
        const note = el("div", { class: `sieve-ctl-msg ${d.verified === false ? "warn" : "pass"}`, role: "status" }, [
          el("strong", { text: d.message }),
          el("p", { text: d.verified === true ? "Verified: GitHub now shows this change." : d.verified === false
            ? "GitHub accepted the request, but its state does not show the change yet. Reload to check." : "GitHub accepted the request." }),
          ghLink(d.evidence, "View on GitHub ↗")]);
        if (d.controls) { c = d.controls; render(note); } else reload(note);
      });
      yes.focus();
    }

    reload();
    return { reload };
  }

  return { mount };
})();
