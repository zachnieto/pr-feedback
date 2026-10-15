// Target picker popover, opened from the toolbar's target chip via PRF.openTargetPicker().
// Searches PRs through the background (searchTargets) and also accepts a pasted URL or owner/repo#123.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("target")) return;
  PRF.loaded.add("target");
  const { h, icon, send } = PRF;

  let pop;
  PRF.openTargetPicker = () => PRF.setPanel(PRF.panel === "target" ? null : "target");
  const close = () => PRF.panel === "target" && PRF.setPanel(null);

  PRF.onRender((s) => {
    if (!s || PRF.panel !== "target") {
      pop?.remove();
      pop = null;
      return;
    }
    if (!pop) open(s);
  });

  function open(s) {
    const host = location.host;
    // "github:owner/repo#12" -> "owner/repo"
    const repo = s.target?.match(/^[^:]+:(.+)#\d+$/)?.[1];
    let items = [];
    let active = -1;
    let seq = 0;
    let timer;

    const input = h("input", { placeholder: "Search pull requests or paste a URL", ariaLabel: "Search pull requests or paste a URL" });
    const remember = h("input", { type: "checkbox", checked: true });
    const notice = h(
      "div",
      { className: "target-note", hidden: true },
      h("span", { className: "warn-dot" }),
      h("span", { className: "grow" }, "No rule matches ", h("span", { className: "mono", textContent: host })),
      h("a", {
        href: "#",
        textContent: "Add a rule",
        onclick: (e) => {
          e.preventDefault();
          send({ type: "openOptions" }).catch((err) => showError(err.message));
        },
      }),
    );
    const error = h("div", { className: "target-note", hidden: true });
    const list = h("div", { className: "target-list" });

    const showError = (text) => {
      error.textContent = text;
      error.hidden = !text;
    };

    const row = (item, i) =>
      h(
        "button",
        { className: `target-row${i === active ? " active" : ""}`, onmousemove: () => i !== active && highlight(i), onclick: () => pick(item.target) },
        h("span", { className: "pr-icon" }, icon("pr", 16, 1.9)),
        h(
          "span",
          { className: "target-text" },
          h("span", { className: "ellipsis", textContent: item.title ?? `${item.repo} #${item.number}` }),
          h("span", { className: "mono mute ellipsis", textContent: `${item.recent || item.repo !== repo ? `${item.repo} ` : ""}#${item.number}` }),
        ),
        i === active ? h("span", { className: "kbd", textContent: "↵" }) : "",
      );

    function draw() {
      const sec = (text) => h("div", { className: "sec", textContent: text });
      const group = (title, rows) => (rows.length ? [sec(title), ...rows.map((it) => row(it, items.indexOf(it)))] : []);
      list.replaceChildren(
        ...group("Recent", items.filter((it) => it.recent)),
        ...group(repo ? `Pull requests in ${repo.split("/").pop()}` : "Pull requests", items.filter((it) => !it.recent)),
      );
    }

    function highlight(i) {
      active = i;
      draw();
      list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    }

    async function search() {
      const mine = ++seq;
      let res;
      try {
        res = await send({ type: "searchTargets", query: input.value.trim(), ...(repo && { repo }) });
      } catch (e) {
        res = e;
      }
      if (mine !== seq) return;
      showError(res instanceof Error ? res.message : "");
      items = res instanceof Error ? [] : [...res.recent.map((it) => ({ ...it, recent: true })), ...res.results];
      active = items.length ? 0 : -1;
      draw();
    }

    async function pick(text) {
      if (!text) return;
      // A search still in flight would clear the error this may show.
      clearTimeout(timer);
      seq++;
      try {
        if (await send({ type: "setTarget", input: text, remember: remember.checked, origin: location.origin })) return close();
        showError("No rule matches that. Paste a PR URL or owner/repo#123.");
      } catch (e) {
        showError(e.message);
      }
    }

    input.oninput = () => {
      // Until fresh results land, Enter means the typed text, not a stale row.
      if (active >= 0) highlight(-1);
      clearTimeout(timer);
      timer = setTimeout(search, 250);
    };
    input.onkeydown = (e) => {
      const n = items.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (n) highlight(e.key === "ArrowDown" ? (active + 1) % n : active <= 0 ? n - 1 : active - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        pick(active >= 0 ? items[active].target : input.value.trim());
      }
    };

    pop = PRF.root().appendChild(
      h(
        "div",
        { className: "pop above target", onkeydown: (e) => e.key === "Escape" && close() },
        h("label", { className: "search" }, icon("search", 15, 2), input),
        notice,
        error,
        list,
        h(
          "div",
          { className: "target-foot" },
          h("label", { className: "remember" }, remember, "Remember for ", h("span", { className: "mono", textContent: host })),
          h("span", { className: "mute keys" }, h("span", { className: "kbd", textContent: "↑" }), h("span", { className: "kbd", textContent: "↓" }), "to move"),
        ),
      ),
    );
    input.focus();
    send({ type: "resolve", url: location.href }).then((t) => (notice.hidden = !!t), () => {});
    search();
  }

  PRF.styles.push(`
    .target { width: 456px; max-width: calc(100vw - 32px); max-height: min(70vh, 560px); padding: 8px; }
    .search { display: flex; align-items: center; gap: 8px; flex: none; height: 38px; padding: 0 10px; border-radius: 9px;
      background: #252525; border: 1px solid rgba(76,141,255,.6); color: #9b9b9b; }
    .search input { flex: 1; height: 100%; padding: 0; border: 0; background: transparent; }
    .target-note { display: flex; align-items: center; gap: 8px; flex: none; margin: 8px 2px 2px; padding: 8px 10px;
      border-radius: 9px; background: rgba(245,166,35,.1); color: #ffd28a; font-size: 12px; }
    .target-note a { color: #ffd28a; }
    .target-note .warn-dot { flex: none; }
    .grow { flex: 1; }
    .target-list { overflow: auto; }
    .sec { padding: 10px 10px 4px; color: #8a8a8a; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
    .target-row { justify-content: flex-start; align-items: flex-start; gap: 10px; width: 100%; padding: 8px 10px;
      border-radius: 9px; text-align: left; }
    .target-row.active { background: rgba(255,255,255,.08); }
    .pr-icon { display: inline-flex; flex: none; margin-top: 2px; color: #3fb950; }
    .target-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .target-foot { display: flex; align-items: center; justify-content: space-between; flex: none; margin-top: 6px; padding: 10px 10px 4px;
      border-top: 1px solid rgba(255,255,255,.08); font-size: 12px; }
    .remember { display: flex; align-items: center; gap: 8px; color: #cfcfcf; }
    .remember input { margin: 0; accent-color: #fff; }
    .keys { display: flex; align-items: center; gap: 4px; }
  `);
})();
