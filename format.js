// Builds the PR comment (a task list for people plus a hidden JSON block for tools) and the clipboard copy.
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

// How page text renders in each output: `text` for prose, `mono` for selectors and names, `link` for page URLs.
const markdown = { text: escText, mono: code, link: (url) => `[${escText(url)}](${linkDest(url)})` };
const html = { text: escHtml, mono: (s) => `<code>${escHtml(s)}</code>`, link: (url) => `<a href="${escHtml(url)}">${escHtml(url)}</a>` };
const plain = { text: String, mono: String, link: String };

// One region's meta line parts: page, selector or size, then the point's context on its last region,
// which is the page where the comment was written.
function metaOf(point, j, esc) {
  const shots = shotsOf(point);
  const shot = shots[j];
  const r = shot.rect ?? {};
  const parts = [esc.link(shot.url), shot.selector ? esc.mono(shot.selector) : `Region ${Math.round(r.width)} × ${Math.round(r.height)}`];
  if (j < shots.length - 1) return parts;
  const c = point.context ?? {};
  const v = c.viewport;
  return [
    ...parts,
    v && `${v.width} × ${v.height}${v.dpr && v.dpr !== 1 ? ` (${v.dpr}x)` : ""}`,
    c.browser && esc.text(c.browser),
    c.component && esc.mono(c.component),
  ].filter(Boolean);
}
const commentOf = (p) => (p.comment ?? "").replace(/\r\n?/g, "\n").trim();
const errorsOf = (p) => (p.context?.consoleErrors ?? []).join("\n").replace(/\r\n?/g, "\n");

function errorsBlock(p) {
  const n = p.context?.consoleErrors?.length;
  if (!n) return null;
  const text = errorsOf(p);
  const f = fence(text, 3);
  return `<details><summary>Console errors (${n})</summary>\n\n${f}\n${text}\n${f}\n\n</details>`;
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
    const comment = commentOf(p);
    const blocks = shots.map((shot, j) => {
      const meta = metaOf(p, j, markdown).join(" · ");
      const alt = shots.length > 1 ? `point ${i + 1} · ${j + 1}` : `point ${i + 1}`;
      const img = `<img src="${escHtml(urls[j])}" alt="${alt}"${shot.width ? ` width="${shot.width}"` : ""}>`;
      return `<sub>${meta}</sub>\n${img}`;
    });
    // GitHub renders single newlines in comments as line breaks, so a one-line comment, its meta and its image
    // share one tight paragraph. A multi-line comment may hold block markdown, so it gets a paragraph break.
    // Extra regions are their own paragraphs so each shot stays readable inside the same checklist item.
    const head = `- [ ] **${i + 1}.** ${comment}${comment.includes("\n") ? "\n" : ""}`;
    const errors = errorsBlock(p);
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

// Clipboard copy for chat, docs or trackers: plain text, plus HTML with the screenshots inlined.
export function formatClipboard(points) {
  const title = `UI feedback (${points.length})`;
  const text = points.map((p, i) => {
    const lines = [`${i + 1}. ${commentOf(p).replace(/\n(?!\n)/g, "\n   ")}`];
    for (const j of shotsOf(p).keys()) lines.push(`   ${metaOf(p, j, plain).join(" · ")}`);
    const n = p.context?.consoleErrors?.length;
    if (n) lines.push(`   Console errors (${n}):`, errorsOf(p).replace(/^/gm, "     "));
    return lines.join("\n");
  });
  const items = points.map((p) => {
    const shots = shotsOf(p).map((shot, j) => {
      const img = `<img src="data:image/png;base64,${shot.image}"${shot.width ? ` width="${shot.width}"` : ""}>`;
      return `<p><small>${metaOf(p, j, html).join(" · ")}</small><br>${img}</p>`;
    });
    const errors = p.context?.consoleErrors?.length ? `<pre>${escHtml(errorsOf(p))}</pre>` : "";
    return `<li><p>${escHtml(commentOf(p)).replace(/\n/g, "<br>")}</p>${shots.join("")}${errors}</li>`;
  });
  return { text: [title, ...text].join("\n\n"), html: `<h3>${title}</h3><ol>${items.join("")}</ol>` };
}
