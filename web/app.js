const App = (() => {
  const { buildPlan, shuffle, schedule, formatDuration, formatClock, budgetFor, seriesViolations } = Ordering;
  const { LIMITS } = Share;
  const $ = (id) => document.getElementById(id);

  let data = Store.load();
  let editing = null;                    // id of the movie row being edited
  let lastPlan = { ordered: [], skipped: [] };
  let lookupTimer, lookupSeq = 0;
  let pendingFocus = null;               // { id, sel? } row (or its button) to refocus after a re-render
  let undo = null;                       // the last removed movie: { listId, movie, index }

  const cur = () => data.lists[data.current];
  const persist = () => Store.save(data);
  const active = () => cur().movies.filter((m) => !m.watched);
  const isPinned = (m) => Number.isInteger(m.pin);
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const canLink = () => /^https?:$/.test(location.protocol) && !window.Capacitor;

  function el(tag, props = {}, ...kids) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...kids);
    return node;
  }

  // ---------- small UI helpers ----------
  let toastTimer;
  function toast(msg, action) {
    const t = $("toast");
    t.replaceChildren(msg);
    if (action) {
      const b = el("button", { type: "button", className: "toast-action", textContent: action.label });
      b.onclick = () => { clearTimeout(toastTimer); t.hidden = true; action.run(); };
      t.append(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), action ? 8000 : 2600);
  }

  async function copy(text, okMsg) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch {
      const ta = el("textarea", { value: text });
      document.body.append(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch {}
      ta.remove();
    }
    toast(ok ? okMsg : "Couldn't copy automatically. Try again from a secure (https) page.");
  }

  // <dialog> instead of prompt()/confirm(): Electron has no prompt().
  function dialog(msg, { input = false, initial = "" } = {}) {
    return new Promise((resolve) => {
      const dlg = $("dlg");
      $("dlg-msg").textContent = msg;
      $("dlg-input").hidden = !input;
      $("dlg-input").value = initial;
      dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok" ? ($("dlg-input").value.trim() || (input ? null : true)) : null), { once: true });
      dlg.returnValue = "cancel";
      dlg.showModal();
      if (input) $("dlg-input").select();
    });
  }

  function download(text, filename, type) {
    const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function banner(text) {
    $("banner-text").textContent = text;
    $("banner").hidden = false;
  }

  // ---------- inputs <-> settings of the current marathon ----------
  function loadInputs() {
    const s = cur().settings;
    $("strategy").value = s.strategy;
    $("break").value = s.brk;
    $("budget").value = s.budget;
    $("start").value = s.start;
    $("buffer").value = s.buffer;
    $("date").value = s.date && s.date >= todayISO() ? s.date : todayISO();
    $("finish").value = s.finishBy || "";
    $("meal-after").value = s.mealAfter || "";
    $("meal-min").value = s.mealMin || "";
  }
  function readInputs() {
    const s = cur().settings;
    s.strategy = $("strategy").value;
    s.brk = Math.max(0, +$("break").value || 0);
    s.budget = $("budget").value;
    s.start = $("start").value || "18:00";
    s.buffer = Math.max(0, Math.min(60, +$("buffer").value || 0));
    s.date = $("date").value;
    s.finishBy = $("finish").value || "";
    s.mealAfter = Math.max(0, Math.min(50, Math.floor(+$("meal-after").value || 0)));
    s.mealMin = Math.max(0, Math.min(180, Math.floor(+$("meal-min").value || 0)));
  }

  // "Time available" and "Finish by" combined, and the optional meal break.
  const limitInfo = () => { const s = cur().settings; return budgetFor({ budgetHours: s.budget, start: s.start || "18:00", finishBy: s.finishBy }); };
  const mealOf = () => { const s = cur().settings; return s.mealAfter > 0 && s.mealMin > 0 ? { after: s.mealAfter, min: s.mealMin } : null; };

  function plan(order = cur().order) {
    const s = cur().settings;
    return buildPlan({
      movies: active(), strategy: s.strategy, breakMin: s.brk, buffer: s.buffer, order,
      budgetMin: limitInfo().minutes, meal: mealOf(),
    });
  }

  // ---------- arranging the plan: drag, move, pin, shuffle ----------
  // ids = the new displayed order. Pinned movies follow it, everyone else becomes the manual order.
  function arrange(ids) {
    const c = cur();
    const byId = new Map(c.movies.map((m) => [m.id, m]));
    ids.forEach((id, i) => { if (isPinned(byId.get(id))) byId.get(id).pin = i; });
    c.order = [...ids.filter((id) => !isPinned(byId.get(id))), ...lastPlan.skipped.map((m) => m.id)];
    persist();
    render();
  }
  // Returns false if the move isn't allowed (it would put a movie ahead of an earlier one in its series).
  function move(from, to) {
    if (to < 0 || to >= lastPlan.ordered.length) return false;
    const list = [...lastPlan.ordered];
    list.splice(to, 0, ...list.splice(from, 1));
    const was = new Set(seriesViolations(lastPlan.ordered));
    const bad = seriesViolations(list).find((v) => !was.has(v));
    if (bad) {
      const [a, b] = bad.split(">").map((id) => list.find((m) => String(m.id) === id));
      pendingFocus = null;
      toast(`${a.title} is part ${a.seq || "?"} of “${a.series}”, so it has to stay after ${b.title}.`);
      return false;
    }
    arrange(list.map((m) => m.id));
    return true;
  }
  function togglePin(i) {
    const m = cur().movies.find((x) => x.id === lastPlan.ordered[i].id);
    if (isPinned(m)) delete m.pin; else m.pin = i;
    arrange(lastPlan.ordered.map((x) => x.id));
  }
  function doShuffle() {
    const free = active().filter((m) => !isPinned(m));
    const shown = (p) => p.ordered.map((m) => m.id).join();
    const before = shown(lastPlan);
    let next;
    for (let i = 0; i < 20; i++) {   // re-roll so the button visibly changes something
      next = shuffle(free).map((m) => m.id);
      if (shown(plan(next)) !== before) break;
    }
    cur().order = next;
    persist();
    render();
  }

  // ---------- removing a movie, with undo ----------
  function removeMovie(m) {
    const c = cur();
    const index = c.movies.findIndex((o) => o.id === m.id);
    if (index < 0) return;
    c.movies.splice(index, 1);
    undo = { listId: data.current, movie: m, index };
    persist();
    render();
    toast(`Removed ${m.title}.`, { label: "Undo", run: undoRemove });
  }
  function undoRemove() {
    if (!undo) return;
    const u = undo, list = data.lists[u.listId];
    undo = null;
    if (!list || list.movies.some((o) => o.id === u.movie.id)) return;
    if (list.movies.length >= LIMITS.movies) return toast(`That marathon is full (${LIMITS.movies} movies), so ${u.movie.title} can't be put back.`);
    list.movies.splice(Math.min(u.index, list.movies.length), 0, u.movie);
    persist();
    render();
    toast(`Put back ${u.movie.title}.`);
  }

  // ---------- movie list ----------
  function movieRow(m) {
    const box = el("input", { type: "checkbox", className: "watched-box", checked: !!m.watched });
    box.setAttribute("aria-label", `Mark ${m.title} as watched`);
    box.onchange = () => { m.watched = box.checked; if (!m.watched) delete m.watched; persist(); render(); };
    const label = el("span", { className: "mtitle" + (m.watched ? " done" : ""), textContent: `${m.title} — ${formatDuration(m.minutes)}` });
    if (m.series) label.append(el("span", { className: "series-tag", textContent: ` · ${m.series}${m.seq ? " #" + m.seq : ""}` }));
    const edit = el("button", { className: "edit", type: "button", textContent: "✎" });
    edit.setAttribute("aria-label", `Edit ${m.title}`);
    edit.onclick = () => { editing = m.id; render(); };
    const del = el("button", { className: "remove", type: "button", textContent: "×" });
    del.setAttribute("aria-label", `Remove ${m.title}`);
    del.onclick = () => removeMovie(m);
    return el("li", {}, el("span", { className: "left" }, box, label), el("span", { className: "right" }, edit, del));
  }

  function editRow(m) {
    const title = el("input", { className: "e-title", value: m.title, maxLength: 120 });
    const h = el("input", { className: "e-h", type: "number", min: 0, max: 33, value: Math.floor(m.minutes / 60) });
    const mi = el("input", { className: "e-m", type: "number", min: 0, max: 59, value: m.minutes % 60 });
    const series = el("input", { className: "e-series", value: m.series || "", maxLength: 60, placeholder: "Series (optional)" });
    series.setAttribute("aria-label", "Series name (optional)");
    series.title = "Series name, for films that must play in order (optional)";
    const seq = el("input", { className: "e-seq", type: "number", min: 1, max: 999, value: m.seq || "", placeholder: "#" });
    seq.setAttribute("aria-label", "Number in the series");
    seq.title = "Number in the series (leave empty to put it last)";
    const save = el("button", { className: "e-save", type: "submit", textContent: "Save" });
    const cancel = el("button", { className: "e-cancel", type: "button", textContent: "Cancel" });
    cancel.onclick = () => { editing = null; render(); };
    const form = el("form", { className: "edit-form" }, title, h, mi, series, seq, save, cancel);
    form.onsubmit = (e) => {
      e.preventDefault();
      const minutes = (+h.value || 0) * 60 + (+mi.value || 0);
      if (!title.value.trim() || minutes <= 0) return;
      m.title = title.value.trim();
      m.minutes = minutes;
      // A series keeps its films in order. Without a number, a film goes to the end of its series.
      const name = series.value.trim();
      const key = name.toLowerCase();
      if (!name) { delete m.series; delete m.seq; }
      else {
        const others = cur().movies.filter((o) => o !== m && o.series && o.series.trim().toLowerCase() === key);
        m.series = name;
        const n = Math.floor(+seq.value);
        m.seq = n >= 1 ? Math.min(n, 999) : Math.min(999, others.reduce((t, o) => Math.max(t, o.seq || 0), 0) + 1);
      }
      editing = null;
      persist();
      render();
    };
    setTimeout(() => title.focus());
    return el("li", { className: "editing" }, form);
  }

  function renderList() {
    const c = cur();
    $("list").replaceChildren(...c.movies.map((m) => (editing === m.id ? editRow(m) : movieRow(m))));
    $("reset-watched").hidden = !c.movies.some((m) => m.watched);
  }

  // ---------- marathons (saved lists) ----------
  function renderMarathons() {
    const sel = $("marathon");
    sel.replaceChildren(...Object.entries(data.lists).map(([id, l]) => el("option", { value: id, textContent: l.name })));
    sel.value = data.current;
    const count = Object.keys(data.lists).length, full = count >= LIMITS.marathons;
    $("m-delete").disabled = count < 2;
    for (const id of ["m-new", "m-dup"]) {
      $(id).disabled = full;
      $(id).title = full ? `You have the most marathons allowed (${LIMITS.marathons}). Delete one first.` : "";
    }
  }
  function switchTo(id) {
    data.current = id;
    editing = null;
    if (undo) { undo = null; $("toast").hidden = true; }   // an undo belongs to the marathon it came from
    persist();
    loadInputs();
    render();
  }

  // ---------- the plan ----------
  function currentItems() {
    const s = cur().settings;
    const { items, total } = schedule(lastPlan.ordered, s.brk, mealOf());
    return { items, total, start: s.start || "18:00" };
  }

  function actionsBar(canShuffle) {
    const b = (id, text, onclick, extra = {}) => el("button", { id, type: "button", textContent: text, onclick, ...extra });
    const bar = el("div", { id: "actions" },
      b("shuffle", "🔀 Shuffle", doShuffle, { disabled: !canShuffle }),
      b("start-live", "▶ Start marathon", () => Live.start(lastPlan.ordered.map((m) => m.id))),
    );
    if (canLink()) bar.append(b("copy-link", "🔗 Copy link", shareLink));
    bar.append(
      b("copy-text", "📋 Copy as text", shareText),
      b("ics", "📅 Add to calendar", downloadICS),
      b("print", "🖨 Print", () => window.print()),
    );
    return bar;
  }

  // Links always point at the real site, so ones copied from an embedded copy (itch.io) still work.
  // Only local development uses its own address.
  const CANONICAL = "https://sarindre.github.io/movie-marathon/";
  function shareBase() {
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    return local ? location.origin + location.pathname : CANONICAL;
  }

  function shareLink() {
    const c = cur();
    if (c.movies.length > LIMITS.movies) return toast(`Too many movies to share a link (the limit is ${LIMITS.movies}).`);
    const code = Share.encodePlan({ name: c.name, movies: c.movies, settings: c.settings, orderedIds: lastPlan.ordered.map((m) => m.id) });
    copy(`${shareBase()}#m=${code}`, "Link copied. Anyone who opens it gets this marathon.");
  }
  function shareText() {
    const { items, total, start } = currentItems();
    copy(Share.toText({ name: cur().name, items, total, start }), "Copied. Paste it into a chat.");
  }
  function downloadICS() {
    const { items, start } = currentItems();
    const ics = Share.toICS({ name: cur().name, items, date: cur().settings.date || todayISO(), start });
    download(ics, `${cur().name.replace(/[^\w-]+/g, "-")}.ics`, "text/calendar");
    toast("Calendar file downloaded. Open it to add the movies.");
  }

  function renderPlan() {
    const c = cur(), s = c.settings;
    const result = $("result");
    const live = active();
    if (!c.movies.length) { result.innerHTML = "<p class='hint'>Add some movies to get a suggested order.</p>"; $("print-head").replaceChildren(); return; }
    if (!live.length) { result.innerHTML = "<p class='hint'>You've watched everything on this list 🎉 Use “Reset watched” to plan it again.</p>"; $("print-head").replaceChildren(); return; }

    lastPlan = plan();
    const { items, total, start } = currentItems();
    const h = el("h2", { textContent: `Suggested order · ${formatDuration(total)} total, ends ${formatClock(start, total)}` });
    const notes = [];
    if (s.buffer > 0) notes.push(`Includes ${s.buffer} extra min per movie (trailers, credits).`);
    if (lastPlan.overBudget) notes.push("Your pinned movies alone are longer than the time you have.");
    const limit = limitInfo();
    if (limit.source === "finish") notes.push(`Planned to finish by ${formatClock(s.finishBy, 0)}${+s.budget > 0 ? ", which is sooner than your time limit" : ""}.`);
    else if (limit.source === "limit" && Ordering.minutesUntil(s.start || "18:00", s.finishBy) > 0) notes.push("Your time limit is shorter than the time until your finish-by time, so it is the one used.");
    const meal = mealOf();
    if (meal && lastPlan.ordered.length > meal.after) notes.push(`Meal break: ${formatDuration(Math.max(s.brk, meal.min))} after movie ${meal.after}.`);
    if (lastPlan.seriesBroken) notes.push("A pinned movie plays ahead of an earlier film in its series.");

    const ol = el("ol");
    let dragFrom = null;
    items.forEach((it, i) => {
      const pin = el("button", { className: "pin" + (isPinned(it) ? " on" : ""), type: "button", textContent: "📌" });
      pin.setAttribute("aria-pressed", String(isPinned(it)));
      pin.setAttribute("aria-label", `${isPinned(it) ? "Unpin" : "Pin"} ${it.title}`);
      pin.title = isPinned(it) ? "Pinned: keeps this slot when you shuffle" : "Pin to keep this slot when you shuffle";
      pin.onclick = () => togglePin(i);
      const up = el("button", { className: "up", type: "button", textContent: "▲", disabled: i === 0 });
      up.setAttribute("aria-label", `Move ${it.title} earlier`);
      up.onclick = () => { pendingFocus = { id: it.id, sel: ".up" }; move(i, i - 1); };
      const down = el("button", { className: "down", type: "button", textContent: "▼", disabled: i === items.length - 1 });
      down.setAttribute("aria-label", `Move ${it.title} later`);
      down.onclick = () => { pendingFocus = { id: it.id, sel: ".down" }; move(i, i + 1); };

      const li = el("li", { draggable: true, tabIndex: 0 },
        el("span", { className: "ptext", textContent: `${it.title} (${formatDuration(it.runtime)}) — ${formatClock(start, it.start)} to ${formatClock(start, it.end)}` }),
        el("span", { className: "ctrls" }, pin, up, down));
      li.dataset.id = it.id;
      if (meal && i + 1 === meal.after && i + 1 < items.length) li.append(el("span", { className: "meal-tag", textContent: `🍽 Meal break next: ${formatDuration(Math.max(s.brk, meal.min))}` }));
      li.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown P");
      // Keyboard alternative to dragging: Alt+Up/Down moves the row, P pins it.
      li.addEventListener("keydown", (e) => {
        if (e.target !== li) return;
        if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          const to = i + (e.key === "ArrowUp" ? -1 : 1);
          if (to < 0 || to >= items.length) return e.preventDefault();
          e.preventDefault();
          pendingFocus = { id: it.id };
          if (move(i, to)) toast(`${it.title} is now number ${to + 1}`);
        } else if (e.key.toLowerCase() === "p" && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          pendingFocus = { id: it.id };
          togglePin(i);
        }
      });
      li.addEventListener("dragstart", (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); li.classList.add("dragging"); });
      li.addEventListener("dragover", (e) => { if (dragFrom !== null) { e.preventDefault(); li.classList.add("over"); } });
      li.addEventListener("dragleave", () => li.classList.remove("over"));
      li.addEventListener("dragend", () => { dragFrom = null; li.classList.remove("dragging"); for (const x of ol.children) x.classList.remove("over"); });
      li.addEventListener("drop", (e) => { e.preventDefault(); const from = dragFrom; dragFrom = null; if (from !== null && from !== i) move(from, i); });
      ol.append(li);
    });

    result.replaceChildren(h, actionsBar(live.filter((m) => !isPinned(m)).length > 1), ...notes.map((n) => el("p", { className: "meta", textContent: n })),
      el("p", { className: "hint small", textContent: "Tip: drag a row, or click it and press Alt+↑ / Alt+↓ to move it and P to pin it." }), ol);
    if (lastPlan.skipped.length) {
      result.append(el("p", {
        className: "hint skipped",
        textContent: (lastPlan.ordered.length ? "Didn't fit: " : "Nothing fits in that time: ") +
          lastPlan.skipped.map((m) => `${m.title} (${formatDuration(m.runtime)})`).join(", "),
      }));
    }
    $("print-head").replaceChildren(
      el("h2", { textContent: c.name }),
      el("p", { textContent: `${s.date || todayISO()} · starts ${formatClock(start, 0)} · ends ${formatClock(start, total)} · ${formatDuration(total)} total` }));

    // Re-rendering rebuilds the rows, so put keyboard focus back where it was.
    if (pendingFocus) {
      const row = [...ol.children].find((x) => x.dataset.id === String(pendingFocus.id));
      const btn = pendingFocus.sel && row && row.querySelector(pendingFocus.sel);
      (btn && !btn.disabled ? btn : row)?.focus();
      pendingFocus = null;
    }
  }

  function render() {
    renderMarathons();
    renderList();
    if (Live.render()) { $("result").hidden = true; return; }
    $("result").hidden = false;
    renderPlan();
  }

  // ---------- runtime lookup (Wikidata) ----------
  function showSuggestions(results) {
    const ul = $("suggestions");
    ul.hidden = !results.length;
    ul.replaceChildren(...results.map((r) => {
      const b = el("button", { type: "button", textContent: `${r.title} — ${r.description} · ${r.minutes ? formatDuration(r.minutes) : "no runtime"}` });
      b.onclick = () => {
        $("title").value = r.title;
        if (r.minutes) { $("hours").value = Math.floor(r.minutes / 60); $("mins").value = r.minutes % 60; }
        else $("hours").focus();
        lookupSeq++;
        showSuggestions([]);
      };
      return el("li", {}, b);
    }));
  }

  // ---------- paste a list of movies ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let bulkBusy = false;
  async function bulkAdd() {
    if (bulkBusy) return;
    const status = $("bulk-status"), box = $("bulk-text"), btn = $("bulk-add");
    const { items, duplicates } = Bulk.parseList(box.value);
    if (!items.length) { status.textContent = "Type or paste at least one movie title first."; return; }
    const list = cur();                          // keep adding to this marathon even if the user switches
    const have = new Set(list.movies.map((m) => m.title.toLowerCase()));
    const fresh = items.filter((it) => !have.has(it.title.toLowerCase()));
    const already = items.length - fresh.length;
    bulkBusy = btn.disabled = true;
    status.textContent = "Adding…";
    let added = 0, found = 0, looked = 0, full = 0;
    const left = [];
    for (const it of fresh) {
      if (list.movies.length >= LIMITS.movies) { full++; left.push(it.line); continue; }
      let minutes = it.minutes;
      if (!minutes && looked < 25) {              // be polite to Wikidata: a few lookups, not hundreds
        looked++;
        try {
          const hits = await Lookup.searchFilms(it.title);
          const hit = hits.find((h) => h.minutes && h.title.toLowerCase() === it.title.toLowerCase()) || hits.find((h) => h.minutes);
          if (hit) { minutes = hit.minutes; found++; }
        } catch {}
        await sleep(250);
      }
      if (!minutes) { left.push(it.line); continue; }
      list.movies.push({ id: Store.uid(), title: it.title, minutes });
      added++;
    }
    box.value = left.join("\n");
    persist();
    render();
    const parts = [`Added ${added} movie${added === 1 ? "" : "s"}.`];
    if (found) parts.push(`${found} runtime${found === 1 ? " was" : "s were"} found online, so give ${found === 1 ? "it" : "them"} a quick check.`);
    if (already) parts.push(`${already} already in the list, skipped.`);
    if (duplicates) parts.push(`${duplicates} repeated in your paste, skipped.`);
    if (full) parts.push(`The marathon is full (${LIMITS.movies} movies), so ${full} were left out.`);
    const noTime = left.length - full;
    if (noTime > 0) parts.push(`${noTime} still need${noTime === 1 ? "s" : ""} a runtime. Put one at the end of the line, like “Predator, 107”, and press Add again.`);
    status.textContent = parts.join(" ");
    bulkBusy = btn.disabled = false;
  }

  // ---------- startup ----------
  function importFromHash() {
    const m = /^#m=(.+)$/.exec(location.hash);
    if (!m) return;
    try {
      const p = Share.decodePlan(m[1]);
      // A brand-new visitor has one empty list: use it rather than leaving it behind.
      const only = Object.keys(data.lists).length === 1 && !cur().movies.length;
      if (!only && Object.keys(data.lists).length >= LIMITS.marathons) {
        banner(`You already have the most marathons allowed (${LIMITS.marathons}). Delete one, then open the link again.`);
        history.replaceState(null, "", location.pathname + location.search);
        return;
      }
      let id;
      if (only) { id = data.current; data.lists[id].name = p.name; }
      else id = Store.create(data, Store.uniqueName(data, p.name));
      Object.assign(data.lists[id], { movies: p.movies, settings: { ...Store.defaults(), ...p.settings }, order: p.order });
      persist();
      banner(`Loaded the shared marathon “${data.lists[id].name}”. It's saved in your list.`);
    } catch {
      banner("That share link couldn't be read.");
    }
    history.replaceState(null, "", location.pathname + location.search);
  }

  function init() {
    Theme.initPicker($("theme"));
    Theme.initDisplay($("mode"), $("textsize"));
    Theme.apply();
    importFromHash();
    loadInputs();

    $("add").addEventListener("submit", (e) => {
      e.preventDefault();
      const minutes = (+$("hours").value || 0) * 60 + (+$("mins").value || 0);
      if (minutes <= 0) return $("hours").focus();
      if (cur().movies.length >= LIMITS.movies) return toast(`This marathon is full (${LIMITS.movies} movies). Remove one, or start a new marathon.`);
      const title = $("title").value.trim().slice(0, 120);
      cur().movies.push({ id: Store.uid(), title, minutes });
      e.target.reset();
      $("title").focus();
      persist();
      render();
    });

    $("title").addEventListener("input", () => {
      clearTimeout(lookupTimer);
      const q = $("title").value.trim();
      if (q.length < 3) return showSuggestions([]);
      lookupTimer = setTimeout(async () => {
        const seq = ++lookupSeq;
        try {
          const results = await Lookup.searchFilms(q);
          if (seq === lookupSeq) showSuggestions(results);
        } catch { if (seq === lookupSeq) showSuggestions([]); }
      }, 350);
    });

    // Changing any of these rethinks the whole plan, so a manual order is dropped.
    for (const id of ["strategy", "break", "budget", "buffer", "finish", "meal-after", "meal-min"]) {
      $(id).addEventListener("input", () => { readInputs(); cur().order = null; persist(); render(); });
    }
    for (const id of ["start", "date"]) $(id).addEventListener("input", () => { readInputs(); persist(); render(); });

    // Backup: export every marathon to a file, import from one.
    $("export-btn").onclick = () => {
      download(Share.exportAll(data), `movie-marathons-${todayISO()}.json`, "application/json");
      toast("Backup downloaded.");
    };
    $("import-btn").onclick = () => $("import-file").click();
    $("import-file").addEventListener("change", async () => {
      const file = $("import-file").files[0];
      $("import-file").value = "";
      if (!file) return;
      try {
        const all = Share.parseExport(await file.text());
        if (!all.length) throw new Error("empty");
        const room = LIMITS.marathons - Object.keys(data.lists).length;
        if (room <= 0) return toast(`You already have the most marathons allowed (${LIMITS.marathons}). Delete some to import more.`);
        const plans = all.slice(0, room);
        for (const p of plans) {
          const id = Store.create(data, Store.uniqueName(data, p.name));
          Object.assign(data.lists[id], { movies: p.movies, settings: { ...Store.defaults(), ...p.settings }, order: p.order });
        }
        persist();
        switchTo(data.current);
        $("display-menu").open = false;
        toast(plans.length < all.length
          ? `Imported ${plans.length} of ${all.length} marathons. ${LIMITS.marathons} is the most you can have.`
          : `Imported ${plans.length} marathon${plans.length === 1 ? "" : "s"}.`);
      } catch {
        toast("That file isn't a Movie Marathon backup.");
      }
    });

    $("bulk-add").onclick = bulkAdd;
    $("alerts").checked = Theme.alertsOn();
    $("alerts").onchange = () => { Theme.setAlerts($("alerts").checked); if ($("alerts").checked) Live.preview(); };
    // Ctrl/Cmd+Z puts back the last removed movie (a keyboard way to use the Undo button).
    document.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey && undo && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault();
        undoRemove();
      }
    });

    $("reset-watched").onclick = () => { cur().movies.forEach((m) => delete m.watched); persist(); render(); };
    $("banner-close").onclick = () => ($("banner").hidden = true);

    $("marathon").addEventListener("input", () => switchTo($("marathon").value));
    $("m-new").onclick = async () => {
      if (Object.keys(data.lists).length >= LIMITS.marathons) return;
      const name = await dialog("Name your new marathon", { input: true, initial: Store.uniqueName(data, "New marathon") });
      if (!name) return;
      Store.create(data, Store.uniqueName(data, name));
      switchTo(data.current);
    };
    $("m-dup").onclick = () => {
      if (Object.keys(data.lists).length >= LIMITS.marathons) return;
      Store.duplicate(data, data.current);
      switchTo(data.current);
      toast(`Copied. You're now in “${cur().name}”.`);
    };
    $("m-rename").onclick = async () => {
      const name = await dialog("Rename this marathon", { input: true, initial: cur().name });
      if (!name) return;
      cur().name = name;
      persist();
      render();
    };
    $("m-delete").onclick = async () => {
      if (!(await dialog(`Delete “${cur().name}” and its movies?`))) return;
      Store.remove(data, data.current);
      switchTo(data.current);
    };

    // Close the Display menu when clicking elsewhere.
    document.addEventListener("click", (e) => { const d = $("display-menu"); if (d.open && !d.contains(e.target)) d.open = false; });

    render();
  }

  return { init, cur, persist, render, toast, el };
})();
