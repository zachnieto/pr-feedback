// Element and region modes. A pick joins the draft; the first one opens the comment box
// unless Group is on, in which case picks keep accumulating until Comment.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("pick")) return;
  PRF.loaded.add("pick");
  const { h, place } = PRF;

  let stop = null;
  let hint = null;
  let capturing = false;
  PRF.mode = null; // "element" | "region" | null
  PRF.lastPickMode = "element";

  const fromOverlay = (e) => e.composedPath().includes(PRF.host);
  const sep = () => h("span", { className: "mute", textContent: "·" });
  const kbd = (text) => h("span", { className: "kbd", textContent: text });

  function fillHint(name) {
    if (!hint || !name) return;
    const n = PRF.session?.draft?.length ?? 0;
    const grouping = !!PRF.session?.grouping;
    const nodes = [name === "element" ? (grouping || n ? "Click an element to add it" : "Click an element to comment on it") : grouping || n ? "Drag to add a region" : "Drag to select a region"];
    if (name === "element" && !grouping && !n) nodes.push(sep(), kbd("↑"), kbd("↓"), "to select parent");
    if (grouping || n) nodes.push(sep(), kbd("C"), "to comment");
    nodes.push(sep(), kbd("Esc"), n ? "to stop" : "to cancel");
    hint.replaceChildren(...nodes);
  }

  function end() {
    stop?.();
    stop = null;
    hint = null;
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
      PRF.lastPickMode = name;
      const stopPick = (name === "element" ? pickElement : pickRegion)();
      hint = PRF.root().appendChild(h("div", { className: "hint" }));
      const onEsc = (e) => e.key === "Escape" && PRF.stopMode();
      window.addEventListener("keydown", onEsc, true);
      stop = () => {
        stopPick();
        hint.remove();
        hint = null;
        window.removeEventListener("keydown", onEsc, true);
      };
    }
    PRF.render();
  };
  PRF.onRender((s) => {
    if (!s) end();
    else fillHint(PRF.mode);
  });

  function pickElement() {
    const box = h("div", { className: "hl", hidden: true });
    const tag = h("div", { className: "hl-tag", hidden: true });
    PRF.root().append(box, tag);
    // composedPath reaches into open shadow roots, unlike e.target.
    const target = (e) => e.composedPath()[0];
    // chain[0] is the hovered element, each next entry its parent; the last one is highlighted.
    let chain = [];
    const current = () => chain.at(-1);
    const show = (el) => {
      box.hidden = tag.hidden = !el;
      if (!el) return;
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
    const walk = (up) => {
      const el = current();
      if (!el) return;
      const parent = el.parentElement ?? el.getRootNode().host;
      if (up && parent && el !== document.documentElement) chain.push(parent);
      else if (!up && chain.length > 1) chain.pop();
      show(current());
    };
    const onMove = (e) => {
      if (fromOverlay(e)) return show(null);
      const el = target(e);
      if (el !== chain[0]) chain = [el];
      show(current());
    };
    let wheel = 0;
    const onWheel = (e) => {
      if (!e.altKey || !current() || fromOverlay(e)) return;
      e.preventDefault();
      // Accumulated so a trackpad's stream of small deltas walks one step at a time.
      wheel += e.deltaY;
      if (Math.abs(wheel) < 60) return;
      walk(wheel < 0);
      wheel = 0;
    };
    const onKey = (e) => {
      if (!current() || fromOverlay(e) || !["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Enter") return choose(current());
      walk(e.key === "ArrowUp");
    };
    const choose = (el) => el && PRF.captureShot(el.getBoundingClientRect(), cssPath(el));
    const block = (e) => {
      if (fromOverlay(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onClick = (e) => {
      if (fromOverlay(e)) return;
      block(e);
      const el = target(e);
      choose(el === chain[0] ? current() : el);
    };
    const blocked = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "contextmenu"];
    const listeners = [["mousemove", onMove], ["click", onClick], ["wheel", onWheel], ["keydown", onKey], ...blocked.map((t) => [t, block])];
    for (const [t, fn] of listeners) window.addEventListener(t, fn, { capture: true, passive: false });
    return () => {
      box.remove();
      tag.remove();
      for (const [t, fn] of listeners) window.removeEventListener(t, fn, true);
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
      PRF.captureShot(r, null);
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

  // Stays true through the comment box so a second click can't start another shot underneath it.
  PRF.captureShot = async (rect, selector) => {
    if (capturing || PRF.composing) return;
    capturing = true;
    const grouping = !!PRF.session?.grouping;
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
    try {
      if (shot instanceof Error) return PRF.toast(shot.message, { error: true });
      const n = await PRF.send({
        type: "addCapture",
        capture: { url: location.href, selector, rect: r, scroll, image: shot.image, width: shot.width },
      });
      // Group stays in the mode so the next click adds another region. A lone first click still opens the box.
      if (n === 1 && !grouping) await PRF.commentOnDraft();
    } catch (e) {
      PRF.toast(e.message, { error: true });
    } finally {
      capturing = false;
    }
  };

  PRF.discardDraft = async () => {
    const n = PRF.session?.draft?.length ?? 0;
    if (!n) return;
    if (n > 1 && !confirm(`Discard ${PRF.plural(n, "selection")}?`)) return;
    await PRF.send({ type: "clearDraft" }).catch((e) => PRF.toast(e.message, { error: true }));
  };

  PRF.commentOnDraft = async () => {
    if (PRF.composing) return;
    PRF.composing = true;
    const mode = PRF.mode;
    PRF.stopMode();
    PRF.render();
    try {
      const session = await PRF.reloadSession();
      const captures = session?.draft?.slice() ?? [];
      if (!captures.length) return;
      const res = await PRF.compose({
        captures,
        comment: session.draftComment ?? "",
        onRemove: (index) => PRF.send({ type: "removeCapture", index }),
      });
      if (!PRF.session) return;
      if (res?.more) {
        await PRF.send({ type: "setDraftComment", comment: res.comment });
        PRF.toggleMode(mode || PRF.lastPickMode || "element");
        return;
      }
      if (!res) {
        await PRF.send({ type: "clearDraft" });
        return;
      }
      const msg = { type: "commitDraft", comment: res.comment };
      if (res.context !== undefined) msg.context = res.context;
      await PRF.send(msg);
    } catch (e) {
      PRF.toast(e.message, { error: true });
    } finally {
      PRF.composing = false;
      PRF.render();
    }
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
      if (el === document.body) break;
      // Readable class names only; hashed CSS-in-JS classes (css-1x2y3z) add noise.
      const classes = [...el.classList].filter((c) => /^[a-z][\w-]{0,29}$/i.test(c) && !/\d{3}|[-_](?=[a-z]*\d)[a-z\d]{5,}/i.test(c)).slice(0, 2);
      const sig = el.localName + classes.map((c) => `.${CSS.escape(c)}`).join("");
      const siblings = el.parentElement ? [...el.parentElement.children] : [];
      const nth = siblings.filter((s) => s.tagName === el.tagName).indexOf(el) + 1;
      parts.unshift(sig + (siblings.filter((s) => s.matches(sig)).length > 1 ? `:nth-of-type(${nth})` : ""));
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
