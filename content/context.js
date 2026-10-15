// Debugging context attached to a point: console errors, viewport and browser, React component.
// Console errors and React fibers live in the page's MAIN world, so main-world.js answers for them.
(() => {
  const PRF = window.PRF;
  if (PRF.loaded.has("context")) return;
  PRF.loaded.add("context");

  // Taken when the composer opens, so what is offered is what gets attached.
  let snap = {};

  // The overlay host is skipped so the composer popover over the selection is never the hit.
  function elementAt(r) {
    const x = Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1);
    return document.elementsFromPoint(x, y).find((el) => el !== PRF.host);
  }

  // Event dispatch is synchronous, so main-world.js has answered by the time dispatchEvent returns.
  function askPage(el) {
    let answer = null;
    const listen = (e) => {
      try {
        answer = JSON.parse(e.detail);
      } catch {}
    };
    document.addEventListener("prf:answer", listen);
    el?.setAttribute("data-prf-probe", "");
    try {
      document.dispatchEvent(new CustomEvent("prf:ask"));
    } finally {
      el?.removeAttribute("data-prf-probe");
      document.removeEventListener("prf:answer", listen);
    }
    return answer ?? {};
  }

  function browser() {
    const d = navigator.userAgentData;
    const b = d?.brands.find((x) => !/Not.?A.?Brand|Chromium/i.test(x.brand)) ?? d?.brands.find((x) => x.brand === "Chromium");
    if (b) return [`${b.brand.replace(/^(Google|Microsoft) /, "")} ${b.version}`, d.platform].filter(Boolean).join(" · ");
    // userAgentData only exists in secure contexts; plain-http pages fall back to the UA string.
    const ua = navigator.userAgent;
    const [, name = "Browser", version = ""] = ua.match(/(Edg|OPR|Firefox)\/(\d+)/) ?? ua.match(/(Chrome)\/(\d+)/) ?? [];
    const os = /Mac OS X/.test(ua) ? "macOS" : ua.match(/Windows|Android|CrOS|Linux/)?.[0];
    return [`${{ Edg: "Edge", OPR: "Opera" }[name] ?? name} ${version}`.trim(), os].filter(Boolean).join(" · ");
  }

  // Composer checkboxes for a selection rect: [{ key, label, hint?, checked? }] (checked defaults to true).
  PRF.contextOptions = (rect) => {
    const { errors = [], component } = askPage(rect && elementAt(rect));
    snap = {
      consoleErrors: errors,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      browser: browser(),
      component: component || undefined,
    };
    return [
      errors.length && { key: "consoleErrors", label: "Attach console errors", hint: `(${errors.length})` },
      { key: "viewport", label: "Attach viewport and browser" },
      component && { key: "component", label: "Attach React component", hint: component },
    ].filter(Boolean);
  };

  // The point's `context` for the checked option keys, or undefined when none are checked.
  PRF.collectContext = (keys) => {
    const context = {};
    if (keys.includes("consoleErrors")) context.consoleErrors = snap.consoleErrors;
    if (keys.includes("viewport")) Object.assign(context, { viewport: snap.viewport, browser: snap.browser });
    if (keys.includes("component")) context.component = snap.component;
    return Object.keys(context).length ? context : undefined;
  };

  // Short labels under a point in the points list, e.g. "2 console errors", "1280 × 760 · Chrome".
  PRF.contextTags = ({ context: c }) =>
    [
      c?.consoleErrors?.length && PRF.plural(c.consoleErrors.length, "console error"),
      c?.viewport && [PRF.size(c.viewport), c.browser?.split(" ")[0]].filter(Boolean).join(" · "),
      c?.component,
    ].filter(Boolean);
})();
