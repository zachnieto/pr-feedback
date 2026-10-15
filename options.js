import { DEFAULT_RULES } from "./rules.js";

const $ = (id) => document.getElementById(id);
const { settings = {} } = await chrome.storage.local.get("settings");
$("token").value = settings.token ?? "";
$("rules").value = JSON.stringify(settings.rules ?? DEFAULT_RULES, null, 2);

$("save").onclick = async () => {
  try {
    const rules = JSON.parse($("rules").value);
    for (const r of rules) new RegExp(r.match);
    await chrome.storage.local.set({ settings: { token: $("token").value.trim(), rules } });
    $("status").textContent = "Saved";
  } catch (e) {
    $("status").textContent = e.message;
  }
};
