// Numbered pins on the page for points captured on this URL, and PRF.showOnPage(point).
// A point's document position is rect + scroll; pins sit at its top-left corner.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("pins")) return;
  PRF.loaded.add("pins");
  const { h } = PRF;
  const SHOW_KEY = "prf-show-point";

  let layer;
  let placed = []; // [element, point] pairs kept in sync with the scroll position
  let flash = null; // { el, point }
  let frame = 0;

  const pageOf = (url) => {
    const u = new URL(url);
    return u.origin + u.pathname + u.search;
  };
  const docRect = ({ rect, scroll }) => ({ x: rect.x + scroll.x, y: rect.y + scroll.y, width: rect.width, height: rect.height });
  const toViewport = (r) => ({ ...r, x: r.x - scrollX, y: r.y - scrollY });

  function sync() {
    frame = 0;
    for (const [el, p] of placed) {
      const r = toViewport(docRect(p));
      Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px` });
    }
    if (flash) PRF.place(flash.el, toViewport(docRect(flash.point)), 4);
  }
  const schedule = () => (frame ||= requestAnimationFrame(sync));
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  // SPA route changes swap which points belong to this page.
  window.navigation?.addEventListener("currententrychange", () => PRF.renderPins(PRF.session));

  let checkedShow = false;
  PRF.renderPins = (s) => {
    const here = pageOf(location.href);
    const points = s?.points.map((p, i) => [p, i + 1]).filter(([p]) => pageOf(p.url) === here) ?? [];
    if (!points.length) {
      layer?.remove();
      layer = null;
      placed = [];
    } else {
      layer ??= PRF.root().appendChild(h("div", { className: "pins" }));
      // Click-through while picking so pins never swallow the pick.
      layer.classList.toggle("passive", !!PRF.mode);
      placed = points.map(([p, n]) => [
        h("button", {
          className: "pin",
          textContent: n,
          title: p.comment,
          ariaLabel: `Point ${n}`,
          onclick: () => {
            PRF.stopMode();
            PRF.setPanel("points");
          },
        }),
        p,
      ]);
      layer.replaceChildren(...placed.map(([el]) => el));
      sync();
    }
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
    if (pageOf(point.url) !== pageOf(location.href)) {
      // ponytail: sessionStorage is per origin, so a point on another origin opens without the flash
      sessionStorage.setItem(SHOW_KEY, point.id);
      location.href = point.url;
      return;
    }
    PRF.setPanel(null);
    const r = docRect(point);
    scrollTo({ left: r.x + r.width / 2 - innerWidth / 2, top: r.y + r.height / 2 - innerHeight / 2, behavior: "smooth" });
    flash?.el.remove();
    const el = PRF.root().appendChild(h("div", { className: "flash" }));
    flash = { el, point };
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
    .flash { position: fixed; border: 2px solid #4c8dff; border-radius: 8px; background: rgba(76,141,255,.12); pointer-events: none;
      animation: prf-flash 1.5s ease-out forwards; }
    @keyframes prf-flash { 0%, 60% { opacity: 1; } 100% { opacity: 0; } }
  `);
})();
