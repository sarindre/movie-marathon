---
name: planner-logic
description: Change or improve the marathon planning logic in web/ordering.js (strategies, best-fit knapsack, pins, breaks, buffers, budgets, scheduling). Use when adding an ordering strategy, fixing a timing or budget bug, or changing how pins and the time limit interact.
---

# Planner logic (`web/ordering.js`)

`ordering.js` is pure logic, shared by the website, the desktop app and the Android app. It has no DOM access. Keep it that way so it stays unit-testable.

## Structure

- `strategies`: `shortest`, `longest`, `balanced`. Each takes a movie array and returns a new sorted array.
- `suggest(movies, strategy)`: applies a strategy. Unknown names fall back to `shortest`.
- `fit(movies, budget, breakMinutes)`: 0/1 knapsack. Each movie costs `minutes + break`, capacity is `budget + break`. Returns `{ chosen, skipped }`. `chosen` is returned in input order. The caller re-sorts it.
- `takeInOrder(ordered, budget, break)`: walks an order and keeps each movie that still fits.
- `buildPlan({ movies, strategy, breakMin, budgetMin, buffer, order })`: the main entry point. Order of operations:
  1. Add `buffer` to each movie's `minutes` (`runtime` keeps the original).
  2. Pinned movies (integer `pin`) are placed first and their time is subtracted from the budget.
  3. Free movies are ordered by the `order` array if given, otherwise by the strategy. Then `bestfit` uses `fit`, then `shortest`.
  4. Movies that don't fit go into `skipped`.
  5. Pins are spliced back into their slots.
  6. `total` and `overBudget` are returned.
- `schedule(ordered, breakMin)`: gives each item `start`/`end` offsets in minutes.
- `formatDuration`, `formatClock`: display helpers.

## Invariants to preserve

- Without a budget (`budgetMin` 0), nothing is skipped.
- Without pins, a plan's `total` must be `<= budgetMin` whenever a budget is set. `unit.js` has a randomized check for this.
- Pins are always included. If they alone exceed the budget, `overBudget` is `true`. The plan must not silently drop them.
- The break is charged between movies, not before the first one. Note the `i ? breakMin : 0` pattern in `buildPlan` and `takeInOrder`.
- `buildPlan` must not mutate its input. It copies with spread.
- `order` may contain stale or duplicate ids. Ignore them rather than throwing.

## Adding a strategy

1. Add a function to `strategies` in `ordering.js`. Return a new array.
2. Add an `<option value="...">` to the `#strategy` select in `web/index.html`.
3. Add a unit test for the expected order, as in `tests/unit.js`.
4. Add an e2e check if the UI needs to show the new order.

## Performance

`fit` is O(n × budget) in time and memory, with budget in minutes. That's fine for a few dozen movies. Don't change the budget unit to seconds, and don't try to fit very large lists without measuring first. Time a 200-movie run with `node -e` before and after any change.

## Verify

Run `npm run test:unit`. Add a targeted unit test for each behaviour you changed, and check the invariants above by hand for at least one edge case: an empty list, a single movie longer than the budget, or every movie pinned.
