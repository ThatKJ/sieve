// Repository Atlas renderer: a 2.5D import graph on a tilted plane, drawn on <canvas>.
// No libraries. Files are clustered by directory; height = number of files importing it (fan-in).
// Every edge drawn comes from an import statement the backend found; nothing is invented here.
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const GOLDEN = 2.39996323;
  const COLORS = { ink: [29, 29, 31], signal: [47, 91, 234], fail: [180, 35, 24], pass: [30, 122, 76] };
  const ROLE_ORDER = ["added", "modified", "renamed", "removed", "direct", "indirect", "test-inferred", "dependency"];
  const CHANGED = new Set(["added", "modified", "renamed", "removed"]);
  // when each role appears during the impact ripple (0..1): change first, then direct, then indirect
  const RIPPLE_STAGE = { added: 0, modified: 0, renamed: 0, removed: 0, direct: 0.35, dependency: 0.35, indirect: 0.65, "test-inferred": 0.65 };
  const RIPPLE_MS = 1100;
  const MAX_LABELS = 60;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const lerp = (a, b, t) => a + (b - a) * t;
  const basename = (p) => p.split("/").pop();

  // Cluster files by directory; place clusters on a spiral without overlap, files in a sunflower inside.
  function layout(nodes) {
    const groups = new Map();
    for (const n of nodes) {
      const key = n.dir || "(root)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }
    const SPACING = 14;
    const clusters = [...groups.entries()].map(([dir, items]) => {
      items.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
      return { dir, items, r: Math.sqrt(items.length) * SPACING + 26, x: 0, y: 0 };
    });
    clusters.sort((a, b) => b.items.length - a.items.length || a.dir.localeCompare(b.dir));
    const placed = [];
    for (const c of clusters) {
      for (let i = 0; placed.length && i < 20000; i++) {
        const ang = i * GOLDEN, rad = Math.sqrt(i) * 22;
        const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + c.r + 10)) { c.x = x; c.y = y; break; }
      }
      placed.push(c);
      c.items.forEach((n, i) => {
        const rad = Math.sqrt(i + 0.5) * SPACING, ang = i * GOLDEN;
        n.x = c.x + Math.cos(ang) * rad;
        n.y = c.y + Math.sin(ang) * rad;
      });
    }
    return clusters;
  }

  function create(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    const HOME = { yaw: -0.5, pitch: 0.92, ox: 0, oy: 0 };
    const state = {
      nodes: [], byId: new Map(), edges: [], clusters: [],
      impact: null, mode: "structure", selected: null, hover: null, query: "", isolate: false,
      cam: { ...HOME, zoom: 1, tx: 0, ty: 0 }, goal: null,
      ripple: 1, rippleStart: 0, w: 0, h: 0, dpr: 1, projected: [], raf: 0,
    };

    // ------------------------------------------------------------ data
    function setData(graph, impact) {
      state.nodes = graph.nodes.map((n) => ({ ...n }));
      state.byId = new Map(state.nodes.map((n) => [n.id, n]));
      state.edges = graph.edges.filter((e) => state.byId.has(e.source) && state.byId.has(e.target));
      const fanIn = new Map();
      for (const e of state.edges) fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1);
      for (const n of state.nodes) {
        n.fanIn = fanIn.get(n.id) || 0;
        n.z = Math.min(70, Math.sqrt(n.fanIn) * 14);
        n.r = 2.6 + Math.min(5, Math.sqrt(n.degree || 0) * 0.9);
        n.role = impact?.marks?.[n.id]?.role || null;
      }
      state.clusters = layout(state.nodes);
      state.impact = impact || null;
      state.mode = impact ? "impact" : "structure";
      state.selected = null;
      fit(true);
      startRipple();
    }

    function startRipple() {
      state.ripple = state.impact && !reducedMotion() ? 0 : 1;
      state.rippleStart = performance.now();
      invalidate();
    }

    // ------------------------------------------------------------ camera
    function focusSet() {
      const impacted = state.mode === "impact" && state.impact ? state.nodes.filter((n) => n.role) : [];
      return impacted.length ? impacted : state.nodes;
    }

    function bounds(list) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of list) {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      }
      return { minX, maxX, minY, maxY };
    }

    function fit(instant) {
      if (!state.nodes.length || !state.w) return;
      // measure the projected footprint at zoom 1 from the home angle, then scale to fit the stage
      const list = focusSet();
      const b = bounds(list);
      const saved = { ...state.cam };
      Object.assign(state.cam, HOME, { zoom: 1, tx: (b.minX + b.maxX) / 2, ty: (b.minY + b.maxY) / 2 });
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const grow = (p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); };
      for (const n of list) { grow(project(n.x, n.y, 0)); grow(project(n.x, n.y, n.z)); }
      if (list === state.nodes) { // whole repo: include the directory islands, not just the files
        for (const c of state.clusters) for (let i = 0; i < 8; i++) grow(project(c.x + Math.cos(i * TAU / 8) * c.r, c.y + Math.sin(i * TAU / 8) * c.r, 0));
      }
      // fit inside the area the floating controls leave free (left inset), with a margin
      const inset = opts.leftInset?.() || 0;
      const availW = state.w - inset, availH = state.h;
      const zoom = Math.max(0.2, Math.min(3, Math.min((availW * 0.86) / Math.max(x1 - x0, 60), (availH * 0.84) / Math.max(y1 - y0, 60))));
      const goal = { ...state.cam, zoom, ox: (x0 + x1) / 2 - state.w / 2 - inset / 2 / zoom, oy: (y0 + y1) / 2 - state.h * 0.52 };
      Object.assign(state.cam, saved);
      if (instant) { Object.assign(state.cam, goal); state.goal = null; } else state.goal = goal;
      invalidate();
    }

    function project(x, y, z) {
      const c = state.cam;
      const dx = x - c.tx, dy = y - c.ty;
      const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
      const x1 = dx * cy - dy * sy, y1 = dx * sy + dy * cy;
      const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
      const toward = y1 * sp + z * cp; // distance towards the viewer, used for perspective and draw order
      const D = 900; // fixed camera distance: perspective is independent of zoom, so fit() measurements hold
      const s = D / Math.max(80, D - toward);
      return { x: state.w / 2 + (x1 * s - c.ox) * c.zoom, y: state.h * 0.52 + ((y1 * cp - z * sp) * s - c.oy) * c.zoom, s, depth: toward };
    }

    // ------------------------------------------------------------ styling
    function neighbours(n) {
      if (!n._nb) {
        n._nb = new Set();
        for (const e of state.edges) {
          if (e.source === n.id) n._nb.add(e.target);
          if (e.target === n.id) n._nb.add(e.source);
        }
      }
      return n._nb;
    }

    const FADED = { a: 0.13, c: COLORS.ink, fill: true };

    function nodeStyle(n) {
      const sel = state.selected;
      if (state.query && !n.id.toLowerCase().includes(state.query)) return { ...FADED, a: 0.08 };
      if (sel && state.isolate && sel !== n && !neighbours(sel).has(n.id)) return { ...FADED, a: 0.05 };
      if (state.mode === "impact" && state.impact) {
        if (!n.role || state.ripple < RIPPLE_STAGE[n.role]) return FADED;
        switch (n.role) {
          case "removed": return { a: 1, c: COLORS.fail, fill: false, ring: true };
          case "direct": return { a: 0.85, c: COLORS.signal, fill: true };
          case "indirect": return { a: 0.6, c: COLORS.signal, fill: false, ring: true };
          case "dependency": return { a: 0.55, c: COLORS.ink, fill: false, ring: true };
          case "test-inferred": return { a: 0.7, c: COLORS.pass, fill: false, ring: true, dashed: true };
          default: return { a: 1, c: COLORS.signal, fill: true, halo: true }; // added / modified / renamed
        }
      }
      return n.test ? { a: 0.5, c: COLORS.pass, fill: false, ring: true } : { a: 0.78, c: COLORS.ink, fill: true };
    }

    function edgeHighlighted(e) {
      const sel = state.selected;
      if (sel) return e.source === sel.id || e.target === sel.id;
      if (state.mode === "impact" && state.impact) {
        const a = state.byId.get(e.source).role, b = state.byId.get(e.target).role;
        return Boolean(a && b) && state.ripple >= Math.max(RIPPLE_STAGE[a], RIPPLE_STAGE[b]);
      }
      return false;
    }

    // ------------------------------------------------------------ drawing
    function drawPlane() {
      // the sieve mesh: a dot grid on the ground plane, sparse enough to read as material, not noise
      const b = bounds(state.nodes);
      const pad = 140, step = 28;
      ctx.fillStyle = rgba(COLORS.ink, 0.12);
      for (let x = Math.floor((b.minX - pad) / step) * step; x <= b.maxX + pad; x += step) {
        for (let y = Math.floor((b.minY - pad) / step) * step; y <= b.maxY + pad; y += step) {
          const p = project(x, y, 0);
          const r = Math.max(0.6, Math.min(2, 0.9 * p.s * state.cam.zoom));
          ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
        }
      }
    }

    function drawClusters() {
      ctx.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      for (const c of state.clusters) {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * TAU;
          const p = project(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, 0);
          if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
        }
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fill();
        ctx.strokeStyle = rgba(COLORS.ink, 0.1);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (c.items.length >= 2 || state.clusters.length < 30) {
          const label = project(c.x, c.y + c.r + 12, 0);
          ctx.fillStyle = rgba(COLORS.ink, 0.6);
          // last segment only: nested paths like examples/complex/complex/commands collide otherwise
          const parts = c.dir.split("/");
          ctx.fillText(c.dir === "(root)" ? "/" : parts.length > 1 ? `…/${parts.at(-1)}/` : `${c.dir}/`, label.x, label.y);
        }
      }
    }

    function drawEdges() {
      const focused = Boolean(state.selected) || (state.mode === "impact" && state.impact);
      const dense = state.edges.length > 400;
      for (const e of state.edges) {
        const hi = edgeHighlighted(e);
        if (focused && !hi) continue;
        const a = state.byId.get(e.source), b = state.byId.get(e.target);
        const pa = project(a.x, a.y, a.z), pb = project(b.x, b.y, b.z);
        const lift = Math.hypot(a.x - b.x, a.y - b.y) * 0.1 + Math.max(a.z, b.z) + 6;
        const pm = project((a.x + b.x) / 2, (a.y + b.y) / 2, lift);
        const cx = pm.x * 2 - (pa.x + pb.x) / 2, cy = pm.y * 2 - (pa.y + pb.y) / 2;
        let color = COLORS.ink, alpha = dense ? 0.05 : 0.12, width = 1;
        if (state.selected) {
          color = e.target === state.selected.id ? COLORS.signal : COLORS.ink; // blue = something imports the selection
          alpha = 0.75; width = 1.6;
        } else if (hi) {
          color = COLORS.signal; alpha = 0.5; width = 1.4;
        }
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
        ctx.strokeStyle = rgba(color, alpha);
        ctx.lineWidth = width;
        ctx.stroke();
        if (state.selected) { // arrowhead: importer -> imported
          const ang = Math.atan2(pb.y - cy, pb.x - cx);
          ctx.beginPath();
          ctx.moveTo(pb.x, pb.y);
          ctx.lineTo(pb.x - 7 * Math.cos(ang - 0.4), pb.y - 7 * Math.sin(ang - 0.4));
          ctx.lineTo(pb.x - 7 * Math.cos(ang + 0.4), pb.y - 7 * Math.sin(ang + 0.4));
          ctx.closePath();
          ctx.fillStyle = rgba(color, alpha);
          ctx.fill();
        }
      }
    }

    function drawNodes(now) {
      state.projected = state.nodes.map((n) => ({ n, p: project(n.x, n.y, n.z), g: project(n.x, n.y, 0) }));
      state.projected.sort((a, b) => a.p.depth - b.p.depth);
      for (const { n, p, g } of state.projected) {
        const st = nodeStyle(n);
        const r = n.r * Math.max(0.6, Math.min(2.2, p.s * Math.sqrt(state.cam.zoom)));
        p.r = r;
        if (n.z > 4 && st.a > 0.2) { // stem to the plane makes height (fan-in) legible
          ctx.beginPath();
          ctx.moveTo(g.x, g.y);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = rgba(st.c, st.a * 0.35);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (st.halo && !reducedMotion()) {
          const pulse = (now / 1600) % 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3 + pulse * 14, 0, TAU);
          ctx.strokeStyle = rgba(st.c, 0.35 * (1 - pulse));
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        if (st.fill) {
          const grad = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
          grad.addColorStop(0, rgba([255, 255, 255], st.a * 0.9));
          grad.addColorStop(0.35, rgba(st.c, st.a));
          grad.addColorStop(1, rgba(st.c.map((v) => v * 0.7), st.a));
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.92)";
        }
        ctx.fill();
        if (st.ring) {
          ctx.setLineDash(st.dashed ? [2, 2] : []);
          ctx.strokeStyle = rgba(st.c, Math.max(st.a, 0.3));
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (state.selected === n || state.hover === n) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, TAU);
          ctx.strokeStyle = rgba(COLORS.ink, 0.9);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    function labelPriority(n) {
      const sel = state.selected;
      const shown = n.role && state.ripple >= (RIPPLE_STAGE[n.role] || 0);
      if (n === sel || n === state.hover) return 100;
      if (state.mode === "impact" && shown && CHANGED.has(n.role)) return 80;
      if (sel && neighbours(sel).has(n.id)) return 60;
      if (state.query && n.id.toLowerCase().includes(state.query)) return 50;
      if (state.mode === "impact" && shown && n.role === "direct") return 40;
      if (!sel && state.mode === "structure" && n.fanIn >= 3 && state.cam.zoom > 0.9) return 10 + n.fanIn;
      return 0;
    }

    function drawLabels() {
      const boxes = [];
      const want = state.projected.map(({ n, p }) => ({ n, p, pri: labelPriority(n) })).filter((w) => w.pri);
      want.sort((a, b) => b.pri - a.pri);
      ctx.font = "500 12px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
      ctx.textAlign = "left";
      for (const { n, p, pri } of want.slice(0, MAX_LABELS)) {
        const text = basename(n.id);
        const w = ctx.measureText(text).width + 12, h = 20;
        const x = p.x + p.r + 6, y = p.y - h / 2;
        if (pri < 100 && boxes.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y)) continue;
        boxes.push({ x, y, w, h });
        roundRect(x, y, w, h, 6);
        ctx.fillStyle = "rgba(255,255,255,0.94)";
        ctx.fill();
        ctx.strokeStyle = rgba(n.role === "removed" ? COLORS.fail : pri >= 80 ? COLORS.signal : COLORS.ink, pri >= 80 ? 0.55 : 0.14);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = rgba(COLORS.ink, 0.92);
        ctx.fillText(text, x + 6, y + 14);
      }
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function frame() {
      state.raf = 0;
      const now = performance.now();
      let animating = false;
      if (state.goal) {
        const c = state.cam, g = state.goal;
        for (const k of ["yaw", "pitch", "zoom", "tx", "ty", "ox", "oy"]) c[k] = lerp(c[k], g[k], 0.16);
        const settled = Math.abs(c.zoom - g.zoom) < 0.002 && Math.hypot(c.tx - g.tx, c.ty - g.ty) < 0.3 && Math.abs(c.yaw - g.yaw) < 0.002 && Math.abs(c.pitch - g.pitch) < 0.002;
        if (settled || reducedMotion()) { Object.assign(c, g); state.goal = null; } else animating = true;
      }
      if (state.ripple < 1) {
        state.ripple = Math.min(1, (now - state.rippleStart) / RIPPLE_MS);
        animating = true;
      }
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.clearRect(0, 0, state.w, state.h);
      if (state.nodes.length) {
        drawPlane();
        drawClusters();
        drawEdges();
        drawNodes(now);
        drawLabels();
      }
      const pulsing = state.mode === "impact" && state.impact && !reducedMotion() && state.nodes.some((n) => n.role && CHANGED.has(n.role) && n.role !== "removed");
      if (animating || pulsing) invalidate();
    }

    function invalidate() {
      if (!state.raf) state.raf = requestAnimationFrame(frame);
    }

    // ------------------------------------------------------------ interaction
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const first = !state.w;
      state.dpr = Math.min(2, window.devicePixelRatio || 1);
      state.w = rect.width; state.h = rect.height;
      canvas.width = Math.round(rect.width * state.dpr);
      canvas.height = Math.round(rect.height * state.dpr);
      if (first) fit(true);
      invalidate();
    }

    function pick(mx, my) {
      let best = null, bestD = Infinity;
      for (const { n, p } of state.projected) {
        if (nodeStyle(n).a < 0.1) continue;
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < Math.max(9, p.r + 4) && d < bestD) { best = n; bestD = d; }
      }
      return best;
    }

    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey || e.button === 2 };
    });
    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (!drag.moved) return;
        state.goal = null;
        const c = state.cam;
        if (drag.pan) {
          const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
          const wx = -dx / c.zoom, wy = -dy / (c.zoom * Math.cos(c.pitch));
          c.tx += wx * cs + wy * sn; c.ty += -wx * sn + wy * cs;
        } else {
          c.yaw += dx * 0.006;
          c.pitch = Math.max(0.12, Math.min(1.2, c.pitch + dy * 0.004));
        }
        drag.x = e.clientX; drag.y = e.clientY;
        invalidate();
        return;
      }
      const hit = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (hit !== state.hover) {
        state.hover = hit;
        canvas.style.cursor = hit ? "pointer" : "grab";
        invalidate();
      }
    });
    canvas.addEventListener("pointerup", (e) => {
      const rect = canvas.getBoundingClientRect();
      if (drag && !drag.moved) select(pick(e.clientX - rect.left, e.clientY - rect.top));
      drag = null;
    });
    canvas.addEventListener("pointerleave", () => { if (state.hover) { state.hover = null; invalidate(); } });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      state.goal = null;
      state.cam.zoom = Math.max(0.15, Math.min(8, state.cam.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
      invalidate();
    }, { passive: false });
    canvas.addEventListener("keydown", (e) => {
      const c = state.cam;
      const order = keyboardOrder();
      const idx = state.selected ? order.indexOf(state.selected) : -1;
      const zoomBy = (f) => { c.zoom = Math.max(0.15, Math.min(8, c.zoom * f)); };
      const keys = {
        ArrowRight: () => select(order[(idx + 1) % order.length]),
        ArrowLeft: () => select(order[(idx - 1 + order.length) % order.length]),
        ArrowUp: () => { c.pitch = Math.max(0.12, c.pitch - 0.08); },
        ArrowDown: () => { c.pitch = Math.min(1.2, c.pitch + 0.08); },
        "+": () => zoomBy(1.2), "=": () => zoomBy(1.2), "-": () => zoomBy(1 / 1.2),
        "[": () => { c.yaw -= 0.15; }, "]": () => { c.yaw += 0.15; },
        "0": () => reset(), Escape: () => select(null),
      };
      if (keys[e.key]) { e.preventDefault(); state.goal = null; keys[e.key](); invalidate(); }
    });
    new ResizeObserver(resize).observe(canvas);

    // arrow keys walk the impact first (in role order), then the rest by fan-in
    function keyboardOrder() {
      const rank = (n) => (n.role ? ROLE_ORDER.indexOf(n.role) : 99);
      return [...state.nodes].sort((a, b) => rank(a) - rank(b) || b.fanIn - a.fanIn || a.id.localeCompare(b.id));
    }

    function select(n) {
      state.selected = n || null;
      opts.onSelect?.(state.selected);
      if (n) { // centre the file in the area the inspector leaves visible
        const zoom = Math.max(state.cam.zoom, 1.6);
        state.goal = { ...state.cam, tx: n.x, ty: n.y, ox: (opts.focusInset?.() || 0) / 2 / zoom, oy: 0, zoom };
      }
      invalidate();
    }

    function reset() {
      state.selected = null;
      state.isolate = false;
      state.query = "";
      opts.onSelect?.(null);
      fit(false);
    }

    return {
      setData,
      reset,
      fit,
      replay: startRipple,
      select: (id) => select(state.byId.get(id) || null),
      setMode(mode) { state.mode = mode; select(null); fit(false); startRipple(); },
      setQuery(q) {
        state.query = (q || "").trim().toLowerCase();
        const hits = state.query ? state.nodes.filter((n) => n.id.toLowerCase().includes(state.query)) : [];
        if (hits.length === 1) select(hits[0]);
        invalidate();
        return hits.map((n) => n.id);
      },
      setIsolate(on) { state.isolate = on; invalidate(); },
      edgesOf: (id) => ({ out: state.edges.filter((e) => e.source === id), in: state.edges.filter((e) => e.target === id) }),
      node: (id) => state.byId.get(id),
      get mode() { return state.mode; },
    };
  }

  window.Atlas = { create };
})();
