// GitHub network calls shared by the background worker and the options page.

export async function githubApi(token, path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) {
    const { message } = await res.json().catch(() => ({}));
    const hint = res.status === 401 ? " (sign in again in the extension options)" : "";
    throw Object.assign(new Error(`GitHub ${res.status} on ${path.split("?")[0]}: ${message ?? res.statusText}${hint}`), {
      status: res.status,
    });
  }
  return res.json();
}

export const targetItem = (repo, number, title) => ({ target: `github:${repo}#${number}`, title, number, repo });

export const issueTitle = async (token, repo, number) => (await githubApi(token, `/repos/${repo}/issues/${number}`)).title;

// Open PRs matching `query`, in `repo` when given, else ones the user is involved in.
export async function searchPulls(token, query, repo, limit = 8) {
  const q = `is:pr is:open ${repo ? `repo:${repo}` : "involves:@me"} ${query}`.trim();
  const params = new URLSearchParams({ q, sort: "updated", order: "desc", per_page: String(limit) });
  const { items } = await githubApi(token, `/search/issues?${params}`);
  return items.map((i) => targetItem(i.repository_url.split("/repos/")[1], i.number, i.title));
}

const wait = (s) => new Promise((ok) => setTimeout(ok, s * 1000));

async function oauthPost(path, params) {
  const res = await fetch(`https://github.com/login/${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) throw new Error(`GitHub ${res.status} on /login/${path}`);
  return data;
}

// OAuth device flow (the OAuth App needs "Enable Device Flow"). onCode({user_code, verification_uri}) shows the code.
export async function deviceSignIn(clientId, onCode, sleep = wait) {
  const start = await oauthPost("device/code", { client_id: clientId, scope: "repo" });
  if (start.error) throw new Error(start.error_description ?? start.error);
  onCode(start);
  let interval = start.interval ?? 5;
  const deadline = Date.now() + (start.expires_in ?? 900) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const r = await oauthPost("oauth/access_token", {
      client_id: clientId,
      device_code: start.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (r.access_token) return { token: r.access_token, login: (await githubApi(r.access_token, "/user")).login };
    if (r.error === "slow_down") interval = r.interval ?? interval + 5;
    else if (r.error !== "authorization_pending") throw new Error(r.error_description ?? r.error);
  }
  throw new Error("The sign-in code expired. Try again.");
}
