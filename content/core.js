// Shared namespace for the content scripts. They are classic scripts listed in manifest
// order and share one isolated-world global scope, so everything hangs off window.PRF.
// The overlay is built with createElement + adoptedStyleSheets (no innerHTML or
// <style>) so pages with strict CSP or Trusted Types, like github.com, still render it.
(() => {
  // A reloaded extension leaves the previous PRF behind with a dead runtime; replace it.
  if (window.PRF?.loaded.has("core") && window.PRF.alive()) return;
  document.querySelectorAll("pr-feedback-overlay").forEach((el) => el.remove());

  const PRF = (window.PRF = {
    loaded: new Set(["core"]),
    alive: () => !!chrome.runtime?.id,
    // CSS strings; each file pushes its own. Applied to the shadow root on PRF.root().
    styles: [],
    session: null,
    // The one open popover above the toolbar: "points", "target" or null.
    panel: null,
    mac: /Mac/.test(navigator.platform),
  });

  PRF.h = (tag, props = {}, ...kids) => {
    const el = Object.assign(document.createElement(tag), props);
    el.append(...kids);
    return el;
  };

  // Each icon is a list of 24x24 stroke paths (circles written as two arcs).
  PRF.icons = {
    comment: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
    pr: ["M15 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "M13 6h3a2 2 0 0 1 2 2v7", "M6 9v12"],
    chevron: ["m6 9 6 6 6-6"],
    cursor: ["M4 4l7 17 2.5-7.5L21 11z"],
    region: ["M3 8V5a2 2 0 0 1 2-2h3", "M16 3h3a2 2 0 0 1 2 2v3", "M21 16v3a2 2 0 0 1-2 2h-3", "M8 21H5a2 2 0 0 1-2-2v-3"],
    list: ["M9 6h12", "M9 12h12", "M9 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
    up: ["M12 19V5", "m5 12 7-7 7 7"],
    x: ["M18 6 6 18", "m6 6 12 12"],
    check: ["M20 6 9 17l-5-5"],
    edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
    trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
    locate: ["M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0", "M12 2v4", "M12 18v4", "M2 12h4", "M18 12h4"],
    search: ["M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0", "m20 20-3.5-3.5"],
    spinner: ["M21 12a9 9 0 1 1-6.2-8.56"],
  };
  const SVG = "http://www.w3.org/2000/svg";
  PRF.icon = (name, size = 18, stroke = 1.75) => {
    const svg = document.createElementNS(SVG, "svg");
    const attrs = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor" };
    Object.assign(attrs, { "stroke-width": stroke, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
    for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
    for (const d of PRF.icons[name]) svg.appendChild(document.createElementNS(SVG, "path")).setAttribute("d", d);
    return svg;
  };

  PRF.send = (msg) =>
    chrome.runtime.sendMessage(msg).then(({ result, error }) => {
      if (error) throw new Error(error);
      return result;
    });

  PRF.place = (el, r, pad = 0) =>
    Object.assign(el.style, {
      left: `${r.x - pad}px`,
      top: `${r.y - pad}px`,
      width: `${r.width + 2 * pad}px`,
      height: `${r.height + 2 * pad}px`,
    });
  PRF.size = (r) => `${Math.round(r.width)} × ${Math.round(r.height)}`;
  PRF.plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  // "github:Newton-Research-Inc/newton#3481" -> { repo: "newton", number: "3481", text: "newton#3481" }
  PRF.targetLabel = (target) => {
    const m = target?.match(/([^/:]+)#(\d+)$/);
    if (m) return { repo: m[1], number: m[2], text: `${m[1]}#${m[2]}` };
    const ref = target ? target.slice(target.indexOf(":") + 1) : "";
    return { repo: ref, number: "", text: ref };
  };

  let host, root;
  const sheet = new CSSStyleSheet();
  let applied = 0;
  // Mounts the shadow host on first use, so pages with nothing to show get no overlay node.
  PRF.root = () => {
    if (!host) {
      host = PRF.host = document.createElement("pr-feedback-overlay");
      root = host.attachShadow({ mode: "open" });
      root.adoptedStyleSheets = [sheet];
      // Keys typed in the overlay must not trigger the page's hotkeys.
      for (const t of ["keydown", "keyup", "keypress"]) root.addEventListener(t, (e) => e.stopPropagation());
      document.documentElement.append(host);
    }
    if (applied !== PRF.styles.length) {
      sheet.replaceSync(PRF.styles.join("\n"));
      applied = PRF.styles.length;
    }
    return root;
  };

  // Subscribers run in file order on every session change and on PRF.render() for UI-only state.
  const renderers = [];
  let ready = false;
  PRF.onRender = (fn) => {
    renderers.push(fn);
    // Deferred so a file registering before its own consts are initialized still works.
    if (ready) queueMicrotask(() => fn(PRF.session));
  };
  PRF.render = () => {
    toast?.classList.toggle("raised", !!PRF.session);
    for (const fn of renderers) fn(PRF.session);
  };
  PRF.setPanel = (name) => {
    PRF.panel = name;
    PRF.render();
  };

  let triedPageTarget = false;
  function setSession(s) {
    PRF.session = s ?? null;
    if (!PRF.session) PRF.panel = null;
    ready = true;
    PRF.render();
    // A session started elsewhere picks up its target from the first page whose URL matches a rule.
    if (PRF.session && !PRF.session.target && !triedPageTarget) {
      triedPageTarget = true;
      PRF.send({ type: "setTarget", input: location.href }).catch(() => {});
    }
  }
  chrome.storage.local.get("session").then(({ session }) => setSession(session));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.session) setSession(changes.session.newValue);
  });

  let toast, toastTimer;
  // content: string, Node, or an array of them.
  PRF.toast = (content, { error = false } = {}) => {
    const close = () => {
      clearTimeout(toastTimer);
      toast?.remove();
      toast = null;
    };
    close();
    const { h } = PRF;
    toast = h(
      "div",
      { className: `tb toast${error ? " error" : ""}${PRF.session ? " raised" : ""}`, role: error ? "alert" : "status" },
      h("span", { className: "toast-icon" }, error ? "!" : PRF.icon("check", 12, 3)),
      h("span", { className: "toast-text" }, ...[content].flat()),
      h("button", { className: "ib", ariaLabel: "Dismiss", title: "Dismiss", onclick: close }, PRF.icon("x", 16)),
    );
    PRF.root().append(toast);
    toastTimer = setTimeout(close, 8000);
  };

  PRF.styles.push(`
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; color: #ededed;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    a { color: #9cc0ff; text-decoration: none; font-weight: 600; }
    a:hover { color: #c4daff; }
    button, input, textarea { font: inherit; color: inherit; margin: 0; }
    button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0; border: 0;
      background: transparent; cursor: pointer; white-space: nowrap; }
    button:disabled { opacity: .4; cursor: default; }
    textarea, input:not([type]) { width: 100%; padding: 8px 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 9px;
      background: #252525; color: #ededed; outline: none; }
    textarea { resize: none; line-height: 1.45; }
    textarea:focus, input:not([type]):focus { border-color: rgba(76,141,255,.6); }
    .tb { display: inline-flex; align-items: center; gap: 2px; padding: 4px; background: #1b1b1b;
      border: 1px solid rgba(255,255,255,.09); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.25); pointer-events: auto; }
    .pop { position: fixed; display: flex; flex-direction: column; background: #1b1b1b; border: 1px solid rgba(255,255,255,.09);
      border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,.35); pointer-events: auto; }
    .tb, .pop { z-index: 1; }
    .above { left: 50%; bottom: 84px; transform: translateX(-50%); }
    .ib { position: relative; width: 40px; height: 40px; border-radius: 10px; color: #cfcfcf; }
    .ib:hover:not(:disabled) { background: rgba(255,255,255,.08); color: #fff; }
    .ib.on { background: rgba(255,255,255,.14); color: #fff; }
    .ib.sm { width: 30px; height: 30px; border-radius: 8px; }
    .chip { height: 40px; padding: 0 10px; border-radius: 10px; color: #ededed; }
    .chip:hover:not(:disabled) { background: rgba(255,255,255,.08); }
    .sep { width: 1px; height: 20px; margin: 0 4px; background: rgba(255,255,255,.12); }
    .primary { height: 34px; padding: 0 12px; margin: 0 3px; border-radius: 9px; background: #fff; color: #111; font-weight: 600; }
    .ghost { height: 34px; padding: 0 12px; border-radius: 9px; color: #cfcfcf; }
    .ghost:hover { background: rgba(255,255,255,.08); }
    .badge { position: absolute; top: 4px; right: 2px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
      background: #4c8dff; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; }
    .num { width: 18px; height: 18px; flex: none; display: inline-flex; align-items: center; justify-content: center;
      border-radius: 9px; background: #4c8dff; color: #fff; font-size: 10px; font-weight: 700; }
    .kbd { font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 3px 5px; border-radius: 5px;
      background: rgba(255,255,255,.1); color: #bdbdbd; }
    .mute { color: #9b9b9b; }
    .mono { font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .small { font-size: 12px; }
    .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row { display: flex; justify-content: flex-end; gap: 4px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 32px);
      gap: 12px; padding: 4px 4px 4px 14px; }
    .toast.raised { bottom: 84px; }
    .toast-icon { width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center;
      border-radius: 10px; background: #2ea043; color: #fff; font-weight: 700; font-size: 12px; }
    .toast.error .toast-icon { background: #e5484d; }
    .toast-text { max-width: 560px; }
  `);
})();
