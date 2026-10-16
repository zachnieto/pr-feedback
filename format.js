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

// One checklist item. Extra regions live on `captures`; a point without that array is a single region.
export function shotsOf(point) {
  return point.captures?.length ? point.captures : [point];
}

// images[i] is the URL of points[i]'s screenshot, or an array of URLs when the point has several regions.
export function formatComment(target, points, images) {
  const urlsOf = (i) => (Array.isArray(images[i]) ? images[i] : [images[i]]);
  const items = points.map((p, i) => {
    const shots = shotsOf(p);
    const urls = urlsOf(i);
    const comment = (p.comment ?? "").replace(/\r\n?/g, "\n").trim();
    // Context is captured on the page where the comment is written, which is the last region.
    const blocks = shots.map((shot, j) => {
      const r = shot.rect ?? {};
      const where = shot.selector ? code(shot.selector) : `Region ${Math.round(r.width)} × ${Math.round(r.height)}`;
      const facts = j === shots.length - 1 ? contextFacts(p.context) : [];
      const meta = [`[${escText(shot.url)}](${linkDest(shot.url)})`, where, ...facts].join(" · ");
      const alt = shots.length > 1 ? `point ${i + 1} · ${j + 1}` : `point ${i + 1}`;
      const img = `<img src="${escHtml(urls[j])}" alt="${alt}"${shot.width ? ` width="${shot.width}"` : ""}>`;
      return `<sub>${meta}</sub>\n${img}`;
    });
    // GitHub renders single newlines in comments as line breaks, so a one-line comment, its meta and its image
    // share one tight paragraph. A multi-line comment may hold block markdown, so it gets a paragraph break.
    // Extra regions are their own paragraphs so each shot stays readable inside the same checklist item.
    const head = `- [ ] **${i + 1}.** ${comment}${comment.includes("\n") ? "\n" : ""}`;
    const errors = errorsBlock(p.context?.consoleErrors);
    const gap = shots.length > 1 ? "\n\n" : "\n";
    return indent([`${head}\n${blocks.join(gap)}`, errors].filter(Boolean).join("\n\n"));
  });
  const data = {
    target,
    points: points.map((p, i) => {
      const shots = shotsOf(p);
      const urls = urlsOf(i);
      const first = shots[0];
      const row = {
        n: i + 1,
        comment: p.comment,
        url: first.url,
        selector: first.selector ?? null,
        rect: first.rect,
        image: urls[0],
        context: p.context ?? null,
      };
      if (shots.length > 1) {
        row.captures = shots.map((shot, j) => ({
          url: shot.url,
          selector: shot.selector ?? null,
          rect: shot.rect,
          image: urls[j],
        }));
      }
      return row;
    }),
  };
  return [`### UI feedback (${points.length})`, items.join("\n\n---\n\n"), `<!-- pr-feedback:v1 ${hideJson(data)} -->`].join("\n\n");
}
