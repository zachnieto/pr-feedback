import assert from "node:assert/strict";
import { deviceSignIn, searchPulls } from "./github.js";

const json = (data, status = 200) => ({ ok: status < 400, status, statusText: "", json: async () => data });
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    return handler(String(url), opts, calls.length);
  };
  return calls;
}

// Search: scoped to the repo when given, else the user's PRs.
let calls = stubFetch(() =>
  json({ items: [{ number: 3, title: "Fix it", repository_url: "https://api.github.com/repos/acme/web" }] }),
);
assert.deepEqual(await searchPulls("t", "save button", "acme/web"), [
  { target: "github:acme/web#3", title: "Fix it", number: 3, repo: "acme/web" },
]);
let q = new URL(calls[0].url).searchParams;
assert.equal(q.get("q"), "is:pr is:open repo:acme/web save button");
assert.equal(q.get("per_page"), "8");
assert.equal(calls[0].opts.headers.Authorization, "Bearer t");
await searchPulls("t", "", undefined);
assert.equal(new URL(calls[1].url).searchParams.get("q"), "is:pr is:open involves:@me");

stubFetch(() => json({ message: "API rate limit exceeded" }, 403));
await assert.rejects(searchPulls("t", "x"), /GitHub 403 on \/search\/issues: API rate limit exceeded/);

// Device flow: pending, slow_down (interval grows), then a token and the login.
const sleeps = [];
calls = stubFetch((url, opts, n) => {
  if (url.endsWith("/login/device/code"))
    return json({ device_code: "dc", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", interval: 5, expires_in: 900 });
  if (url.endsWith("/login/oauth/access_token")) {
    const body = new URLSearchParams(opts.body);
    assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
    assert.equal(body.get("device_code"), "dc");
    return json([{ error: "authorization_pending" }, { error: "slow_down", interval: 10 }, { access_token: "tok" }][n - 2]);
  }
  if (url === "https://api.github.com/user") return json({ login: "octo" });
  throw new Error(`unexpected ${url}`);
});
let shown;
const auth = await deviceSignIn("cid", (c) => (shown = c.user_code), async (s) => sleeps.push(s));
assert.deepEqual(auth, { token: "tok", login: "octo" });
assert.equal(shown, "ABCD-1234");
assert.deepEqual(sleeps, [5, 5, 10]);
assert.equal(calls[0].opts.headers.Accept, "application/json");
assert.equal(new URLSearchParams(calls[0].opts.body).get("scope"), "repo");

stubFetch((url) =>
  json(url.endsWith("device/code") ? { device_code: "dc", user_code: "X", verification_uri: "u", interval: 1 } : { error: "access_denied", error_description: "The user denied it" }),
);
await assert.rejects(deviceSignIn("cid", () => {}, async () => {}), /The user denied it/);
