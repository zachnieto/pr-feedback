// Phase 2 hook: numbered pins on the page for points captured on this URL.
// Point document position = rect + scroll. Defining PRF.showOnPage(point) also adds a
// "Show on page" button to each item in the points list.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("pins")) return;
  PRF.loaded.add("pins");

  PRF.renderPins = (_session) => {};
  PRF.onRender((s) => PRF.renderPins(s));
})();
