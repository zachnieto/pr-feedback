# PR Feedback

Chrome extension (MV3) for pinning feedback on any page and posting it to a GitHub PR as one comment.

## Setup

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. Open the extension's options. Paste a fine-grained GitHub token with **Contents: write** and **Pull requests: write** on the target repos.
3. Reload any tabs that were open before installing, so the overlay can load in them.

## Use

- Click the toolbar icon to start a session. The target is picked from the page URL by the rules. If nothing matches, the overlay asks for a PR URL or `owner/repo#123`.
- **Element**: hover and click an element. **Region**: drag a rectangle. Each one is cropped from a screenshot and gets a comment. Press Esc to back out.
- One session spans every tab and page, so you can mix preview pages and the PR's own images.
- **Send** commits the screenshots to the `assets/pr-feedback` branch of the target repo and posts a comment linking them (`?raw=true` URLs pinned to the commit, so they render in private repos).

## Rules

Edit them in options. They're tried in order, `$1`… insert capture groups:

```json
{ "match": "^https://pr-(\\d+)\\.preview\\.newtonresearch\\.ai(/|$)", "target": "github:Newton-Research-Inc/newton#$1" }
```

The part of `target` before the first `:` picks the poster in `background.js`. Only `github` exists today.

## Limits

- Chrome blocks extensions on `chrome://` pages, the Web Store and the PDF viewer.
- Only the top frame gets the overlay. Closed shadow DOM can't be element-picked (use Region).
- Screenshots cover the visible viewport only.

`npm test` checks the rule matching.
