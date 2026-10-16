# PR Feedback

Chrome extension (MV3) for pinning feedback on any page and posting it to a GitHub PR as one comment.

## Setup

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. Open the extension's options and sign in to GitHub:
   - Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps; any homepage and callback URL) and check **Enable Device Flow**. Paste its **Client ID** in the options.
   - Click **Sign in with GitHub**, enter the code shown at the linked GitHub page (clicking the link copies the code), and keep the options page open until it says **Signed in as …**. The token has the `repo` scope. An org that restricts OAuth Apps has to approve the app first.
   - Or paste a fine-grained token with **Contents: write** and **Pull requests: write** in the fallback field. It's only used while signed out.

Tabs opened before installing work too: clicking the icon injects the overlay into them.

## Use

- Start a session with the toolbar icon or **⌥⇧F** (Alt+Shift+F; change it at `chrome://extensions/shortcuts`). On a page that matches a rule, a small **Feedback** pill in the bottom-right corner does the same.
- The target is picked from the page URL by the rules, then by a target you told it to remember for that origin. If nothing matches, the toolbar shows **Choose target**: click it to search open PRs (yours, or the current repo's), or paste a PR URL or `owner/repo#123`. **Remember for** (the page origin) reuses the choice on every page of that origin (handy for `localhost`). The last 5 targets show up as **Recent**.
- **Element** (cursor icon): hover and click an element. **Region** (corners icon): drag a rectangle. The comment box opens on the first selection (⌘↵ to add). Press Esc to back out.
- **Group** (overlapping squares, or G) keeps each selection instead. Add more elements or regions, then **Comment** (C) writes one note for all of them. Esc leaves select mode without dropping the group, so you can open another page and press E again. From the comment box, **Add another to this point** does the same thing if Group was off. They post as one checklist item, with a shot per region. The numbered outlines are the current group; click a number to drop that region.
- The list icon opens the points: edit a comment inline, remove one, or clear them all.
- One session spans every tab and page, so you can mix preview pages and the PR's own images.
- **Send** commits the screenshots to the `assets/pr-feedback` branch of the target repo and posts a comment linking them (`?raw=true` URLs pinned to the commit, so they render in private repos). A toast links to the posted comment.
- Screenshots are stored at device resolution up to 1600 px wide (wider crops are scaled down) and display at their on-screen size in the comment.

## Comment format

One task-list item per point, so the PR author can tick them off. A point with several regions is still one item: each region gets its own link line and image, in the order selected. The hidden JSON keeps the first region in the flat fields and, when there are more, lists them all as `captures`.

```markdown
### UI feedback (2)

- [ ] **1.** The save button is misaligned.

  <sub>[https://pr-1.preview.example.com/settings](https://pr-1.preview.example.com/settings) · `main > button.save`</sub>

  <sub>Viewport 1440 × 900 (2x) · Chrome 130 · Component `SaveButton`</sub>

  <details><summary>Console errors (1)</summary> … </details>

  <img src="https://github.com/owner/repo/blob/<sha>/pr-feedback/12/….png?raw=true" alt="point 1" width="412">

<!-- pr-feedback:v1 {"target":"github:owner/repo#12","points":[{"n":1,"comment":"…","url":"…","selector":"…","rect":{…},"image":"…","context":{…}}]} -->
```

Region points show `Region W × H` instead of a selector. Everything under a point is indented so it renders inside its list item, and page text (URLs, selectors, browser, component) is escaped. The last line is a hidden, machine-readable copy for tools: every `--` in the JSON is written as `-\u002d` so it can't close the HTML comment, and `JSON.parse` reads it as is.

## Rules

Edit them in options. They're tried in order, `$1`… insert capture groups:

```json
{ "match": "^https://pr-(\\d+)\\.preview\\.newtonresearch\\.ai(/|$)", "target": "github:Newton-Research-Inc/newton#$1" }
```

The part of `target` before the first `:` picks the poster in `background.js`. Only `github` exists today.

## Layout

- `background.js`: session storage, targets, screenshots, posting. Also injects the content scripts on icon click (the `main-world.js` entry into the page's MAIN world).
- `rules.js`: target resolution (rules, canonical targets, remembered origins) and the recent list. `format.js`: the comment markdown. `github.js`: GitHub API, PR search and the device-flow sign-in, shared with `options.js`.
- `content/`: classic scripts loaded in manifest order, sharing one `window.PRF` namespace. `core.js` owns the shadow-root overlay, session state and the render fan-out (`PRF.onRender`); `toolbar.js`, `pick.js`, `composer.js`, `points.js` and `target.js` each own one piece of UI. `pins.js` and `context.js` are hooks, and `main-world.js` runs in the page's own JS world.
- The overlay uses `createElement` and `adoptedStyleSheets` only, so it renders on pages with strict CSP or Trusted Types.

## Limits

- Chrome blocks extensions on `chrome://` pages, the Web Store and the PDF viewer.
- Only the top frame gets the overlay. Closed shadow DOM can't be element-picked (use Region).
- Screenshots cover the visible viewport only.

`npm test` runs every `*.test.js`: rule and remembered-target resolution, the recent list, comment formatting, and the search and sign-in calls against a stubbed `fetch`.
