import { DEFAULT_RULES, originOf, parseGithubTarget, pushRecent, resolveTarget } from "./rules.js";
import { formatClipboard, formatComment, shotsOf } from "./format.js";
import { githubApi, issueTitle, searchPulls, targetItem } from "./github.js";

// Screenshots are committed here so they render in private repos (GitHub has no
// attachment upload API). Never delete the branch: every comment linking it goes blank.
const ASSETS_BRANCH = "assets/pr-feedback";
// Device px; a full-width retina crop would otherwise be several MB per point.
const MAX_IMAGE_WIDTH = 1600;

const posters = { github: postToGithub };

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { token: "", rules: DEFAULT_RULES, ...settings };
}
const tokenOf = (settings) => settings.auth?.token || settings.token;
const local = async (key) => (await chrome.storage.local.get(key))[key];
const getSession = () => local("session");
const setSession = (session) => chrome.storage.local.set({ session });

// ponytail: read-modify-write, so two tabs editing the same instant can clobber each other
async function editSession(change) {
  const session = await getSession();
  if (!session) throw new Error("The feedback session has ended");
  const result = change(session);
  await setSession(session);
  return result;
}
const editPoints = (change) => editSession((session) => change(session.points));

const resolveInput = async (input) =>
  resolveTarget(input ?? "", (await getSettings()).rules, (await local("rememberedTargets")) ?? {});

async function startSession(url) {
  if (await getSession()) return;
  const target = await resolveInput(url);
  await setSession({ target, points: [], draft: [] });
  if (target) noteRecent(target).catch(() => {});
}

// Best effort and not awaited by callers: the title fetch must not delay setting the target.
async function noteRecent(target) {
  const gh = parseGithubTarget(target);
  if (!gh) return;
  let title = ((await local("recentTargets")) ?? []).find((r) => r.target === target)?.title;
  const token = tokenOf(await getSettings());
  if (!title && token) title = await issueTitle(token, gh.repo, gh.number).catch(() => null);
  const recent = pushRecent(await local("recentTargets"), targetItem(gh.repo, gh.number, title ?? null));
  await chrome.storage.local.set({ recentTargets: recent });
}

async function searchTargets({ query = "", repo }) {
  const token = tokenOf(await getSettings());
  const recent = (await local("recentTargets")) ?? [];
  const gh = parseGithubTarget(await resolveInput(query));
  if (gh) {
    const title = token ? await issueTitle(token, gh.repo, gh.number).catch(() => null) : null;
    return { recent, results: [targetItem(gh.repo, gh.number, title)] };
  }
  if (!token) {
    // Opening the picker signed out still shows the recent targets.
    if (!query.trim()) return { recent, results: [] };
    throw new Error("Sign in to GitHub in the extension options to search pull requests");
  }
  return { recent, results: await searchPulls(token, query.trim(), repo) };
}

// Also fires for the _execute_action keyboard command.
chrome.action.onClicked.addListener(async (tab) => {
  await startSession(tab.url);
  // Tabs opened before install have no content scripts yet; the guards in each file make a re-inject a no-op.
  try {
    for (const { js, world = "ISOLATED" } of chrome.runtime.getManifest().content_scripts)
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: js, world });
  } catch (e) {
    console.warn(`PR Feedback can't run on ${tab.url ?? "this page"}: ${e.message}`);
  }
});

const handlers = {
  capture: ({ rect, dpr }, sender) => capture(sender.tab.windowId, rect, dpr),
  addCapture: ({ capture }) =>
    editSession((s) => {
      (s.draft ??= []).push(capture);
      return s.draft.length;
    }),
  removeCapture: ({ index }) => editSession((s) => s.draft?.splice(index, 1)),
  clearDraft: () =>
    editSession((s) => {
      s.draft = [];
      delete s.draftComment;
    }),
  setDraftComment: ({ comment }) => editSession((s) => (s.draftComment = comment)),
  setGrouping: ({ on }) => editSession((s) => (s.grouping = !!on)),
  commitDraft: ({ comment, context }) =>
    editSession((s) => {
      if (!s.draft?.length) throw new Error("Nothing selected");
      const point = { id: crypto.randomUUID(), comment, captures: s.draft };
      if (context !== undefined) point.context = context;
      s.points.push(point);
      s.draft = [];
      delete s.draftComment;
    }),
  updatePoint: ({ id, comment }) =>
    editPoints((points) => {
      const point = points.find((p) => p.id === id);
      if (point) point.comment = comment;
    }),
  removePoint: ({ id }) =>
    editPoints((points) => {
      const i = points.findIndex((p) => p.id === id);
      if (i >= 0) points.splice(i, 1);
    }),
  setTarget: async ({ input, remember, origin }) => {
    const target = await resolveInput(input);
    if (!target) return null;
    const session = await getSession();
    if (session) await setSession({ ...session, target });
    const key = origin ?? originOf(input);
    if (remember && key) await chrome.storage.local.set({ rememberedTargets: { ...(await local("rememberedTargets")), [key]: target } });
    noteRecent(target).catch(() => {});
    return target;
  },
  resolve: ({ url }) => resolveInput(url),
  searchTargets,
  start: ({ url }) => startSession(url),
  openOptions: () => chrome.runtime.openOptionsPage(),
  cancel: () => chrome.storage.local.remove("session"),
  submit,
  clipboard: async () => {
    const session = await getSession();
    if (!session?.points.length) throw new Error("Nothing to copy yet");
    return formatClipboard(session.points);
  },
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
  const scale = Math.min(1, MAX_IMAGE_WIDTH / w);
  const canvas = new OffscreenCanvas(Math.round(w * scale), Math.max(1, Math.round(h * scale)));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, x, y, w, h, 0, 0, canvas.width, canvas.height);
  // Up to device resolution for sharpness; `width` is the on-screen CSS size it displays at.
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
  const token = tokenOf(await getSettings());
  if (session?.draft?.length) throw new Error("Comment on the current selection first, or discard it");
  if (!session?.points.length) throw new Error("Nothing to send yet");
  if (!session.target) throw new Error("Choose where to send this feedback first");
  const kind = session.target.slice(0, session.target.indexOf(":"));
  if (!posters[kind]) throw new Error(`No poster for "${kind}" targets`);
  const url = await posters[kind](session.target, session.points, token);
  await chrome.storage.local.remove("session");
  return { url };
}

async function postToGithub(target, points, token) {
  if (!token) throw new Error("Sign in to GitHub in the extension options");
  const { repo, number } = parseGithubTarget(target) ?? {};
  if (!repo) throw new Error(`Bad GitHub target "${target}", expected github:owner/repo#123`);
  const gh = (path, opts) => githubApi(token, path, opts);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const files = [];
  const groups = points.map((p) => {
    const start = files.length;
    for (const shot of shotsOf(p)) files.push({ path: `pr-feedback/${number}/${stamp}-${files.length + 1}.png`, content: shot.image });
    return files.slice(start);
  });
  const sha = await commitFiles(gh, repo, files);
  const images = groups.map((group) => group.map((f) => `https://github.com/${repo}/blob/${sha}/${f.path}?raw=true`));
  const body = formatComment(target, points, images);
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
