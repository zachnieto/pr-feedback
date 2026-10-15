import assert from "node:assert/strict";
import { DEFAULT_RULES, resolveTarget } from "./rules.js";

const r = (s) => resolveTarget(s, DEFAULT_RULES);
assert.equal(r("https://pr-3757.preview.newtonresearch.ai/conversations/1"), "github:Newton-Research-Inc/newton#3757");
assert.equal(r("https://pr-3757.preview.newtonresearch.ai"), "github:Newton-Research-Inc/newton#3757");
assert.equal(r("https://pr-3757.preview.newtonresearch.ai.evil.com/"), null);
assert.equal(r("https://github.com/Newton-Research-Inc/newton/pull/42/files"), "github:Newton-Research-Inc/newton#42");
assert.equal(r("https://github.com/acme/web/issues/9"), "github:acme/web#9");
assert.equal(r(" acme/web#7 "), "github:acme/web#7");
assert.equal(r("https://example.com/"), null);
console.log("ok");
