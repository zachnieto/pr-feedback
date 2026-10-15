// Phase 2 hooks: optional context attached to a point (console errors, viewport, ...).
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("context")) return;
  PRF.loaded.add("context");

  // Checkboxes in the composer: [{ key, label, hint?, checked? }] (checked defaults to true).
  PRF.contextOptions = () => [];
  // Called with the checked option keys when a point is added; may be async.
  // Returns the point's `context` object, or undefined to attach none.
  PRF.collectContext = (_keys) => undefined;
  // Short labels shown under a point in the points list, e.g. "2 console errors".
  PRF.contextTags = (_point) => [];
})();
