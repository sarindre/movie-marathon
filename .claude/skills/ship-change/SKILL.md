---
name: ship-change
description: Finish a Movie Marathon change properly - run the right checks, sync the mobile and desktop copies, keep the offline cache list correct, review the diff, then commit and push to the designated branch. Use when a change is ready to commit, push or hand off.
---

# Shipping a change

## 1. Know what you touched

`git status` and `git diff --stat`. Then map the changes to what they affect:

| If you changed | Also do |
|---|---|
| `web/*.js` or `web/*.css` | `npm run test:unit`. Then `npm test` if UI or behaviour changed |
| A new file in `web/` that the page loads | Add it to `SHELL` in `web/sw.js`. Bump `CACHE` (for example `marathon-v5` to `marathon-v6`) so installed copies refresh |
| `web/index.html` ids or options | `npm test`. The e2e tests depend on the ids |
| `web/` anything | `npm run mobile:sync` so the Android copy matches. This writes to `mobile/www/`, which is git-ignored. Don't commit it |
| `desktop/main.js` | `npm run desktop` and check the window opens. `npm run desktop:build` is only needed for a release |
| `serve.js` or `tests/` | `npm run test:unit` and `npm test` |
| `tools/itch.js` or `itch/PAGE.md` | `npm run itch`. The zip in `itch/*.zip` is git-ignored, so don't commit it |
| `README.md` | Check the commands in it still work |

Never commit `web/downloads/*.exe`, `desktop/dist/`, `desktop/web/`, `mobile/www/` or `itch/*.zip`. They are build outputs.

## 2. Run checks

1. `npm run test:unit`. Required.
2. `npm test`. Required when `web/` or `tests/` changed. Report any network-only failure as such.

If a check fails, fix the cause. Don't skip the check or weaken the assertion.

## 3. Review the diff

Read the full `git diff`, not just the file names. Look for:

- Leftover `console.log`, debug code or commented-out blocks
- Changes outside the scope of the request
- Anything in `ordering.js` that touches the DOM
- Hard-coded dates or times that will break later
- Secrets or personal data in the diff

## 4. Commit

- Use the branch the session names. Don't push to any other branch without permission.
- Write a message that says what changed and why. Use a short subject line and a body if needed.
- End the message with the attribution lines from the system instructions, unless the repo or user says otherwise.

## 5. Push

```bash
git push -u origin <branch-name>
```

If the push fails with a network error, retry up to four times with exponential backoff (2s, 4s, 8s, 16s). Don't retry other errors.

Don't open a pull request unless the user asks for one.

## 6. Report

Tell the user:

- What changed, in one or two sentences
- Which checks ran and their results, including anything skipped and why
- The branch pushed to and the commit hash
