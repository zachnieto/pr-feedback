import { DEFAULT_RULES, resolveTarget } from "./rules.js";

// Screenshots are committed here so they render in private repos (GitHub has no
// attachment upload API). Never delete the branch: every comment linking it goes blank.
const ASSETS_BRANCH = "assets/pr-feedback";

const posters = { github: postToGithub };

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { token: "", rules: DEFAULT_RULES, ...settings };
}
const getSession = async () => (await chrome.storage.local.get("session")).session;
const setSession = (session) => chrome.storage.local.set({ session });

// ponytail: read-modify-write keyed by index, so two tabs editing the same instant can clobber each other
async function editPoints(change) {
  const session = await getSession();
  change(session.points);
  await setSession(session);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (await getSession()) return;
  const { rules } = await getSettings();
  await setSession({ target: resolveTarget(tab.url ?? "", rules), points: [] });
});

const handlers = {
  capture: ({ rect, dpr }, sender) => capture(sender.tab.windowId, rect, dpr),
  addPoint: ({ point }) => editPoints((points) => points.push(point)),
  updatePoint: ({ index, comment }) => editPoints((points) => (points[index].comment = comment)),
  removePoint: ({ index }) => editPoints((points) => points.splice(index, 1)),
  setTarget: async ({ input }) => {
    const target = resolveTarget(input, (await getSettings()).rules);
    if (target) await setSession({ ...(await getSession()), target });
    return target;
  },
  cancel: () => chrome.storage.local.remove("session"),
  submit,
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  Promise.resolve()
    .then(() => handlers[msg.type](msg, sender))
    .then((result) => respond({ result }), (e) => respond({ error: e.message }));
  return true;
});

async function capture(windowId, rect, dpr) {
  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const bmp = await createImageBitmap(await (await fetch(shot)).blob());
  const pad = 8 * dpr;
  const x = Math.max(0, Math.round(rect.x * dpr - pad));
  const y = Math.max(0, Math.round(rect.y * dpr - pad));
  const w = Math.min(bmp.width, Math.round((rect.x + rect.width) * dpr + pad)) - x;
  const h = Math.min(bmp.height, Math.round((rect.y + rect.height) * dpr + pad)) - y;
  if (w <= 0 || h <= 0) throw new Error("Selection is outside the visible page");
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, w, h);
  // Kept at device resolution for sharpness; `width` is the on-screen CSS size it displays at.
  return { image: await toBase64(await canvas.convertToBlob({ type: "image/png" })), width: Math.round(w / dpr) };
}

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function submit() {
  const session = await getSession();
  const { token } = await getSettings();
  if (!session?.points.length) throw new Error("Nothing to send yet");
  if (!session.target) throw new Error("Choose where to send this feedback first");
  const sep = session.target.indexOf(":");
  const [kind, ref] = [session.target.slice(0, sep), session.target.slice(sep + 1)];
  if (!posters[kind]) throw new Error(`No poster for "${kind}" targets`);
  const url = await posters[kind](ref, session.points, token);
  await chrome.storage.local.remove("session");
  chrome.tabs.create({ url });
}

async function postToGithub(ref, points, token) {
  if (!token) throw new Error("Set a GitHub token in the extension options");
  const [, repo, number] = ref.match(/^(.+)#(\d+)$/) ?? [];
  if (!repo) throw new Error(`Bad GitHub target "${ref}", expected owner/repo#123`);
  const gh = (path, opts) => githubApi(token, path, opts);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const files = points.map((p, i) => ({ path: `pr-feedback/${number}/${stamp}-${i + 1}.png`, content: p.image }));
  const sha = await commitFiles(gh, repo, files);
  const body = [
    `### UI feedback (${points.length})`,
    ...points.map((p, i) =>
      [
        `**${i + 1}.** ${p.comment}`,
        `<sub>${p.url}${p.selector ? ` · \`${p.selector}\`` : ""}</sub>`,
        `<img src="https://github.com/${repo}/blob/${sha}/${files[i].path}?raw=true" alt="point ${i + 1}"${p.width ? ` width="${p.width}"` : ""}>`,
      ].join("\n\n"),
    ),
  ].join("\n\n---\n\n");
  return (await gh(`/repos/${repo}/issues/${number}/comments`, { method: "POST", body: { body } })).html_url;
}

// One commit for all images; creates the orphan branch on first use.
async function commitFiles(gh, repo, files) {
  const ref = `heads/${ASSETS_BRANCH}`;
  const head = await gh(`/repos/${repo}/git/ref/${ref}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  const parent = head?.object.sha;
  const baseTree = parent && (await gh(`/repos/${repo}/git/commits/${parent}`)).tree.sha;
  const entries = await Promise.all(
    files.map(async (f) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      sha: (await gh(`/repos/${repo}/git/blobs`, { method: "POST", body: { content: f.content, encoding: "base64" } })).sha,
    })),
  );
  const tree = await gh(`/repos/${repo}/git/trees`, { method: "POST", body: { base_tree: baseTree, tree: entries } });
  const commit = await gh(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: { message: "Add PR feedback screenshots", tree: tree.sha, parents: parent ? [parent] : [] },
  });
  if (parent) await gh(`/repos/${repo}/git/refs/${ref}`, { method: "PATCH", body: { sha: commit.sha } });
  else await gh(`/repos/${repo}/git/refs`, { method: "POST", body: { ref: `refs/${ref}`, sha: commit.sha } });
  return commit.sha;
}

async function githubApi(token, path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) {
    const { message } = await res.json().catch(() => ({}));
    throw Object.assign(new Error(`GitHub ${res.status} on ${path}: ${message ?? res.statusText}`), { status: res.status });
  }
  return res.json();
}
