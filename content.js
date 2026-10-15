// The overlay is built with createElement + adoptedStyleSheets (no innerHTML or
// <style>) so pages with strict CSP or Trusted Types, like github.com, still render it.
(() => {
  let host, root, bar, targetBtn, targetInput, count, sendBtn, elementBtn, regionBtn;
  let session = null;
  let stopMode = () => {};

  const send = (msg) =>
    chrome.runtime.sendMessage(msg).then(({ result, error }) => {
      if (error) throw new Error(error);
      return result;
    });

  chrome.storage.local.get("session").then(({ session }) => render(session));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.session) render(changes.session.newValue);
  });

  function h(tag, props = {}, ...kids) {
    const el = Object.assign(document.createElement(tag), props);
    el.append(...kids);
    return el;
  }

  const place = (el, r) =>
    Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });

  const fromOverlay = (e) => e.composedPath().includes(host);

  function render(s) {
    session = s ?? null;
    if (!session) {
      stopMode();
      host?.remove();
      host = null;
      return;
    }
    if (!host) mount();
    targetBtn.textContent = session.target ?? "";
    targetBtn.hidden = !session.target;
    targetInput.hidden = !!session.target;
    count.textContent = `${session.points.length} point${session.points.length === 1 ? "" : "s"}`;
    sendBtn.disabled = !session.points.length || !session.target;
  }

  function mount() {
    host = document.createElement("pr-feedback-overlay");
    root = host.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    root.adoptedStyleSheets = [sheet];
    // Keys typed in the overlay must not trigger the page's hotkeys.
    for (const t of ["keydown", "keyup", "keypress"]) root.addEventListener(t, (e) => e.stopPropagation());

    targetBtn = h("button", { title: "Change where feedback goes", onclick: editTarget });
    targetInput = h("input", { placeholder: "PR URL or owner/repo#123", onkeydown: onTargetKey });
    count = h("span", { className: "count" });
    elementBtn = h("button", { textContent: "Element", onclick: () => toggle("element", pickElement) });
    regionBtn = h("button", { textContent: "Region", onclick: () => toggle("region", pickRegion) });
    sendBtn = h("button", { className: "primary", textContent: "Send", onclick: submit });
    const closeBtn = h("button", { textContent: "✕", title: "Discard feedback", onclick: cancel });
    bar = h("div", { className: "bar" }, targetBtn, targetInput, count, elementBtn, regionBtn, sendBtn, closeBtn);
    root.append(bar);
    document.documentElement.append(host);
  }

  function editTarget() {
    targetBtn.hidden = true;
    targetInput.hidden = false;
    targetInput.value = "";
    targetInput.focus();
  }

  async function onTargetKey(e) {
    if (e.key === "Escape" && session.target) return render(session);
    if (e.key !== "Enter") return;
    try {
      if (!(await send({ type: "setTarget", input: targetInput.value }))) alert("No rule matches that. Paste a PR URL or owner/repo#123.");
    } catch (err) {
      alert(err.message);
    }
  }

  async function submit() {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    try {
      await send({ type: "submit" });
    } catch (err) {
      alert(err.message);
      sendBtn.disabled = false;
    } finally {
      sendBtn.textContent = "Send";
    }
  }

  function cancel() {
    const n = session.points.length;
    if (n && !confirm(`Discard ${n} point${n === 1 ? "" : "s"}?`)) return;
    send({ type: "cancel" });
  }

  function toggle(name, start) {
    const wasOn = (name === "element" ? elementBtn : regionBtn).classList.contains("on");
    stopMode();
    if (wasOn) return;
    (name === "element" ? elementBtn : regionBtn).classList.add("on");
    const stop = start();
    const onEsc = (e) => e.key === "Escape" && stopMode();
    window.addEventListener("keydown", onEsc, true);
    stopMode = () => {
      stop();
      window.removeEventListener("keydown", onEsc, true);
      elementBtn?.classList.remove("on");
      regionBtn?.classList.remove("on");
      stopMode = () => {};
    };
  }

  function pickElement() {
    const box = h("div", { className: "box" });
    box.hidden = true;
    root.append(box);
    const target = (e) => e.composedPath()[0];
    const onMove = (e) => {
      if (fromOverlay(e)) return (box.hidden = true);
      box.hidden = false;
      place(box, target(e).getBoundingClientRect());
    };
    const block = (e) => {
      if (fromOverlay(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onClick = (e) => {
      if (fromOverlay(e)) return;
      block(e);
      const el = target(e);
      stopMode();
      addPoint(el.getBoundingClientRect(), cssPath(el));
    };
    const blocked = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "contextmenu"];
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("click", onClick, true);
    for (const t of blocked) window.addEventListener(t, block, true);
    return () => {
      box.remove();
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("click", onClick, true);
      for (const t of blocked) window.removeEventListener(t, block, true);
    };
  }

  function pickRegion() {
    const box = h("div", { className: "box" });
    box.hidden = true;
    const layer = h("div", { className: "layer" }, box);
    let start = null;
    const rectTo = (e) => ({
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      width: Math.abs(e.clientX - start.x),
      height: Math.abs(e.clientY - start.y),
    });
    layer.onpointerdown = (e) => {
      start = { x: e.clientX, y: e.clientY };
      layer.setPointerCapture(e.pointerId);
    };
    layer.onpointermove = (e) => {
      if (!start) return;
      box.hidden = false;
      place(box, rectTo(e));
    };
    layer.onpointerup = (e) => {
      if (!start) return;
      const rect = rectTo(e);
      start = null;
      box.hidden = true;
      if (rect.width < 5 || rect.height < 5) return;
      stopMode();
      addPoint(rect, null);
    };
    root.append(layer);
    return () => layer.remove();
  }

  async function addPoint(rect, selector) {
    const r = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    let image;
    host.style.display = "none";
    try {
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      image = await send({ type: "capture", rect: r, dpr: devicePixelRatio });
    } catch (err) {
      return alert(err.message);
    } finally {
      host.style.display = "";
    }
    const comment = await askComment(r);
    if (comment) await send({ type: "addPoint", point: { url: location.href, selector, comment, image } });
  }

  function askComment(r) {
    return new Promise((resolve) => {
      const mark = h("div", { className: "box" });
      place(mark, r);
      const text = h("textarea", { placeholder: "What should change? (⌘/Ctrl+Enter to save)" });
      const done = (value) => {
        mark.remove();
        panel.remove();
        resolve(value?.trim() || null);
      };
      text.onkeydown = (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) done(text.value);
        if (e.key === "Escape") done(null);
      };
      const panel = h(
        "div",
        { className: "panel" },
        text,
        h(
          "div",
          { className: "row" },
          h("button", { textContent: "Cancel", onclick: () => done(null) }),
          h("button", { className: "primary", textContent: "Add", onclick: () => done(text.value) }),
        ),
      );
      const below = r.y + r.height + 8;
      Object.assign(panel.style, {
        left: `${Math.max(8, Math.min(r.x, innerWidth - 328))}px`,
        top: `${below + 150 < innerHeight ? below : Math.max(8, r.y - 158)}px`,
      });
      root.append(mark, panel);
      text.focus();
    });
  }

  // Context for a reader, not a guaranteed-unique locator: stops at the nearest id or data-testid.
  function cssPath(el) {
    const parts = [];
    for (; el?.nodeType === 1 && parts.length < 6; el = el.parentElement) {
      if (el.id) {
        parts.unshift(`#${CSS.escape(el.id)}`);
        break;
      }
      const testId = el.getAttribute("data-testid");
      if (testId) {
        parts.unshift(`[data-testid="${CSS.escape(testId)}"]`);
        break;
      }
      const same = el.parentElement ? [...el.parentElement.children].filter((s) => s.tagName === el.tagName) : [];
      parts.unshift(el.localName + (same.length > 1 ? `:nth-of-type(${same.indexOf(el) + 1})` : ""));
    }
    return parts.join(" > ");
  }

  const STYLES = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
      font: 13px/1.4 system-ui, sans-serif; color: #1f2328; }
    [hidden] { display: none !important; }
    .bar, .panel { position: fixed; display: flex; gap: 6px; padding: 6px; background: #fff;
      border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.18); pointer-events: auto; }
    .bar { right: 16px; bottom: 16px; align-items: center; }
    .panel { width: 300px; flex-direction: column; padding: 8px; }
    .row { display: flex; gap: 6px; justify-content: flex-end; }
    .count { color: #59636e; padding: 0 4px; }
    button, input, textarea { font: inherit; color: inherit; border: 1px solid #d0d7de; border-radius: 6px; }
    button { padding: 4px 10px; background: #f6f8fa; cursor: pointer; max-width: 260px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button:disabled { opacity: .5; cursor: default; }
    button.on, button.primary { background: #0969da; border-color: #0969da; color: #fff; }
    input { width: 220px; padding: 4px 6px; }
    textarea { height: 80px; padding: 6px; resize: vertical; }
    .box { position: fixed; border: 2px solid #0969da; background: rgba(9,105,218,.12); pointer-events: none; }
    .layer { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; }
  `;
})();
