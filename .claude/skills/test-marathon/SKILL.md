---
name: test-marathon
description: Run, read and extend the Movie Marathon test suites (unit, browser/e2e, desktop-mode). Use when asked to run tests, check a change didn't break anything, debug a failing test, or add test coverage for web/ behaviour.
---

# Testing Movie Marathon

## Suites

| Command | What it runs | Needs |
|---|---|---|
| `npm run test:unit` | `tests/unit.js`: pure logic in `web/ordering.js`, `share.js`, `store.js` | Node only. Fast. Also runs in CI (`.github/workflows/test.yml`) |
| `npm test` | unit, then `tests/e2e.js` and `tests/file-mode.js` in headless Electron | `npm run setup` once (installs `desktop/` deps). Internet for the Wikidata title-lookup checks |

`tests/run.js` runs everything. Pass `unit` as an argument to skip the browser tests.

Always run `npm run test:unit` first. It is quick and catches most logic regressions.

## Running the browser tests here

1. Check Electron exists: `ls desktop/node_modules/electron/dist`. If it's missing, run `npm run setup`.
2. Run `npm test`. On a headless Linux box running as root (like the cloud sessions), Electron needs a display and `--no-sandbox`, so `npm test` fails at launch. Start `node serve.js` in the background, then run each suite by hand:
   `BASE_URL=http://localhost:8080/ xvfb-run -a desktop/node_modules/electron/dist/electron --no-sandbox tests/e2e.js`
   `xvfb-run -a desktop/node_modules/electron/dist/electron --no-sandbox tests/file-mode.js`
   Two traps in `tests/e2e.js`: `js(...)` can't return a function or DOM object (end the expression with `; 0`), and content inside a closed `<details>` has empty `innerText` (open it first).
3. The Wikidata checks fail without internet. Say so explicitly. Don't hide the failure, and don't remove the check.
4. To save screenshots from the e2e run, set `OUT=<dir>`. Use a scratchpad folder, not the repo.

## Reading failures

- Unit output is `PASS name` / `FAIL name <detail>`. The `<detail>` is the actual value. Compare it to the expected value in the test.
- The e2e file uses `check(name, ok, actual)`. Console errors at level 3+ are collected and reported. A page error often explains a failing UI check.
- A `Wikidata`/`lookup` failure with no network is expected. Any other e2e failure is a real regression until shown otherwise.

## Adding tests

- **Logic change** (planning, sharing, storage): add a `t(name, condition, detail)` line to `tests/unit.js`. Use the existing helpers `mv(id, minutes, pin)` and `ids(plan)`. Give each test a single clear expectation.
- **UI behaviour**: add a `check(...)` in `tests/e2e.js`. Use the helpers there: `add`, `set`, `click`, `order`, `q`, `count`, `fresh`. Call `fresh()` to start from clean localStorage.
- Keep tests deterministic. For randomness, inject `rng` (see `shuffle(list, rng)` in `ordering.js`). The existing property-style loop in `unit.js` is the one place that uses `Math.random`. Keep it bounded and don't make it flaky.
- Don't weaken or delete an existing assertion to make a change pass. If an expected value truly changed, update it and explain why in the commit message.

## Done when

- `npm run test:unit` passes.
- `npm test` passes, or the only failures are network-dependent lookup checks that you have reported.
