// Element and region modes, and turning a picked rect into a point (PRF.addPoint).
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("pick")) return;
  PRF.loaded.add("pick");
  const { h, place } = PRF;

  let stop = null;
  PRF.mode = null; // "element" | "region" | null

  const fromOverlay = (e) => e.composedPath().includes(PRF.host);

  function end() {
    stop?.();
    stop = null;
    PRF.mode = null;
  }
  PRF.stopMode = () => {
    if (!PRF.mode) return;
    end();
    PRF.render();
  };
  PRF.toggleMode = (name) => {
    const was = PRF.mode;
    end();
    if (was !== name) {
      PRF.mode = name;
      const stopPick = (name === "element" ? pickElement : pickRegion)();
      const hint = PRF.root().appendChild(
        h(
          "div",
          { className: "hint" },
          name === "element" ? "Click an element to comment on it" : "Drag to select a region",
          h("span", { className: "mute", textContent: "·" }),
          h("span", { className: "kbd", textContent: "Esc" }),
          "to cancel",
        ),
      );
      const onEsc = (e) => e.key === "Escape" && PRF.stopMode();
      window.addEventListener("keydown", onEsc, true);
      stop = () => {
        stopPick();
        hint.remove();
        window.removeEventListener("keydown", onEsc, true);
      };
    }
    PRF.render();
  };
  PRF.onRender((s) => {
    if (!s) end();
  });

  function pickElement() {
    const box = h("div", { className: "hl", hidden: true });
    const tag = h("div", { className: "hl-tag", hidden: true });
    PRF.root().append(box, tag);
    // composedPath reaches into open shadow roots, unlike e.target.
    const target = (e) => e.composedPath()[0];
    const onMove = (e) => {
      box.hidden = tag.hidden = fromOverlay(e);
      if (box.hidden) return;
      const el = target(e);
      const r = el.getBoundingClientRect();
      place(box, r, 2);
      const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`).join("");
      tag.replaceChildren(
        h("span", { className: "hl-name", textContent: el.localName }),
        h("span", { textContent: classes }),
        h("span", { className: "mute", textContent: PRF.size(r) }),
      );
      const top = r.y >= 32 ? r.y - 30 : r.bottom + 30 < innerHeight ? r.bottom + 6 : Math.max(r.y, 0) + 6;
      Object.assign(tag.style, { left: `${Math.max(r.x, 0)}px`, top: `${top}px` });
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
      PRF.stopMode();
      PRF.addPoint(el.getBoundingClientRect(), cssPath(el));
    };
    const blocked = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "contextmenu"];
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("click", onClick, true);
    for (const t of blocked) window.addEventListener(t, block, true);
    return () => {
      box.remove();
      tag.remove();
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("click", onClick, true);
      for (const t of blocked) window.removeEventListener(t, block, true);
    };
  }

  function pickRegion() {
    const box = h("div", { className: "sel", hidden: true });
    const size = h("div", { className: "size", hidden: true });
    const layer = h("div", { className: "layer" }, box, size);
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
      const r = rectTo(e);
      box.hidden = size.hidden = false;
      place(box, r, 2);
      PRF.placeSize(size, r);
    };
    layer.onpointerup = (e) => {
      if (!start) return;
      const r = rectTo(e);
      start = null;
      box.hidden = size.hidden = true;
      if (r.width < 5 || r.height < 5) return;
      PRF.stopMode();
      PRF.addPoint(r, null);
    };
    PRF.root().append(layer);
    return () => layer.remove();
  }

  // The "412 × 150" label under a selection's bottom-right corner.
  PRF.placeSize = (el, r) => {
    el.textContent = PRF.size(r);
    const below = r.y + r.height + 8;
    Object.assign(el.style, { left: `${r.x + r.width}px`, top: `${below + 22 < innerHeight ? below : r.y + r.height - 30}px` });
  };

  PRF.addPoint = async (rect, selector) => {
    const r = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    const scroll = { x: scrollX, y: scrollY };
    let shot;
    PRF.host.style.display = "none";
    try {
      // Two frames so the hidden overlay is gone from the composited page before the screenshot.
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      shot = await PRF.send({ type: "capture", rect: r, dpr: devicePixelRatio });
    } catch (err) {
      shot = err;
    } finally {
      PRF.host.style.display = "";
    }
    if (shot instanceof Error) return PRF.toast(shot.message, { error: true });
    const res = await PRF.compose({ rect: r, selector });
    if (!res) return;
    // randomUUID needs a secure context; plain-http pages fall back to a random string.
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const point = { id, url: location.href, selector, rect: r, scroll, comment: res.comment, image: shot.image, width: shot.width };
    if (res.context !== undefined) point.context = res.context;
    await PRF.send({ type: "addPoint", point }).catch((e) => PRF.toast(e.message, { error: true }));
  };

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

  PRF.styles.push(`
    .hl { position: fixed; border: 2px solid #4c8dff; border-radius: 6px; background: rgba(76,141,255,.08); pointer-events: none; }
    .hl-tag { position: fixed; display: flex; align-items: center; gap: 8px; height: 24px; padding: 0 8px; border-radius: 6px;
      background: #1b1b1b; color: #ededed; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; pointer-events: none; }
    .hl-tag span:empty { display: none; }
    .hl-name { color: #9cc0ff; }
    .layer { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; }
    .sel { position: fixed; border: 2px solid #4c8dff; border-radius: 4px; box-shadow: 0 0 0 100vmax rgba(17,17,17,.32); pointer-events: none; }
    .size { position: fixed; height: 22px; padding: 0 7px; border-radius: 6px; transform: translateX(-100%); background: #1b1b1b;
      color: #ededed; font: 11px/22px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; pointer-events: none; }
    .hint { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px;
      padding: 6px 10px; border-radius: 8px; background: #1b1b1b; color: #ededed; font-size: 12px; white-space: nowrap;
      box-shadow: 0 6px 16px rgba(0,0,0,.2); pointer-events: none; }
  `);
})();
