---
name: ui-review
description: Review and improve the Movie Marathon web UI by running the site, taking screenshots at desktop and phone widths, and checking accessibility, keyboard use, themes and the now-playing view. Use when asked to review, polish or make the app more usable, accessible or responsive.
---

# UI review

The UI is plain HTML, CSS and JS in `web/` (`index.html`, `style.css`, `app.js`, `live.js`, `theme.js`). There is no framework and no build step.

## 1. Run the site

- `npm start` serves `web/` at `http://localhost:8080`. Start it in the background and check that it returns 200.
- Once the server is up, call `report_preview_port` with the port it actually listens on, so the user can open the preview.

## 2. Screenshot it

Use Playwright with the pre-installed Chromium. Don't run `playwright install`.

```js
const { chromium } = require('playwright');
const browser = await chromium.launch();
```

Write the script in the scratchpad, not in the repo. Capture these states, at 1280px wide and 390px wide:

- Empty state (clear `localStorage` first)
- A seeded list of 4+ movies with a plan showing
- Dark theme, light theme, and the "Extra large" text size (set in the display menu)
- The now-playing view (`live.js`)
- A Christmas or other seasonal theme, if the date triggers one (`theme.js`)

Read each screenshot and look for real problems: clipped text, overlapping buttons, low contrast, unreadable empty states.

## 3. Check accessibility and keyboard use

- **Keyboard**: tab through the whole page. Every control must be reachable and have a visible focus style. The plan list supports Alt+Up/Down reordering. Confirm it works and is announced.
- **Labels**: every `<input>` and `<select>` needs a `<label>` or `aria-label`. The strategy and time-available controls are good examples.
- **Dynamic content**: toasts and the result heading should be announced. Check for an `aria-live` region. `toast()` in `app.js` is the place to look.
- **Colour**: check text contrast against both themes. Don't rely on colour alone for pinned or watched states.
- **Targets**: buttons on mobile should be at least about 44px.
- **Drag and drop**: it must have a keyboard alternative. It does (Alt+Up/Down). Keep it that way.

## 4. Fix

- Make the smallest change that fixes the problem. Edit `style.css` for layout and `index.html`/`app.js` for semantics.
- Keep `web/` free of build tooling, frameworks and external CDN dependencies. The app works offline and in the Electron/Capacitor wrappers.
- Don't break the `id`s that `tests/e2e.js` uses (`#strategy`, `#budget`, `#add`, `#list`, `#result`, `#marathon`, `#import-file`, and others). Grep the tests before renaming anything.
- If you add a new file under `web/` that the page loads, add it to the `SHELL` list in `web/sw.js` so it works offline.

## 5. Verify

- `npm test` (the e2e tests catch id and behaviour regressions).
- Re-take the screenshots for the states you changed, and compare them to the before shots.
- Report what you changed and show the before/after for each visible change.
