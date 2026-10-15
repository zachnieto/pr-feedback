// A rule maps a page URL (or a typed reference) to a target. `$1`… insert the
// regex capture groups. The part before the first ":" picks the poster.
export const DEFAULT_RULES = [
  { match: "^https://pr-(\\d+)\\.preview\\.newtonresearch\\.ai(/|$)", target: "github:Newton-Research-Inc/newton#$1" },
  { match: "^https://github\\.com/([^/]+/[^/]+)/(?:pull|issues)/(\\d+)", target: "github:$1#$2" },
  { match: "^([\\w.-]+/[\\w.-]+)#(\\d+)$", target: "github:$1#$2" },
];

export function resolveTarget(input, rules) {
  for (const { match, target } of rules) {
    const m = input.trim().match(new RegExp(match));
    if (m) return target.replace(/\$(\d)/g, (_, i) => m[i] ?? "");
  }
  return null;
}
