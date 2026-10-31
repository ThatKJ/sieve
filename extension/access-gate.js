// Sieve Workspace — Maintainer access gate
// Sieve activates only when the signed-in GitHub account has admin, maintain or write permission on the
// repository being viewed. Anything else (triage, read, no access, signed out, an engine signed in as a
// different account, an error, or a check still in flight) means "do not mount". It fails closed.
//
// The permission itself comes from the local engine (GET /repos/{owner}/{repo} with its token). This
// module only decides, and keeps one decision per account+repository so a result is never reused for
// another repository or another account. The engine re-checks permission for every write on its own.

(function () {
  "use strict";

  const ELIGIBLE = new Set(["admin", "maintain", "write"]);

  // viewer: the login GitHub's page says is signed in (null when signed out).
  // res: the service worker's reply to GET_REPO_ACCESS ({ ok, data | error }).
  function decide(viewer, res) {
    if (!viewer) return { status: "signed_out" };
    if (!res || !res.ok) return { status: "error", error: (res && res.error) || "No response from the Sieve engine." };
    const d = res.data || {};
    if (d.status === "unauthenticated") return { status: "unauthenticated" };
    if (!d.login || d.login.toLowerCase() !== viewer.toLowerCase()) {
      // The engine's token belongs to someone else: its permission says nothing about this viewer.
      return { status: "account_mismatch", login: d.login || null, permission: d.permission || null };
    }
    const permission = typeof d.permission === "string" ? d.permission : "none";
    return { status: d.eligible === true && ELIGIBLE.has(permission) ? "granted" : "denied", login: d.login, permission };
  }

  // fetchAccess(repo, viewer, forceFresh) -> Promise<res>; onChange(decision) runs when a check settles.
  function createGate({ fetchAccess, onChange }) {
    let current = null;
    let seq = 0;

    function check(key, repo, viewer, forceFresh) {
      const mine = ++seq;
      Promise.resolve()
        .then(() => fetchAccess(repo, viewer, forceFresh))
        .catch((err) => ({ ok: false, error: err && err.message }))
        .then((res) => {
          if (mine !== seq) return; // navigated away, account changed, or reset: ignore the stale answer
          current = { key, repo, viewer, ...decide(viewer, res) };
          onChange(current);
        });
    }

    return {
      // The decision for this repository and account, starting a check when there is none yet.
      get(repo, viewer) {
        const key = `${(viewer || "").toLowerCase()}|${repo.toLowerCase()}`;
        if (current && current.key === key) {
          if (current.stale) { current.stale = false; check(key, repo, viewer, true); } // keep the old answer meanwhile
          return current;
        }
        seq++; // any check for a previous key is now stale
        if (!viewer) { current = { key, repo, viewer: null, ...decide(null) }; return current; }
        current = { key, repo, viewer, status: "checking" };
        check(key, repo, viewer, false);
        return current;
      },
      // Ask again on the next get(). retry=true drops the current answer (used after an error).
      refresh(retry = false) {
        if (!current) return;
        if (retry) { seq++; current = null; } else current.stale = true;
      },
      reset() { seq++; current = null; },
      current: () => current,
    };
  }

  window.SieveAccess = { ELIGIBLE, decide, createGate };
})();
