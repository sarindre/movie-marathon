// "Now playing" mode: a countdown for the current movie or break, with Done / Start-next buttons.
// Times are measured from when you actually press the buttons, so a late start shifts everything.
const Live = (() => {
  const { formatDuration, formatClock } = Ordering;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  let timer = null;

  const cur = () => App.cur();
  const st = () => cur().live;
  const movie = (id) => cur().movies.find((m) => m.id === id);
  const brkMs = () => cur().settings.brk * 60000;
  const movieMs = (m) => (m.minutes + cur().settings.buffer) * 60000;
  const phaseMs = (l) => (l.phase === "movie" ? movieMs(movie(l.order[l.i])) : l.phase === "break" ? brkMs() : 0);

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
  }
  const clock = (ms) => { const d = new Date(ms); return formatClock(`${pad(d.getHours())}:${pad(d.getMinutes())}`, 0); };

  // Milliseconds from now until the whole marathon is over.
  function remaining(l, now) {
    if (l.phase === "finished") return 0;
    let rest = Math.max(0, phaseMs(l) - (now - l.t0));
    const first = l.phase === "movie" ? l.i + 1 : l.i;
    for (let k = first; k < l.order.length; k++) rest += movieMs(movie(l.order[k])) + (l.phase === "movie" || k > first ? brkMs() : 0);
    return rest;
  }

  function start(ids) {
    if (!ids.length) return;
    cur().live = { order: ids, i: 0, phase: "movie", t0: Date.now() };
    App.persist();
    App.render();
  }

  function advance() {
    const l = st();
    if (l.phase === "movie") {
      const m = movie(l.order[l.i]);
      if (m) m.watched = true;
      if (l.i + 1 >= l.order.length) l.phase = "finished";
      else { l.i++; l.phase = brkMs() > 0 ? "break" : "movie"; l.t0 = Date.now(); }
    } else if (l.phase === "break") {
      l.phase = "movie";
      l.t0 = Date.now();
    }
    App.persist();
    App.render();
  }

  function stop() {
    cur().live = null;
    App.persist();
    App.render();
  }

  function render() {
    const root = $("live"), l = st();
    if (!l) { root.hidden = true; clearInterval(timer); timer = null; return false; }
    l.order = l.order.filter(movie);                       // a movie may have been deleted meanwhile
    l.i = Math.min(l.i, Math.max(l.order.length - 1, 0));
    if (!l.order.length) { cur().live = null; root.hidden = true; return false; }
    root.hidden = false;

    const el = App.el, m = movie(l.order[l.i]);
    const btn = (id, text, onclick, cls = "") => el("button", { id, type: "button", textContent: text, onclick, className: cls });
    let head, body;
    if (l.phase === "finished") {
      head = "Marathon complete 🎉";
      body = el("p", { id: "live-sub", textContent: `You watched ${l.order.length} movie${l.order.length === 1 ? "" : "s"}. Nice work.` });
    } else {
      head = l.phase === "movie" ? "Now playing" : "Break time ☕";
      body = el("div", { className: "live-body" },
        el("div", {},
          el("p", { id: "live-title", className: "live-title", textContent: l.phase === "movie" ? m.title : `Next: ${m.title}` }),
          el("p", { id: "live-sub", className: "hint", textContent: `Movie ${l.i + 1} of ${l.order.length}` }),
          el("p", { id: "live-timer", className: "live-timer" }),
          el("progress", { id: "live-bar", max: 1, value: 0 }),
          el("p", { id: "live-next", className: "hint" }),
          el("p", { id: "live-end", className: "hint" })));
    }
    const lastMovie = l.phase === "movie" && l.i + 1 >= l.order.length;
    const buttons = el("div", { id: "actions" },
      l.phase === "movie" ? btn("live-done", lastMovie ? "✅ Done — finish" : "✅ Done — next", advance, "primary") : "",
      l.phase === "break" ? btn("live-next-btn", "⏭ Start next now", advance, "primary") : "",
      l.phase === "finished" ? btn("live-close", "Close", stop, "primary") : btn("live-stop", "⏹ Stop marathon", stop));
    root.replaceChildren(el("h2", { id: "live-head", textContent: head }), body, buttons);

    tick();
    if (l.phase !== "finished" && !timer) timer = setInterval(tick, 1000);
    if (l.phase === "finished") { clearInterval(timer); timer = null; }
    return true;
  }

  function tick() {
    const l = st();
    if (!l || l.phase === "finished" || !$("live-timer")) return;
    const now = Date.now(), total = phaseMs(l), left = total - (now - l.t0);
    const timerEl = $("live-timer");
    timerEl.textContent = left > 0 ? fmt(left) : (l.phase === "movie" ? "Time's up. Tap Done." : "Break's over. Start the next one.");
    timerEl.classList.toggle("over", left <= 0);
    $("live-bar").value = total ? Math.min(1, Math.max(0, 1 - left / total)) : 1;

    const hasNext = l.phase === "movie" ? l.i + 1 < l.order.length : true;
    if (hasNext) {
      const nextMovie = movie(l.order[l.phase === "movie" ? l.i + 1 : l.i]);
      const startsAt = now + Math.max(0, left) + (l.phase === "movie" ? brkMs() : 0);
      $("live-next").textContent = l.phase === "movie" ? `Up next: ${nextMovie.title} at about ${clock(startsAt)}` : `Starts at about ${clock(startsAt)}`;
    } else {
      $("live-next").textContent = "This is the last movie.";
    }
    const rest = remaining(l, now);
    $("live-end").textContent = `Marathon ends about ${clock(now + rest)} (${formatDuration(Math.ceil(rest / 60000))} to go)`;
  }

  return { start, render, active: () => !!st() };
})();
