// Builds the PR comment: a task list for people plus a hidden JSON block for tools.
// Comments are markdown on purpose; URLs, selectors and page text are escaped so they render literally.

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
// Inline page text: one line, no HTML, no markdown emphasis or links.
const escText = (s) => escHtml(String(s).replace(/\s+/g, " ")).replace(/[\\`*_[\]~|]/g, "\\$&");
// A backtick fence longer than any backtick run in `s`.
const fence = (s, min) => "`".repeat(Math.max(min, ...(String(s).match(/`+/g) ?? []).map((run) => run.length + 1)));
export function code(s) {
  s = String(s).replace(/\s+/g, " ");
  const f = fence(s, 1);
  return /^`|`$/.test(s) ? `${f} ${s} ${f}` : `${f}${s}${f}`;
}
// Percent-encodes what would end or break a markdown link destination.
const linkDest = (url) => String(url).replace(/[ \t\r\n<>()\\`]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
// Continuation lines indented to the list item's content column so they stay inside it.
const indent = (s) => s.replace(/\n(?=[^\n])/g, "\n  ");

function contextFacts(c = {}) {
  const v = c.viewport;
  return [
    v && `${v.width} × ${v.height}${v.dpr && v.dpr !== 1 ? ` (${v.dpr}x)` : ""}`,
    c.browser && escText(c.browser),
    c.component && code(c.component),
  ].filter(Boolean);
}

function errorsBlock(errors = []) {
  if (!errors.length) return null;
  const text = errors.join("\n").replace(/\r\n?/g, "\n");
  const f = fence(text, 3);
  return `<details><summary>Console errors (${errors.length})</summary>\n\n${f}\n${text}\n${f}\n\n</details>`;
}

// HTML comments end at "--"; "-" is a JSON escape for "-", so JSON.parse reads the block as is.
export const hideJson = (data) => JSON.stringify(data).replace(/--/g, "-\\u002d");

// images[i] is the URL of points[i]'s screenshot.
export function formatComment(target, points, images) {
  const items = points.map((p, i) => {
    const r = p.rect ?? {};
    const where = p.selector ? code(p.selector) : `Region ${Math.round(r.width)} × ${Math.round(r.height)}`;
    const comment = (p.comment ?? "").replace(/\r\n?/g, "\n").trim();
    const meta = [`[${escText(p.url)}](${linkDest(p.url)})`, where, ...contextFacts(p.context)].join(" · ");
    const img = `<img src="${escHtml(images[i])}" alt="point ${i + 1}"${p.width ? ` width="${p.width}"` : ""}>`;
    // GitHub renders single newlines in comments as line breaks, so a one-line comment, its meta and its image
    // share one tight paragraph. A multi-line comment may hold block markdown, so it gets a paragraph break.
    const head = `- [ ] **${i + 1}.** ${comment}${comment.includes("\n") ? "\n" : ""}`;
    const errors = errorsBlock(p.context?.consoleErrors);
    return indent([`${head}\n<sub>${meta}</sub>\n${img}`, errors].filter(Boolean).join("\n\n"));
  });
  const data = {
    target,
    points: points.map((p, i) => ({
      n: i + 1,
      comment: p.comment,
      url: p.url,
      selector: p.selector ?? null,
      rect: p.rect,
      image: images[i],
      context: p.context ?? null,
    })),
  };
  return [`### UI feedback (${points.length})`, items.join("\n\n---\n\n"), `<!-- pr-feedback:v1 ${hideJson(data)} -->`].join("\n\n");
}
