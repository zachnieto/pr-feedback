// Numbered pins on the page for points captured on this URL, and PRF.showOnPage(point).
// A point's document position is rect + scroll; pins sit at its top-left corner.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("pins")) return;
  PRF.loaded.add("pins");
  const { h } = PRF;
  const SHOW_KEY = "prf-show-point";

  let layer, draftLayer;
  let placed = []; // [element, shot] pairs kept in sync with the scroll position
  let draftPlaced = [];
  let flash = null; // { el, point }
  let frame = 0;

  const pageOf = PRF.pageOf;
  const docRect = ({ rect, scroll }) => ({ x: rect.x + (scroll?.x ?? 0), y: rect.y + (scroll?.y ?? 0), width: rect.width, height: rect.height });
  const toViewport = (r) => ({ ...r, x: r.x - scrollX, y: r.y - scrollY });

  function sync() {
    frame = 0;
    for (const [el, p] of placed) {
      const r = toViewport(docRect(p));
      Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px` });
    }
    if (flash) PRF.place(flash.el, toViewport(docRect(flash.point)), 4);
    for (const [el, shot] of draftPlaced) PRF.place(el, PRF.viewportRect(shot), 2);
  }
  const schedule = () => (frame ||= requestAnimationFrame(sync));
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  // SPA route changes swap which points belong to this page.
  window.navigation?.addEventListener("currententrychange", () => PRF.renderPins(PRF.session));

  let checkedShow = false;
  PRF.renderPins = (s) => {
    const here = pageOf(location.href);
    const marks = [];
    (s?.points ?? []).forEach((p, i) => {
      PRF.captures(p).forEach((c) => {
        if (pageOf(c.url) === here) marks.push({ c, n: i + 1, point: p });
      });
    });
    if (!marks.length) {
      layer?.remove();
      layer = null;
      placed = [];
    } else {
      layer ??= PRF.root().appendChild(h("div", { className: "pins" }));
      // Click-through while picking so pins never swallow the pick.
      layer.classList.toggle("passive", !!PRF.mode);
      placed = marks.map(({ c, n, point }) => [
        h("button", {
          className: "pin",
          textContent: n,
          title: point.comment,
          ariaLabel: `Point ${n}`,
          onclick: () => {
            PRF.stopMode();
            PRF.setPanel("points");
          },
        }),
        c,
      ]);
      layer.replaceChildren(...placed.map(([el]) => el));
    }
    // Hidden while the comment box draws its own outlines, so the two don't stack.
    const drafts = PRF.composing ? [] : (s?.draft ?? []).map((c, i) => ({ c, i })).filter(({ c }) => pageOf(c.url) === here);
    if (!drafts.length) {
      draftLayer?.remove();
      draftLayer = null;
      draftPlaced = [];
    } else {
      draftLayer ??= PRF.root().appendChild(h("div", { className: "drafts" }));
      draftPlaced = drafts.map(({ c, i }) => [
        h(
          "div",
          { className: "box" },
          h("button", {
            className: "mark",
            textContent: i + 1,
            title: "Remove from this point",
            ariaLabel: `Remove selection ${i + 1}`,
            onclick: () => PRF.send({ type: "removeCapture", index: i }).catch((e) => PRF.toast(e.message, { error: true })),
          }),
        ),
        c,
      ]);
      draftLayer.replaceChildren(...draftPlaced.map(([el]) => el));
      // Above the region-drag layer, which covers the viewport and would swallow the remove buttons.
      PRF.root().append(draftLayer);
    }
    if (marks.length || drafts.length) sync();
    if (s && !checkedShow) {
      checkedShow = true;
      const id = sessionStorage.getItem(SHOW_KEY);
      sessionStorage.removeItem(SHOW_KEY);
      const point = id && s.points.find((p) => p.id === id);
      if (point) PRF.showOnPage(point);
    }
  };
  PRF.onRender((s) => PRF.renderPins(s));

  PRF.showOnPage = (point) => {
    const shots = PRF.captures(point);
    const here = pageOf(location.href);
    const shot = shots.find((c) => pageOf(c.url) === here) ?? shots[0];
    if (!shot) return;
    if (pageOf(shot.url) !== here) {
      // ponytail: sessionStorage is per origin, so a point on another origin opens without the flash
      sessionStorage.setItem(SHOW_KEY, point.id);
      location.href = shot.url;
      return;
    }
    PRF.setPanel(null);
    const r = docRect(shot);
    scrollTo({ left: r.x + r.width / 2 - innerWidth / 2, top: r.y + r.height / 2 - innerHeight / 2, behavior: "smooth" });
    flash?.el.remove();
    const el = PRF.root().appendChild(h("div", { className: "flash" }));
    flash = { el, point: shot };
    sync();
    setTimeout(() => {
      el.remove();
      if (flash?.el === el) flash = null;
    }, 1500);
  };

  PRF.styles.push(`
    .pins { position: fixed; inset: 0; pointer-events: none; }
    .pin { position: absolute; width: 24px; height: 24px; transform: translate(-50%, -50%); border: 2px solid #fff; border-radius: 12px;
      background: #4c8dff; color: #fff; font-size: 11px; font-weight: 700; box-shadow: 0 2px 6px rgba(0,0,0,.25); pointer-events: auto; }
    .pins.passive .pin { pointer-events: none; }
    .box { position: fixed; border: 2px solid #4c8dff; border-radius: 6px; background: rgba(76,141,255,.12); pointer-events: none; }
    .mark { position: absolute; top: 0; left: 0; width: 22px; height: 22px; transform: translate(-50%, -50%); border: 2px solid #fff; border-radius: 11px;
      background: #4c8dff; color: #fff; font-size: 11px; font-weight: 700; box-shadow: 0 2px 6px rgba(0,0,0,.25); pointer-events: auto; }
    .flash { position: fixed; border: 2px solid #4c8dff; border-radius: 8px; background: rgba(76,141,255,.12); pointer-events: none;
      animation: prf-flash 1.5s ease-out forwards; }
    @keyframes prf-flash { 0%, 60% { opacity: 1; } 100% { opacity: 0; } }
  `);
})();
