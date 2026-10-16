// The comment box for the current draft. Resolves { comment, context }, { more, comment }, or null.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("composer")) return;
  PRF.loaded.add("composer");
  const { h } = PRF;

  let cancelOpen = null;
  PRF.onRender((s) => {
    if (!s) cancelOpen?.();
  });

  PRF.compose = ({ captures, comment: initial = "", onRemove }) =>
    new Promise((resolve) => {
      const list = captures.slice();
      const n = (PRF.session?.points.length ?? 0) + 1;
      const marks = [];
      const label = h("b");
      const size = h("span", { className: "mono mute" });
      const strip = h("div", { className: "strip" });
      const text = h("textarea", { placeholder: "What should change?", ariaLabel: "Comment", value: initial });
      const add = h("button", { className: "primary", textContent: "Add point", disabled: !initial.trim(), onclick: () => done(true) });
      text.oninput = () => (add.disabled = !text.value.trim());
      const checks = h("div", { className: "checks" });

      const here = () => PRF.pageOf(location.href);
      const onPage = () => list.map((c, i) => ({ c, i })).filter(({ c }) => PRF.pageOf(c.url) === here());
      // The region the comment is written against. Off-page shots have no element to probe.
      const contextShot = () => onPage().at(-1)?.c ?? null;
      const anchor = () => {
        const shot = contextShot();
        if (shot) return PRF.viewportRect(shot);
        return { x: Math.max(8, innerWidth / 2 - 40), y: innerHeight - 220, width: 80, height: 40 };
      };

      function paint() {
        for (const el of marks) el.remove();
        marks.length = 0;
        const visible = onPage();
        if (list.length === 1 && visible.length === 1) {
          const r = PRF.viewportRect(visible[0].c);
          const mark = h("div", { className: "sel" });
          const badge = h("button", { className: "pin", textContent: n, tabIndex: -1, ariaHidden: "true" });
          const dim = h("div", { className: "size" });
          PRF.place(mark, r, 2);
          Object.assign(badge.style, { left: `${r.x}px`, top: `${r.y}px`, pointerEvents: "none" });
          PRF.placeSize(dim, r);
          marks.push(mark, badge, dim);
        } else {
          for (const { c, i } of visible) {
            const r = PRF.viewportRect(c);
            const box = h("div", { className: "box" }, h("span", { className: "mark", textContent: i + 1 }));
            PRF.place(box, r, 2);
            marks.push(box);
          }
        }
        if (marks.length) PRF.root().append(...marks);
        label.textContent = list.length > 1 ? `${list.length} selections` : list[0]?.selector ? "Element" : "Region";
        size.hidden = list.length !== 1;
        if (list.length === 1) size.textContent = PRF.size(list[0].rect);
        strip.hidden = list.length < 2;
        strip.replaceChildren(
          ...list.map((c, i) => {
            const img = h("img", { src: `data:image/png;base64,${c.image}`, alt: "" });
            let path = c.url;
            try {
              path = new URL(c.url).pathname;
            } catch {}
            return h(
              "div",
              { className: "strip-item", title: c.url },
              img,
              h("span", { className: "strip-n", textContent: i + 1 }),
              h("span", { className: "strip-path", textContent: path }),
              h("button", {
                className: "strip-x",
                ariaLabel: "Remove selection",
                title: "Remove selection",
                onclick: () => drop(i),
              }, "×"),
            );
          }),
        );
        if (panel.isConnected) position(panel, anchor());
      }

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
        h("div", { className: "composer-head" }, h("span", { className: "num", textContent: n }), label, size),
        strip,
        h("label", { className: "field" }, h("span", { className: "mute small", textContent: "Comment" }), text),
        checks,
        h("button", { className: "ghost add-more", textContent: "Add another to this point", onclick: () => done("more") }),
        h(
          "div",
          { className: "composer-foot" },
          h("span", { className: "mute small" }, h("span", { className: "kbd", textContent: PRF.mac ? "⌘ ↵" : "Ctrl ↵" }), "to add"),
          h("div", { className: "row" }, h("button", { className: "ghost", textContent: "Cancel", onclick: () => done(false) }), add),
        ),
      );

      const probe = contextShot();
      // Options may arrive after the panel is up; they are appended without touching the textarea.
      let options = [];
      let boxes = [];
      const optionsReady = Promise.resolve()
        .then(() => PRF.contextOptions(probe ? PRF.viewportRect(probe) : null))
        .then((opts) => {
          options = opts ?? [];
          boxes = options.map((o) => h("input", { type: "checkbox", checked: o.checked ?? true }));
          checks.replaceChildren(
            ...options.map((o, i) =>
              h("label", { className: "check" }, boxes[i], o.label, o.hint ? h("span", { className: "mute ellipsis", textContent: o.hint, title: o.hint }) : ""),
            ),
          );
          if (panel.isConnected) position(panel, anchor());
        })
        .catch((e) => console.warn("PR Feedback: context options failed", e));

      async function drop(i) {
        try {
          await onRemove?.(i);
        } catch (e) {
          return PRF.toast(e.message, { error: true });
        }
        list.splice(i, 1);
        if (!list.length) return done(false);
        paint();
      }

      let closed = false;
      async function done(action) {
        if (closed) return;
        const comment = text.value.trim();
        if (action === true && !comment) return;
        // A lone selection cancels the way it always did. A group asks, so one Esc can't throw away several shots.
        if (action === false && PRF.session && list.length > 1 && !confirm(`Discard ${PRF.plural(list.length, "selection")}?`)) return;
        closed = true;
        cancelOpen = null;
        for (const el of marks) el.remove();
        panel.remove();
        if (action === "more") return resolve({ more: true, comment });
        if (action !== true) return resolve(null);
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

      PRF.root().append(panel);
      paint();
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
    .composer { width: 380px; gap: 10px; padding: 12px; }
    .add-more { justify-content: flex-start; height: 30px; padding: 0 8px; }
    .strip { display: flex; gap: 6px; overflow-x: auto; }
    .strip-item { position: relative; flex: none; width: 96px; height: 64px; border-radius: 7px; overflow: hidden; background: #111; }
    .strip-item img { width: 100%; height: 100%; object-fit: cover; }
    .strip-n, .strip-x { position: absolute; top: 3px; width: 16px; height: 16px; border-radius: 8px; background: #111; color: #fff;
      font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; }
    .strip-n { left: 3px; }
    .strip-x { right: 3px; }
    .strip-path { position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 4px; background: rgba(0,0,0,.55);
      color: #fff; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
