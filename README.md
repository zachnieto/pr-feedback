# PR Feedback

Chrome extension (MV3) for pinning feedback on any page and posting it to a GitHub PR as one comment.

## Setup

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. Open the extension's options. Paste a fine-grained GitHub token with **Contents: write** and **Pull requests: write** on the target repos.

Tabs opened before installing work too: clicking the icon injects the overlay into them.

## Use

- Start a session with the toolbar icon or **⌥⇧F** (Alt+Shift+F; change it at `chrome://extensions/shortcuts`). On a page that matches a rule, a small **Feedback** pill in the bottom-right corner does the same.
- The target is picked from the page URL by the rules. If nothing matches, the toolbar shows **Choose target**: click it and paste a PR URL or `owner/repo#123`.
- **Element** (cursor icon): hover and click an element. **Region** (corners icon): drag a rectangle. Each one is cropped from a screenshot and gets a comment (⌘↵ to add). Press Esc to back out.
- The list icon opens the points: edit a comment inline, remove one, or clear them all.
- One session spans every tab and page, so you can mix preview pages and the PR's own images.
- **Send** commits the screenshots to the `assets/pr-feedback` branch of the target repo and posts a comment linking them (`?raw=true` URLs pinned to the commit, so they render in private repos). A toast links to the posted comment.

## Rules

Edit them in options. They're tried in order, `$1`… insert capture groups:

```json
{ "match": "^https://pr-(\\d+)\\.preview\\.newtonresearch\\.ai(/|$)", "target": "github:Newton-Research-Inc/newton#$1" }
```

The part of `target` before the first `:` picks the poster in `background.js`. Only `github` exists today.

## Layout

- `background.js`: session storage, screenshots, posting. Also injects the content scripts on icon click.
- `content/`: classic scripts loaded in manifest order, sharing one `window.PRF` namespace. `core.js` owns the shadow-root overlay, session state and the render fan-out (`PRF.onRender`); `toolbar.js`, `pick.js`, `composer.js`, `points.js` and `target.js` each own one piece of UI. `pins.js` and `context.js` are hooks, and `main-world.js` runs in the page's own JS world.
- The overlay uses `createElement` and `adoptedStyleSheets` only, so it renders on pages with strict CSP or Trusted Types.

## Limits

- Chrome blocks extensions on `chrome://` pages, the Web Store and the PDF viewer.
- Only the top frame gets the overlay. Closed shadow DOM can't be element-picked (use Region).
- Screenshots cover the visible viewport only.

`npm test` checks the rule matching.
