// A rule maps a page URL (or a typed reference) to a target. `$1`… insert the
// regex capture groups. The part before the first ":" picks the poster.
export const DEFAULT_RULES = [
  { match: "^https://pr-(\\d+)\\.preview\\.newtonresearch\\.ai(/|$)", target: "github:Newton-Research-Inc/newton#$1" },
  { match: "^https://github\\.com/([^/]+/[^/]+)/(?:pull|issues)/(\\d+)", target: "github:$1#$2" },
  { match: "^([\\w.-]+/[\\w.-]+)#(\\d+)$", target: "github:$1#$2" },
];

const GITHUB_TARGET = /^github:([\w.-]+\/[\w.-]+)#(\d+)$/;
export const MAX_RECENT = 5;

// Order: rules, then an already-canonical target (a picked search result), then the target remembered for the input's origin.
export function resolveTarget(input, rules, remembered = {}) {
  input = input.trim();
  for (const { match, target } of rules) {
    const m = input.match(new RegExp(match));
    if (m) return target.replace(/\$(\d)/g, (_, i) => m[i] ?? "");
  }
  if (GITHUB_TARGET.test(input)) return input;
  return remembered[originOf(input)] ?? null;
}

export function originOf(url) {
  try {
    const { protocol, origin } = new URL(url);
    return /^https?:$/.test(protocol) ? origin : null;
  } catch {
    return null;
  }
}

// "github:owner/repo#123" -> { repo, number }, or null for anything else.
export function parseGithubTarget(target) {
  const m = target?.match(GITHUB_TARGET);
  return m && { repo: m[1], number: Number(m[2]) };
}

// Newest first, one entry per target, at most MAX_RECENT.
export const pushRecent = (recent, item) =>
  [item, ...(recent ?? []).filter((r) => r.target !== item.target)].slice(0, MAX_RECENT);
