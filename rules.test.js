import assert from "node:assert/strict";
import { DEFAULT_RULES, MAX_RECENT, originOf, pushRecent, resolveTarget } from "./rules.js";

const r = (s) => resolveTarget(s, DEFAULT_RULES);
assert.equal(r("https://pr-3757.preview.newtonresearch.ai/conversations/1"), "github:Newton-Research-Inc/newton#3757");
assert.equal(r("https://pr-3757.preview.newtonresearch.ai"), "github:Newton-Research-Inc/newton#3757");
assert.equal(r("https://pr-3757.preview.newtonresearch.ai.evil.com/"), null);
assert.equal(r("https://github.com/Newton-Research-Inc/newton/pull/42/files"), "github:Newton-Research-Inc/newton#42");
assert.equal(r("https://github.com/acme/web/issues/9"), "github:acme/web#9");
assert.equal(r(" acme/web#7 "), "github:acme/web#7");
assert.equal(r("https://example.com/"), null);

// Canonical targets (picked search results) pass through; look-alike URLs don't.
assert.equal(r("github:acme/web#12"), "github:acme/web#12");
assert.equal(r("https://example.com/page#12"), null);

const remembered = { "http://localhost:5176": "github:acme/web#5" };
const rr = (s) => resolveTarget(s, DEFAULT_RULES, remembered);
assert.equal(rr("http://localhost:5176/conversations/9"), "github:acme/web#5");
assert.equal(rr("http://localhost:5177/"), null);
assert.equal(rr("https://github.com/acme/web/pull/42"), "github:acme/web#42", "rules win over remembered");
assert.equal(rr(""), null);

assert.equal(originOf("http://localhost:5176/a?b#c"), "http://localhost:5176");
assert.equal(originOf("acme/web#7"), null);
assert.equal(originOf("localhost:5176/x"), null);
assert.equal(originOf("chrome://extensions"), null);

const item = (n) => ({ target: `github:acme/web#${n}`, title: `PR ${n}`, number: n, repo: "acme/web" });
let recent;
for (const n of [1, 2, 3, 2, 4, 5, 6]) recent = pushRecent(recent, item(n));
assert.deepEqual(recent.map((i) => i.number), [6, 5, 4, 2, 3], "newest first, deduped, capped");
assert.equal(recent.length, MAX_RECENT);
