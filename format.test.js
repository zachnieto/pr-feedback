import assert from "node:assert/strict";
import { code, formatComment, hideJson } from "./format.js";

const points = [
  {
    url: "https://pr-1.preview.example.com/a?x=<b>&y=`z`)",
    selector: "main > button.save",
    rect: { x: 1, y: 2, width: 120.4, height: 40 },
    comment: "Button is misaligned.\n\nAlso:\n- too small\n```\nnot a fence break\n```",
    width: 120,
    context: {
      viewport: { width: 1440, height: 900, dpr: 2 },
      browser: "Chrome 130",
      component: "SaveButton",
      consoleErrors: ["TypeError: x is undefined\n    at foo (app.js:1)", "has ``` inside"],
    },
  },
  { url: "https://example.com/", selector: null, rect: { x: 0, y: 0, width: 300, height: 200 }, comment: "Region note --> end <!-- x", width: 300 },
];
const images = ["https://github.com/acme/web/blob/abc/1.png?raw=true", "https://github.com/acme/web/blob/abc/2.png?raw=true"];
const body = formatComment("github:acme/web#7", points, images);
const lines = body.split("\n");

assert.equal(lines[0], "### UI feedback (2)");
assert.ok(body.includes("\n\n- [ ] **1.** Button is misaligned.\n"));
assert.ok(body.includes("\n\n- [ ] **2.** Region note --> end <!-- x\n"));

// Everything between an item's first line and the next item is blank or indented, so it renders inside the item.
const item1 = body.slice(body.indexOf("- [ ] **1.**"), body.indexOf("\n\n---\n\n- [ ] **2.**")).split("\n").slice(1);
for (const l of item1) assert.ok(l === "" || l.startsWith("  "), `escapes the list item: ${JSON.stringify(l)}`);
assert.ok(item1.includes("  - too small"), "multi-line comment stays in the item");
assert.ok(item1.includes('  <img src="https://github.com/acme/web/blob/abc/1.png?raw=true" alt="point 1" width="120">'));
assert.ok(item1.includes("  <details><summary>Console errors (2)</summary>"));
assert.ok(item1.includes("  ````"), "fence longer than any backtick run in the errors");
assert.ok(item1.includes("  </details>"));
// One meta line per point; the page URL can't inject HTML or markdown.
assert.ok(item1.includes("  <sub>[https://pr-1.preview.example.com/a?x=&#60;b&#62;&#38;y=\\`z\\`)](https://pr-1.preview.example.com/a?x=%3cb%3e&y=%60z%60%29) · `main > button.save` · 1440 × 900 (2x) · Chrome 130 · `SaveButton`</sub>"));
// A multi-line comment is split from its meta by a blank line so block markdown in it can't swallow the meta.
assert.ok(body.includes("```\n\n  <sub>[https://pr-1"));
// A one-line comment, its meta and its image are one tight paragraph; points are split by dividers.
assert.ok(body.includes('\n\n---\n\n- [ ] **2.** Region note --> end <!-- x\n  <sub>[https://example.com/](https://example.com/) · Region 300 × 200</sub>\n  <img src="https://github.com/acme/web/blob/abc/2.png?raw=true" alt="point 2" width="300">\n\n<!-- pr-feedback:v1 '));

assert.equal(code("a`b"), "``a`b``");
assert.equal(code("`x"), "`` `x ``");

// Hidden block: last line, one HTML comment, round-trips through JSON.parse.
const last = lines.at(-1);
const m = last.match(/^<!-- pr-feedback:v1 (.*) -->$/);
assert.ok(m, "machine-readable block is the last line");
assert.ok(!m[1].includes("--"), "no -- inside the HTML comment");
const data = JSON.parse(m[1]);
assert.equal(data.target, "github:acme/web#7");
assert.deepEqual(data.points[0], {
  n: 1,
  comment: points[0].comment,
  url: points[0].url,
  selector: points[0].selector,
  rect: points[0].rect,
  image: images[0],
  context: points[0].context,
});
assert.equal(data.points[1].comment, "Region note --> end <!-- x");
assert.equal(data.points[1].selector, null);

const tricky = { s: "a---b----c\\--d", n: -1 };
assert.deepEqual(JSON.parse(hideJson(tricky)), tricky);
assert.ok(!hideJson(tricky).includes("--"));

// Several regions, one checklist item. Context sits on the last region — that's the page where the note was written.
const grouped = {
  comment: "Selected personal, but the connector shows shared",
  context: { viewport: { width: 800, height: 600, dpr: 1 }, browser: "Chrome 130" },
  captures: [
    { url: "https://example.com/setup", selector: "#personal", rect: { x: 1, y: 2, width: 40, height: 20 }, width: 40 },
    { url: "https://example.com/details", selector: null, rect: { x: 3, y: 4, width: 80, height: 50 }, width: 80 },
  ],
};
const groupedImages = ["https://github.com/acme/web/blob/abc/a.png?raw=true", "https://github.com/acme/web/blob/abc/b.png?raw=true"];
const groupedBody = formatComment("github:acme/web#7", [grouped], [groupedImages]);
assert.equal(groupedBody.split("\n")[0], "### UI feedback (1)");
assert.equal(groupedBody.match(/^- \[ \]/gm).length, 1);
assert.ok(groupedBody.includes("- [ ] **1.** Selected personal, but the connector shows shared\n"));
assert.ok(groupedBody.includes("[https://example.com/setup](https://example.com/setup) · `#personal`"));
assert.ok(groupedBody.includes("[https://example.com/details](https://example.com/details) · Region 80 × 50 · 800 × 600 · Chrome 130"));
assert.ok(groupedBody.indexOf("example.com/setup") < groupedBody.indexOf("example.com/details"));
assert.ok(groupedBody.indexOf("example.com/details") < groupedBody.indexOf("800 × 600"));
assert.equal(groupedBody.match(/<img /g).length, 2);
assert.ok(groupedBody.includes('alt="point 1 · 1" width="40"'));
assert.ok(groupedBody.includes('alt="point 1 · 2" width="80"'));
const groupedItem = groupedBody.slice(groupedBody.indexOf("- [ ] **1.**"), groupedBody.indexOf("\n\n<!-- pr-feedback:v1 ")).split("\n").slice(1);
for (const l of groupedItem) assert.ok(l === "" || l.startsWith("  "), `escapes the grouped item: ${JSON.stringify(l)}`);
const groupedData = JSON.parse(groupedBody.match(/^<!-- pr-feedback:v1 (.*) -->$/m)[1]);
assert.equal(groupedData.points[0].url, "https://example.com/setup");
assert.equal(groupedData.points[0].image, groupedImages[0]);
assert.deepEqual(groupedData.points[0].captures, [
  { url: "https://example.com/setup", selector: "#personal", rect: grouped.captures[0].rect, image: groupedImages[0] },
  { url: "https://example.com/details", selector: null, rect: grouped.captures[1].rect, image: groupedImages[1] },
]);
