// The pill toolbar shown during a session, and the idle launcher shown on pages that
// resolve to a target when no session is running.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("toolbar")) return;
  PRF.loaded.add("toolbar");
  const { h, icon, send } = PRF;
  const fail = (e) => PRF.toast(e.message, { error: true });

  let dock, idle;
  let idleTarget; // undefined until asked, then null (pending or no match) or the target
  PRF.busy = false;

  PRF.onRender((s) => {
    renderIdle(s);
    if (!s) {
      dock?.remove();
      dock = null;
      return;
    }
    dock ??= PRF.root().appendChild(h("div", { className: "tb dock" }));
    dock.replaceChildren(...(PRF.busy ? busyBar(s) : bar(s)));
  });

  function renderIdle(s) {
    if (s || !idleTarget) {
      idle?.remove();
      idle = null;
      if (!s && idleTarget === undefined) {
        idleTarget = null;
        send({ type: "resolve", url: location.href }).then((t) => {
          idleTarget = t;
          if (t) PRF.render();
        }, () => {});
      }
      return;
    }
    idle ??= PRF.root().appendChild(
      h(
        "button",
        { className: "tb idle", title: `Start feedback for ${PRF.targetLabel(idleTarget).text}`, onclick: start },
        icon("comment"),
        h("span", { textContent: "Feedback" }),
        h("span", { className: "kbd", textContent: PRF.mac ? "⌥⇧F" : "Alt+Shift+F" }),
      ),
    );
  }

  const start = () => send({ type: "start", url: location.href }).catch(fail);
  const sep = () => h("span", { className: "sep" });
  const dot = (on) => h("span", { className: `dot${on ? "" : " off"}` });

  function chip(target, interactive) {
    if (!target)
      return h(
        "button",
        { className: `chip warn${PRF.panel === "target" ? " open" : ""}`, title: "Choose where feedback goes", onclick: pickTarget },
        h("span", { className: "warn-dot" }),
        h("span", { textContent: "Choose target" }),
        icon("chevron", 14, 2),
      );
    const { repo, number } = PRF.targetLabel(target);
    return h(
      "button",
      { className: `chip${PRF.panel === "target" ? " open" : ""}`, title: interactive ? `${target}\nChange where feedback goes` : target, disabled: !interactive, onclick: pickTarget },
      icon("pr", 16),
      h("span", { textContent: repo }),
      number ? h("span", { className: "mute", textContent: `#${number}` }) : "",
      interactive ? h("span", { className: "mute" }, icon("chevron", 14, 2)) : "",
    );
  }

  const tip = (label, key) => h("span", { className: "tip" }, label, h("span", { className: "kbd", textContent: key }));
  const toggleMode = (mode) => {
    PRF.panel = null;
    PRF.toggleMode(mode);
  };
  function toggleGrouping() {
    if (!PRF.session || PRF.composing) return;
    const on = !PRF.session.grouping;
    PRF.session.grouping = on;
    PRF.render();
    send({ type: "setGrouping", on }).catch(async (e) => {
      fail(e);
      await PRF.reloadSession();
      PRF.render();
    });
    if (on && !PRF.mode) PRF.toggleMode("element");
  }
  const togglePoints = () => {
    if (!PRF.session.points.length) return;
    PRF.stopMode();
    PRF.setPanel(PRF.panel === "points" ? null : "points");
  };

  function bar(s) {
    const n = s.points.length;
    const modeBtn = (mode, iconName, label, key) =>
      h(
        "button",
        { className: `ib${PRF.mode === mode ? " on" : ""}`, ariaLabel: label, onclick: () => toggleMode(mode) },
        icon(iconName),
        tip(label, key),
      );
    return [
      dot(true),
      chip(s.target, true),
      sep(),
      modeBtn("element", "cursor", "Select element", "E"),
      modeBtn("region", "region", "Select region", "R"),
      h(
        "button",
        {
          className: `ib${s.grouping ? " on" : ""}`,
          ariaLabel: "Group selections",
          onclick: toggleGrouping,
        },
        icon("group"),
        tip("Group selections", "G"),
      ),
      ...selectionControls(s),
      h(
        "button",
        {
          className: `ib${n && PRF.panel === "points" ? " on" : ""}`,
          ariaLabel: "Points",
          disabled: !n,
          onclick: togglePoints,
        },
        icon("list"),
        n ? h("span", { className: "badge", textContent: n }) : "",
        tip("Review points", "L"),
      ),
      sep(),
      h(
        "button",
        {
          className: "primary",
          disabled: !n || !s.target || !!s.draft?.length,
          title: s.draft?.length ? "Comment on the current selection first" : s.target ? "Post to the PR" : "Choose a target first",
          onclick: submit,
        },
        "Send",
        icon("up", 14, 2.25),
      ),
      h("button", { className: "ib", ariaLabel: "Discard feedback", title: "Discard feedback", onclick: discard }, icon("x", 16)),
    ];
  }

  function selectionControls(s) {
    const n = s.draft?.length ?? 0;
    if (!n || PRF.composing) return [];
    return [
      h(
        "button",
        { className: "chip", title: "Comment on these selections (C)", onclick: () => PRF.commentOnDraft() },
        "Comment",
        h("span", { className: "count", textContent: n }),
      ),
      h("button", { className: "ib", ariaLabel: "Discard selection", title: "Discard selection", onclick: () => PRF.discardDraft() }, icon("x", 16)),
    ];
  }

  const busyBar = (s) => [
    dot(false),
    chip(s.target, false),
    sep(),
    h("span", { className: "busy" }, h("span", { className: "spin" }, icon("spinner", 16, 2)), "Uploading screenshots"),
  ];

  // Single-key shortcuts, ignored while typing anywhere (page fields included) or with a modifier held.
  const keys = {
    __proto__: null,
    e: () => toggleMode("element"),
    r: () => toggleMode("region"),
    g: toggleGrouping,
    c: () => PRF.session?.draft?.length && PRF.commentOnDraft(),
    l: togglePoints,
  };
  addEventListener(
    "keydown",
    (e) => {
      const key = e.key?.toLowerCase();
      const run = keys[key];
      if (!run || !PRF.session || PRF.busy || PRF.composing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      // C is only ours once something is selected; otherwise the page keeps it.
      if (key === "c" && !PRF.session.draft?.length) return;
      const el = e.composedPath()[0];
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      run();
    },
    true,
  );

  function pickTarget() {
    PRF.stopMode();
    PRF.openTargetPicker();
  }

  async function submit() {
    if (PRF.session.draft?.length) return PRF.toast("Comment on the current selection first, or discard it", { error: true });
    const n = PRF.session.points.length;
    const { text } = PRF.targetLabel(PRF.session.target);
    PRF.stopMode();
    PRF.panel = null;
    PRF.busy = true;
    PRF.render();
    try {
      const { url } = await send({ type: "submit" });
      PRF.toast([
        `Posted ${PRF.plural(n, "point")} to `,
        h("b", { textContent: text }),
        h("a", { href: url, target: "_blank", rel: "noopener", textContent: "View comment ↗" }),
      ]);
    } catch (e) {
      fail(e);
    } finally {
      PRF.busy = false;
      PRF.render();
    }
  }

  function discard() {
    const n = PRF.session.points.length;
    const d = PRF.session.draft?.length ?? 0;
    const what = [n ? PRF.plural(n, "point") : "", d ? PRF.plural(d, "unsaved selection") : ""].filter(Boolean).join(" and ");
    if (what && !confirm(`Discard ${what}?`)) return;
    PRF.stopMode();
    send({ type: "cancel" }).catch(fail);
  }

  PRF.styles.push(`
    .dock { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); width: max-content; }
    .dot { width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; }
    .dot::after { content: ""; width: 8px; height: 8px; border-radius: 4px; background: #ff5f57; box-shadow: 0 0 0 4px rgba(255,95,87,.22); }
    .dot.off::after { background: #6b6b6b; box-shadow: none; }
    .chip:disabled { opacity: 1; cursor: default; }
    .chip .mute { display: inline-flex; }
    .chip.open svg:last-child { transform: rotate(180deg); }
    .tip { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); display: none; align-items: center;
      gap: 8px; padding: 6px 8px 6px 10px; border-radius: 8px; background: #1b1b1b; color: #ededed; font-size: 12px;
      box-shadow: 0 6px 16px rgba(0,0,0,.2); pointer-events: none; }
    .ib:hover .tip { display: flex; }
    .count { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: #4c8dff; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; }
    .chip.warn { background: rgba(245,166,35,.14); color: #ffd28a; }
    .warn-dot { width: 7px; height: 7px; border-radius: 4px; background: #f5a623; }
    .busy { display: inline-flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; color: #cfcfcf; white-space: nowrap; }
    .spin { display: inline-flex; animation: prf-spin .9s linear infinite; }
    @keyframes prf-spin { to { transform: rotate(360deg); } }
    .idle { position: fixed; right: 16px; bottom: 16px; height: 50px; gap: 8px; padding: 0 14px; color: #ededed; }
    .idle:hover { background: #262626; }
    .toast-text b { font-weight: 600; }
    .toast-text a { margin-left: 12px; }
  `);
})();
