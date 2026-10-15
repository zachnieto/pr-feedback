import { DEFAULT_RULES } from "./rules.js";
import { deviceSignIn } from "./github.js";

const $ = (id) => document.getElementById(id);
const getSettings = async () => (await chrome.storage.local.get("settings")).settings ?? {};
const saveSettings = async (patch) => chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } });

const settings = await getSettings();
$("clientId").value = settings.clientId ?? "";
$("token").value = settings.token ?? "";
$("rules").value = JSON.stringify(settings.rules ?? DEFAULT_RULES, null, 2);

function showAuth(auth) {
  $("signedIn").hidden = !auth;
  $("signedOut").hidden = !!auth;
  $("device").hidden = true;
  $("login").textContent = auth?.login ?? "";
}
showAuth(settings.auth);

$("signIn").onclick = async () => {
  const clientId = $("clientId").value.trim();
  if (!clientId) return ($("authStatus").textContent = "Enter the OAuth App's client ID first");
  $("signIn").disabled = true;
  $("authStatus").textContent = "";
  try {
    await saveSettings({ clientId });
    const auth = await deviceSignIn(clientId, ({ user_code, verification_uri }) => {
      $("userCode").textContent = user_code;
      $("verify").href = $("verify").textContent = verification_uri;
      $("verify").onclick = () => navigator.clipboard.writeText(user_code).catch(() => {});
      $("device").hidden = false;
    });
    await saveSettings({ auth });
    showAuth(auth);
  } catch (e) {
    $("device").hidden = true;
    $("authStatus").textContent = `Sign-in failed: ${e.message}`;
  } finally {
    $("signIn").disabled = false;
  }
};

$("signOut").onclick = async () => {
  await saveSettings({ auth: undefined });
  showAuth(null);
};

$("save").onclick = async () => {
  try {
    const rules = JSON.parse($("rules").value);
    for (const r of rules) new RegExp(r.match);
    await saveSettings({ clientId: $("clientId").value.trim(), token: $("token").value.trim(), rules });
    $("status").textContent = "Saved";
  } catch (e) {
    $("status").textContent = e.message;
  }
};
