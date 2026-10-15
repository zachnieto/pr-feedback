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
        { className: "chip warn", title: "Choose where feedback goes", onclick: pickTarget },
        h("span", { className: "warn-dot" }),
        h("span", { textContent: "Choose target" }),
        icon("chevron", 14, 2),
      );
    const { repo, number } = PRF.targetLabel(target);
    return h(
      "button",
      { className: "chip", title: interactive ? `${target}\nChange where feedback goes` : target, disabled: !interactive, onclick: pickTarget },
      icon("pr", 16),
      h("span", { textContent: repo }),
      number ? h("span", { className: "mute", textContent: `#${number}` }) : "",
      interactive ? h("span", { className: "mute" }, icon("chevron", 14, 2)) : "",
    );
  }

  function bar(s) {
    const n = s.points.length;
    const modeBtn = (mode, iconName, label) =>
      h(
        "button",
        {
          className: `ib${PRF.mode === mode ? " on" : ""}`,
          ariaLabel: label,
          title: label,
          onclick: () => {
            PRF.panel = null;
            PRF.toggleMode(mode);
          },
        },
        icon(iconName),
      );
    return [
      dot(true),
      chip(s.target, true),
      sep(),
      modeBtn("element", "cursor", "Select element"),
      modeBtn("region", "region", "Select region"),
      h(
        "button",
        {
          className: `ib${n && PRF.panel === "points" ? " on" : ""}`,
          ariaLabel: "Points",
          title: "Review points",
          disabled: !n,
          onclick: () => {
            PRF.stopMode();
            PRF.setPanel(PRF.panel === "points" ? null : "points");
          },
        },
        icon("list"),
        n ? h("span", { className: "badge", textContent: n }) : "",
      ),
      sep(),
      h(
        "button",
        { className: "primary", disabled: !n || !s.target, title: s.target ? "Post to the PR" : "Choose a target first", onclick: submit },
        "Send",
        icon("up", 14, 2.25),
      ),
      h("button", { className: "ib", ariaLabel: "Discard feedback", title: "Discard feedback", onclick: discard }, icon("x", 16)),
    ];
  }

  const busyBar = (s) => [
    dot(false),
    chip(s.target, false),
    sep(),
    h("span", { className: "busy" }, h("span", { className: "spin" }, icon("spinner", 16, 2)), "Uploading screenshots"),
  ];

  function pickTarget() {
    PRF.stopMode();
    PRF.openTargetPicker();
  }

  async function submit() {
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
    if (n && !confirm(`Discard ${PRF.plural(n, "point")}?`)) return;
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
