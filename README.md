# Movie Marathon Planner

Enter the movies you want to watch and get a suggested order, with start and end times for each one.
It runs as a website, a Windows desktop app and an Android app, all from the same code in `web/`.

## What it does

- **Plans an order**: shortest first, longest first, balanced, or **best fit**, which picks the combination of movies that fills your available time.
- **Time limit, breaks and extra time** per movie for trailers and credits.
- **Shuffle**, drag-and-drop (or Alt+Up/Down) reordering, and **pins** that hold a movie in its slot.
- **Look up runtimes** by title (Wikidata, no API key).
- **Share** a marathon as a link or as text, add it to a **calendar** (.ics), or **print** it.
- **Now playing** mode with a countdown, a break timer and a finish estimate.
- **Saved marathons**, a watched checklist, and **backup export/import**.
- **Seasonal themes** chosen by date, light/dark mode and a text size setting.

Everything is stored in the browser or app on the device. There is no server and no account.

## Run it

```bash
npm start            # serves the site at http://localhost:8080  (no install needed)
```

Open <http://localhost:8080>. In Chrome or Edge you can install it as an app from the page.

## Develop

```bash
npm run setup        # installs the desktop + mobile dependencies (one time)
npm test             # unit tests + browser tests (the browser tests need internet for the title lookup)
npm run test:unit    # just the fast unit tests
```

| Folder     | What it is |
|------------|------------|
| `web/`     | The site. Plain HTML, CSS and JavaScript, no build step. |
| `desktop/` | Electron wrapper. `npm run desktop` runs it, `npm run desktop:build` makes the Windows installer in `desktop/dist/`. |
| `mobile/`  | Capacitor project for Android. `npm run mobile:sync` copies `web/` into it, then open `mobile/android` in Android Studio. |
| `tests/`   | Unit tests and browser tests (Electron drives the real page). |

Code map inside `web/`: `ordering.js` (planning logic), `share.js` (links, text, calendar, backups),
`store.js` (saved marathons), `app.js` (the page), `live.js` (now-playing), `theme.js` (themes and display settings),
`lookup.js` (Wikidata), `sw.js` + `install.js` (offline and install support).

## Publishing

- **The site**: the `web/` folder is the whole site. `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main`.
- **The Windows installer** is about 80 MB, so it is not kept in git. Build it with `npm run desktop:build` and attach
  `desktop/dist/Movie-Marathon-Setup.exe` to a GitHub Release.
- The installer is **not code-signed**, so Windows SmartScreen shows an "unknown publisher" warning until it is.
- The **Android app** has not been built or tested on a device yet.

## Known limits

- Marathons live only on the device that created them. Use Export/Import to move them.
- Title lookup needs internet. Wikidata has no runtime for some films, so you may need to type it.
- "Copy link" is hidden in the desktop and Android apps, because links from them wouldn't open anywhere.
