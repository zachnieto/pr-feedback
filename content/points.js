// The points list panel above the toolbar, with inline edit and remove.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("points")) return;
  PRF.loaded.add("points");
  const { h, icon, send } = PRF;
  const fail = (e) => PRF.toast(e.message, { error: true });

  let panel;
  let editing = null; // { id, text } survives the rebuild on every render

  PRF.onRender((s) => {
    if (!s?.points.length || PRF.panel !== "points") {
      if (PRF.panel === "points") PRF.panel = null;
      panel?.remove();
      panel = null;
      editing = null;
      return;
    }
    if (!panel) {
      panel = PRF.root().appendChild(h("div", { className: "pop above points" }));
      panel.onkeydown = (e) => { if (e.key === "Escape") PRF.setPanel(null); };
    }
    panel.replaceChildren(
      h(
        "div",
        { className: "points-head" },
        h(
          "div",
          { className: "ellipsis" },
          h("b", { textContent: PRF.plural(s.points.length, "point") }),
          s.target ? h("span", { className: "mute", textContent: ` for ${PRF.targetLabel(s.target).text}` }) : "",
        ),
        h("button", { className: "ghost", textContent: "Clear all", onclick: clearAll }),
      ),
      h("div", { className: "points-list" }, ...s.points.map(item)),
    );
    const box = panel.querySelector("textarea");
    box?.focus();
    box?.setSelectionRange(box.value.length, box.value.length);
  });

  const iconBtn = (name, label, onclick) => h("button", { className: "ib sm", ariaLabel: label, title: label, onclick }, icon(name, 15));

  function shotWhere(c) {
    const sel = c.selector ?? (c.rect ? `Region ${PRF.size(c.rect)}` : "");
    let path = "";
    try {
      path = new URL(c.url).pathname;
    } catch {
      path = c.url ?? "";
    }
    return `${sel} · ${path}`;
  }

  function thumb(c) {
    const img = h("img", { src: `data:image/png;base64,${c.image}`, alt: "" });
    img.onerror = () => img.remove();
    return img;
  }

  function item(p, i) {
    const shots = PRF.captures(p);
    const img = shots.length > 1 ? h("div", { className: "thumbs" }, ...shots.map(thumb)) : h("div", { className: "thumb" }, thumb(shots[0]));
    const where = shots.length > 1 ? `${shots.length} selections · ${shotWhere(shots[0])}` : shotWhere(shots[0]);
    const isEditing = editing?.id === p.id;
    const tags = PRF.contextTags(p);
    return h(
      "div",
      { className: "item" },
      img,
      h(
        "div",
        { className: "item-body" },
        h("div", { className: "item-meta" }, h("span", { className: "num", textContent: i + 1 }), h("span", { className: "mono mute ellipsis", textContent: where, title: shots.map((c) => c.url).join("\n") })),
        ...(isEditing ? editor(p) : [h("div", { className: "item-comment", textContent: p.comment })]),
        tags.length ? h("div", { className: "tags" }, ...tags.map((t) => h("span", { className: "tag", textContent: t }))) : "",
      ),
      h(
        "div",
        { className: "item-actions" },
        PRF.showOnPage ? iconBtn("locate", "Show on page", () => PRF.showOnPage(p)) : "",
        isEditing
          ? ""
          : iconBtn("edit", "Edit comment", () => {
              editing = { id: p.id, text: p.comment };
              PRF.render();
            }),
        iconBtn("trash", "Remove point", () => send({ type: "removePoint", id: p.id }).catch(fail)),
      ),
    );
  }

  function editor(p) {
    const text = h("textarea", { value: editing.text, ariaLabel: "Edit comment", oninput: () => (editing.text = text.value) });
    const close = () => {
      editing = null;
      PRF.render();
    };
    const save = () => {
      const comment = text.value.trim();
      if (!comment) return;
      close();
      if (comment !== p.comment) send({ type: "updatePoint", id: p.id, comment }).catch(fail);
    };
    text.onkeydown = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    return [
      h("label", { className: "field" }, h("span", { className: "mute small", textContent: "Edit comment" }), text),
      h(
        "div",
        { className: "row" },
        h("button", { className: "ghost", textContent: "Cancel", onclick: close }),
        h("button", { className: "primary", textContent: "Save", onclick: save }),
      ),
    ];
  }

  async function clearAll() {
    const points = PRF.session.points;
    if (!confirm(`Remove all ${PRF.plural(points.length, "point")}?`)) return;
    for (const p of points) await send({ type: "removePoint", id: p.id }).catch(fail);
  }

  PRF.styles.push(`
    .points { width: 480px; max-width: calc(100vw - 32px); max-height: min(60vh, 560px); gap: 2px; padding: 8px; }
    .points-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: none;
      padding: 4px 4px 8px 8px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .points-head b { font-weight: 600; }
    .points .ghost, .points .primary { height: 30px; padding: 0 10px; margin: 0; border-radius: 8px; font-size: 12px; }
    .points-list { display: flex; flex-direction: column; gap: 2px; overflow: auto; }
    .item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 8px; border-radius: 10px; }
    .item:hover { background: rgba(255,255,255,.06); }
    .thumb { width: 92px; height: 62px; flex: none; display: flex; align-items: center; justify-content: center; overflow: hidden;
      border-radius: 7px; background: #f4f4f1; border: 1px solid rgba(255,255,255,.12); }
    .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .thumbs { width: 92px; flex: none; display: flex; flex-direction: column; gap: 4px; }
    .thumbs img { width: 92px; height: 48px; object-fit: cover; border-radius: 6px; background: #f4f4f1; border: 1px solid rgba(255,255,255,.12); }
    .item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .item-meta { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .item-comment { white-space: pre-wrap; overflow-wrap: anywhere; }
    .item textarea { height: 64px; padding: 6px 8px; border-radius: 8px; }
    .item .field { gap: 4px; }
    .item-actions { display: flex; gap: 2px; flex: none; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { padding: 2px 6px; border-radius: 5px; background: rgba(255,255,255,.08); color: #bdbdbd; font-size: 11px; }
  `);
})();
