// Runs in the page's MAIN world at document_start (see manifest), so it shares globals with
// the page, not with the other content scripts. It records recent console errors and reads
// React fibers, which the isolated world can't see, and answers context.js over DOM events:
// "prf:ask" gets a synchronous "prf:answer" whose detail is JSON (objects don't cross worlds).
// Nothing here may throw into the page.
(() => {
  // The action click re-injects every content file; a non-enumerable flag keeps one copy running.
  if (window.__prfMainWorld) return;
  Object.defineProperty(window, "__prfMainWorld", { value: true });

  const errors = [];
  let last = "";
  let repeats = 1;
  const where = (file, line) => (file ? ` (${file.replace(location.origin, "")}:${line})` : "");
  const describe = (v) => {
    if (v instanceof Error) {
      const at = v.stack?.match(/(https?:\/\/\S+?):(\d+):\d+/);
      return String(v) + (at ? where(at[1], at[2]) : "");
    }
    if (typeof v !== "object" || v === null) return String(v);
    try {
      return JSON.stringify(v).slice(0, 300);
    } catch {
      return Object.prototype.toString.call(v);
    }
  };
  function record(text) {
    text = text.length > 300 ? `${text.slice(0, 299)}…` : text;
    // A render loop logging the same error would otherwise push out everything else.
    if (text === last) {
      errors[errors.length - 1] = `${text} (×${++repeats})`;
      return;
    }
    last = text;
    repeats = 1;
    errors.push(text);
    if (errors.length > 20) errors.shift();
  }
  // console.error("Failed %s: %o", a, b) -> "Failed a: b"; %c consumes its CSS argument.
  function format(args) {
    if (typeof args[0] !== "string") return args.map(describe).join(" ");
    let i = 1;
    const head = args[0].replace(/%[sdifoOc]/g, (m) => (i >= args.length ? m : m === "%c" ? (i++, "") : describe(args[i++])));
    return [head, ...args.slice(i).map(describe)].join(" ");
  }

  const original = console.error;
  console.error = function (...args) {
    try {
      record(format(args));
    } catch {}
    return original.apply(this, args);
  };
  window.addEventListener("error", (e) => {
    try {
      record(e.message + where(e.filename, e.lineno));
    } catch {}
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      record(`Unhandled rejection: ${describe(e.reason)}`);
    } catch {}
  });

  const INTERNAL = /^(Anonymous|Fragment|Suspense|StrictMode|Profiler|Router|Routes|Route|Outlet)$|Provider$|Consumer$|Context$|^_|\./;
  // "ChartCard > Legend": up to 3 nearest named components above the element, outermost first.
  function component(el) {
    for (; el; el = el.parentElement) {
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
      if (!key) continue;
      const names = [];
      for (let f = el[key], n = 0; f && names.length < 3 && n < 500; f = f.return, n++) {
        const t = f.type;
        // forwardRef keeps the function on .render, memo on .type.
        const fn = typeof t === "function" ? t : (t?.render ?? t?.type);
        const name = t?.displayName || fn?.displayName || fn?.name;
        // 1-2 character names come from minified builds.
        if (typeof fn === "function" && name?.length > 2 && !INTERNAL.test(name) && names[0] !== name) names.unshift(name);
      }
      return names.join(" > ") || null;
    }
    return null;
  }

  document.addEventListener("prf:ask", () => {
    let answer = null;
    try {
      answer = { errors, component: component(document.querySelector("[data-prf-probe]")) };
    } catch {}
    document.dispatchEvent(new CustomEvent("prf:answer", { detail: JSON.stringify(answer) }));
  });
})();
