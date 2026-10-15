// Target picker popover, opened from the toolbar's target chip via PRF.openTargetPicker().
// Phase 1 is a single input that resolves a PR URL or owner/repo#123 through the rules.
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
    if (pop) return;
    const error = h("div", { className: "target-error", hidden: true });
    const input = h("input", { placeholder: "PR URL or owner/repo#123", ariaLabel: "PR URL or owner/repo#123" });
    input.onkeydown = async (e) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Enter") return;
      try {
        if (await send({ type: "setTarget", input: input.value })) return close();
        error.textContent = "No rule matches that. Paste a PR URL or owner/repo#123.";
      } catch (err) {
        error.textContent = err.message;
      }
      error.hidden = false;
    };
    pop = PRF.root().appendChild(
      h("div", { className: "pop above target" }, h("label", { className: "search" }, icon("search", 15, 2), input), error),
    );
    input.focus();
  });

  PRF.styles.push(`
    .target { width: 456px; max-width: calc(100vw - 32px); gap: 8px; padding: 8px; }
    .search { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 10px; border-radius: 9px;
      background: #252525; border: 1px solid rgba(76,141,255,.6); color: #9b9b9b; }
    .search input { flex: 1; height: 100%; padding: 0; border: 0; background: transparent; }
    .target-error { padding: 8px 10px; border-radius: 9px; background: rgba(245,166,35,.1); color: #ffd28a; font-size: 12px; }
  `);
})();
