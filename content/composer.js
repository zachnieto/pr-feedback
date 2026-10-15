// The comment box shown after a capture. PRF.compose resolves { comment, context } or null.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("composer")) return;
  PRF.loaded.add("composer");
  const { h } = PRF;

  let cancelOpen = null;
  PRF.onRender((s) => {
    if (!s) cancelOpen?.();
  });

  PRF.compose = ({ rect, selector }) =>
    new Promise((resolve) => {
      const mark = h("div", { className: "sel" });
      const size = h("div", { className: "size" });
      PRF.place(mark, rect, 2);
      PRF.placeSize(size, rect);

      const n = (PRF.session?.points.length ?? 0) + 1;
      // The pin this point will get (styled by pins.js), shown while composing.
      const pin = h("button", { className: "pin", textContent: n, tabIndex: -1, ariaHidden: "true" });
      Object.assign(pin.style, { left: `${rect.x}px`, top: `${rect.y}px`, pointerEvents: "none" });

      const text = h("textarea", { placeholder: "What should change?", ariaLabel: "Comment" });
      const add = h("button", { className: "primary", textContent: "Add point", disabled: true, onclick: () => done(true) });
      text.oninput = () => (add.disabled = !text.value.trim());
      const checks = h("div", { className: "checks" });

      const panel = h(
        "div",
        {
          className: "pop composer",
          // On the panel, not the textarea, so the shortcuts still work after clicking a checkbox.
          onkeydown: (e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) done(true);
            if (e.key === "Escape") done(false);
          },
        },
        h(
          "div",
          { className: "composer-head" },
          h("span", { className: "num", textContent: n }),
          h("b", { textContent: selector ? "Element" : "Region" }),
          h("span", { className: "mono mute", textContent: PRF.size(rect) }),
        ),
        h("label", { className: "field" }, h("span", { className: "mute small", textContent: "Comment" }), text),
        checks,
        h(
          "div",
          { className: "composer-foot" },
          h("span", { className: "mute small" }, h("span", { className: "kbd", textContent: PRF.mac ? "⌘ ↵" : "Ctrl ↵" }), "to add"),
          h("div", { className: "row" }, h("button", { className: "ghost", textContent: "Cancel", onclick: () => done(false) }), add),
        ),
      );

      // Options may arrive after the panel is up; they are appended without touching the textarea.
      let options = [];
      let boxes = [];
      const optionsReady = Promise.resolve()
        .then(() => PRF.contextOptions(rect))
        .then((list) => {
          options = list ?? [];
          boxes = options.map((o) => h("input", { type: "checkbox", checked: o.checked ?? true }));
          checks.replaceChildren(
            ...options.map((o, i) =>
              h("label", { className: "check" }, boxes[i], o.label, o.hint ? h("span", { className: "mute ellipsis", textContent: o.hint, title: o.hint }) : ""),
            ),
          );
          if (panel.isConnected) position(panel, rect);
        })
        .catch((e) => console.warn("PR Feedback: context options failed", e));

      async function done(ok) {
        const comment = text.value.trim();
        if (ok && !comment) return;
        cancelOpen = null;
        mark.remove();
        size.remove();
        pin.remove();
        panel.remove();
        if (!ok) return resolve(null);
        let context;
        try {
          await optionsReady;
          context = await PRF.collectContext(options.filter((_, i) => boxes[i].checked).map((o) => o.key));
        } catch (e) {
          console.warn("PR Feedback: collecting context failed", e);
        }
        resolve({ comment, context });
      }
      cancelOpen?.();
      cancelOpen = () => done(false);

      PRF.root().append(mark, size, pin, panel);
      position(panel, rect);
      text.focus();
    });

  // Beside the selection when there is room, else below or above it; kept clear of the toolbar.
  function position(panel, r) {
    const { width, height } = panel.getBoundingClientRect();
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const maxY = innerHeight - height - 88;
    let x = r.x + r.width + 14;
    let y = r.y;
    if (x + width > innerWidth - 8) x = r.x - width - 14;
    if (x < 8) {
      x = clamp(r.x, 8, innerWidth - width - 8);
      y = r.y + r.height + 40 <= maxY ? r.y + r.height + 40 : r.y - height - 14;
    }
    Object.assign(panel.style, { left: `${x}px`, top: `${clamp(y, 8, maxY)}px` });
  }

  PRF.styles.push(`
    .composer { width: 316px; gap: 10px; padding: 12px; }
    .composer-head { display: flex; align-items: center; gap: 8px; }
    .composer-head .num { width: 20px; height: 20px; border-radius: 10px; font-size: 11px; }
    .composer-head b { font-weight: 600; }
    .composer-head .mono { font-size: 12px; }
    .composer textarea { height: 84px; }
    .composer textarea:focus { border-color: rgba(255,255,255,.14); outline: 2px solid rgba(76,141,255,.55); }
    .checks { display: contents; }
    .check { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: #cfcfcf; white-space: nowrap; }
    .check input { flex: none; margin: 0; accent-color: #fff; }
    .composer-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 2px; }
    .composer-foot > .mute { display: flex; align-items: center; gap: 6px; }
  `);
})();
