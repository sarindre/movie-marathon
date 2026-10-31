// Pure ordering logic, shared by the web page and the desktop app.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Ordering = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const strategies = {
    // Ease in with short movies, finish on the longest.
    shortest: (m) => [...m].sort((a, b) => a.minutes - b.minutes),
    // Tackle the longest while you're fresh.
    longest: (m) => [...m].sort((a, b) => b.minutes - a.minutes),
    // Longest first, shortest last, mid-length in the middle.
    balanced: (m) => {
      const s = [...m].sort((a, b) => b.minutes - a.minutes);
      const out = [];
      let lo = 0, hi = s.length - 1, front = true;
      while (lo <= hi) out.push(front ? s[lo++] : s[hi--]), (front = !front);
      return out;
    },
  };

  function suggest(movies, strategy) {
    const fn = strategies[strategy] || strategies.shortest;
    return fn(movies);
  }

  // Fisher-Yates shuffle; returns a new array. rng is injectable for tests.
  function shuffle(list, rng = Math.random) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Picks the subset of movies that uses the most of the time budget
  // (0/1 knapsack). Each movie after the first also costs one break, so
  // weight = minutes + break and capacity = budget + break.
  function fit(movies, budget, breakMinutes) {
    const cap = Math.floor(budget + breakMinutes);
    if (cap < 0) return { chosen: [], skipped: [...movies] };
    const w = movies.map((m) => m.minutes + breakMinutes);
    const best = Array.from({ length: movies.length + 1 }, () => new Int32Array(cap + 1));
    for (let i = 1; i <= movies.length; i++)
      for (let c = 0; c <= cap; c++) {
        best[i][c] = best[i - 1][c];
        if (w[i - 1] <= c) best[i][c] = Math.max(best[i][c], best[i - 1][c - w[i - 1]] + w[i - 1]);
      }
    const chosen = [], skipped = [];
    for (let i = movies.length, c = cap; i >= 1; i--) {
      if (best[i][c] !== best[i - 1][c]) { chosen.unshift(movies[i - 1]); c -= w[i - 1]; }
      else skipped.unshift(movies[i - 1]);
    }
    return { chosen, skipped };
  }

  // Walks the movies in the given order, keeping each one that still fits.
  function takeInOrder(ordered, budget, breakMinutes) {
    const chosen = [], skipped = [];
    let used = 0;
    for (const m of ordered) {
      const cost = m.minutes + (chosen.length ? breakMinutes : 0);
      if (used + cost <= budget) { chosen.push(m); used += cost; }
      else skipped.push(m);
    }
    return { chosen, skipped };
  }

  // One call that turns the user's inputs into a plan.
  //  movies: unwatched movies { id, minutes, pin? }; pin = the slot a movie keeps when reshuffled
  //  order:  optional list of ids (a manual or shuffled arrangement) that overrides the strategy
  //  buffer: extra minutes per movie (trailers, credits)
  function buildPlan({ movies, strategy = "shortest", breakMin = 0, budgetMin = 0, buffer = 0, order = null }) {
    const eff = movies.map((m) => ({ ...m, runtime: m.minutes, minutes: m.minutes + buffer }));
    const isPinned = (m) => Number.isInteger(m.pin);
    const pinned = eff.filter(isPinned).sort((a, b) => a.pin - b.pin);
    const free = eff.filter((m) => !isPinned(m));
    // Pinned movies are always in the plan, so they use up the time budget first.
    const avail = budgetMin > 0 ? budgetMin - pinned.reduce((t, m) => t + m.minutes + breakMin, 0) : Infinity;
    const limit = (list) => (budgetMin > 0 ? takeInOrder(list, avail, breakMin) : { chosen: list, skipped: [] });

    let chosen, skipped;
    if (order) {
      const byId = new Map(free.map((m) => [m.id, m]));
      const seen = new Set();
      const base = [];
      for (const id of order) if (byId.has(id) && !seen.has(id)) { base.push(byId.get(id)); seen.add(id); }
      base.push(...suggest(free.filter((m) => !seen.has(m.id)), strategy === "bestfit" ? "shortest" : strategy));
      ({ chosen, skipped } = limit(base));
    } else if (strategy === "bestfit") {
      const r = budgetMin > 0 ? fit(free, avail, breakMin) : { chosen: free, skipped: [] };
      chosen = suggest(r.chosen, "shortest");
      skipped = r.skipped;
    } else {
      ({ chosen, skipped } = limit(suggest(free, strategy)));
    }

    const ordered = [...chosen];
    for (const p of pinned) ordered.splice(Math.min(p.pin, ordered.length), 0, p);
    const total = ordered.reduce((t, m, i) => t + m.minutes + (i ? breakMin : 0), 0);
    return { ordered, skipped, total, overBudget: budgetMin > 0 && total > budgetMin };
  }

  // Adds start/end offsets (minutes from marathon start) and the total.
  function schedule(ordered, breakMinutes) {
    let t = 0;
    const items = ordered.map((m, i) => {
      if (i > 0) t += breakMinutes;
      const item = { ...m, start: t, end: t + m.minutes };
      t = item.end;
      return item;
    });
    return { items, total: t };
  }

  function formatDuration(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  }

  function formatClock(startHHMM, offset) {
    const [h, m] = startHHMM.split(":").map(Number);
    const total = (h * 60 + m + offset) % 1440;
    const hh = Math.floor(total / 60), mm = total % 60;
    const ampm = hh >= 12 ? "PM" : "AM";
    return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${ampm}`;
  }

  return { suggest, shuffle, fit, takeInOrder, buildPlan, schedule, formatDuration, formatClock, strategies };
});
