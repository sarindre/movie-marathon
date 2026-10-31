const App = (() => {
  const { buildPlan, shuffle, schedule, formatDuration, formatClock } = Ordering;
  const $ = (id) => document.getElementById(id);

  let data = Store.load();
  let editing = null;                    // id of the movie row being edited
  let lastPlan = { ordered: [], skipped: [] };
  let lookupTimer, lookupSeq = 0;

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
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
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
  }
  function readInputs() {
    const s = cur().settings;
    s.strategy = $("strategy").value;
    s.brk = Math.max(0, +$("break").value || 0);
    s.budget = $("budget").value;
    s.start = $("start").value || "18:00";
    s.buffer = Math.max(0, Math.min(60, +$("buffer").value || 0));
    s.date = $("date").value;
  }

  function plan(order = cur().order) {
    const s = cur().settings;
    return buildPlan({
      movies: active(), strategy: s.strategy, breakMin: s.brk, buffer: s.buffer, order,
      budgetMin: Math.round((+s.budget || 0) * 60),
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
  function move(from, to) {
    if (to < 0 || to >= lastPlan.ordered.length) return;
    const ids = lastPlan.ordered.map((m) => m.id);
    ids.splice(to, 0, ...ids.splice(from, 1));
    arrange(ids);
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

  // ---------- movie list ----------
  function movieRow(m) {
    const box = el("input", { type: "checkbox", className: "watched-box", checked: !!m.watched });
    box.setAttribute("aria-label", `Mark ${m.title} as watched`);
    box.onchange = () => { m.watched = box.checked; if (!m.watched) delete m.watched; persist(); render(); };
    const label = el("span", { className: "mtitle" + (m.watched ? " done" : ""), textContent: `${m.title} — ${formatDuration(m.minutes)}` });
    const edit = el("button", { className: "edit", type: "button", textContent: "✎" });
    edit.setAttribute("aria-label", `Edit ${m.title}`);
    edit.onclick = () => { editing = m.id; render(); };
    const del = el("button", { className: "remove", type: "button", textContent: "✕" });
    del.setAttribute("aria-label", `Remove ${m.title}`);
    del.onclick = () => { cur().movies = cur().movies.filter((o) => o.id !== m.id); persist(); render(); };
    return el("li", {}, el("span", { className: "left" }, box, label), el("span", { className: "right" }, edit, del));
  }

  function editRow(m) {
    const title = el("input", { className: "e-title", value: m.title, maxLength: 120 });
    const h = el("input", { className: "e-h", type: "number", min: 0, max: 33, value: Math.floor(m.minutes / 60) });
    const mi = el("input", { className: "e-m", type: "number", min: 0, max: 59, value: m.minutes % 60 });
    const save = el("button", { className: "e-save", type: "submit", textContent: "Save" });
    const cancel = el("button", { className: "e-cancel", type: "button", textContent: "Cancel" });
    cancel.onclick = () => { editing = null; render(); };
    const form = el("form", { className: "edit-form" }, title, h, mi, save, cancel);
    form.onsubmit = (e) => {
      e.preventDefault();
      const minutes = (+h.value || 0) * 60 + (+mi.value || 0);
      if (!title.value.trim() || minutes <= 0) return;
      m.title = title.value.trim();
      m.minutes = minutes;
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
    $("m-delete").disabled = Object.keys(data.lists).length < 2;
  }
  function switchTo(id) {
    data.current = id;
    editing = null;
    persist();
    loadInputs();
    render();
  }

  // ---------- the plan ----------
  function currentItems() {
    const s = cur().settings;
    const { items, total } = schedule(lastPlan.ordered, s.brk);
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

  function shareLink() {
    const c = cur();
    const code = Share.encodePlan({ name: c.name, movies: c.movies, settings: c.settings, orderedIds: lastPlan.ordered.map((m) => m.id) });
    copy(`${location.origin}${location.pathname}#m=${code}`, "Link copied. Anyone who opens it gets this marathon.");
  }
  function shareText() {
    const { items, total, start } = currentItems();
    copy(Share.toText({ name: cur().name, items, total, start }), "Copied. Paste it into a chat.");
  }
  function downloadICS() {
    const { items, start } = currentItems();
    const ics = Share.toICS({ name: cur().name, items, date: cur().settings.date || todayISO(), start });
    const a = el("a", { href: URL.createObjectURL(new Blob([ics], { type: "text/calendar" })), download: `${cur().name.replace(/[^\w-]+/g, "-")}.ics` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
      up.onclick = () => move(i, i - 1);
      const down = el("button", { className: "down", type: "button", textContent: "▼", disabled: i === items.length - 1 });
      down.setAttribute("aria-label", `Move ${it.title} later`);
      down.onclick = () => move(i, i + 1);

      const li = el("li", { draggable: true },
        el("span", { className: "ptext", textContent: `${it.title} (${formatDuration(it.runtime)}) — ${formatClock(start, it.start)} to ${formatClock(start, it.end)}` }),
        el("span", { className: "ctrls" }, pin, up, down));
      li.dataset.id = it.id;
      li.addEventListener("dragstart", (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); li.classList.add("dragging"); });
      li.addEventListener("dragover", (e) => { if (dragFrom !== null) { e.preventDefault(); li.classList.add("over"); } });
      li.addEventListener("dragleave", () => li.classList.remove("over"));
      li.addEventListener("dragend", () => { dragFrom = null; li.classList.remove("dragging"); for (const x of ol.children) x.classList.remove("over"); });
      li.addEventListener("drop", (e) => { e.preventDefault(); const from = dragFrom; dragFrom = null; if (from !== null && from !== i) move(from, i); });
      ol.append(li);
    });

    result.replaceChildren(h, actionsBar(live.filter((m) => !isPinned(m)).length > 1), ...notes.map((n) => el("p", { className: "meta", textContent: n })), ol);
    if (lastPlan.skipped.length) {
      result.append(el("p", {
        className: "hint",
        textContent: (lastPlan.ordered.length ? "Didn't fit: " : "Nothing fits in that time: ") +
          lastPlan.skipped.map((m) => `${m.title} (${formatDuration(m.runtime)})`).join(", "),
      }));
    }
    $("print-head").replaceChildren(
      el("h2", { textContent: c.name }),
      el("p", { textContent: `${s.date || todayISO()} · starts ${formatClock(start, 0)} · ends ${formatClock(start, total)} · ${formatDuration(total)} total` }));
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

  // ---------- startup ----------
  function importFromHash() {
    const m = /^#m=(.+)$/.exec(location.hash);
    if (!m) return;
    try {
      const p = Share.decodePlan(m[1]);
      // A brand-new visitor has one empty list: use it rather than leaving it behind.
      const only = Object.keys(data.lists).length === 1 && !cur().movies.length;
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
      const title = $("title").value.trim();
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
    for (const id of ["strategy", "break", "budget", "buffer"]) {
      $(id).addEventListener("input", () => { readInputs(); cur().order = null; persist(); render(); });
    }
    for (const id of ["start", "date"]) $(id).addEventListener("input", () => { readInputs(); persist(); render(); });

    $("reset-watched").onclick = () => { cur().movies.forEach((m) => delete m.watched); persist(); render(); };
    $("banner-close").onclick = () => ($("banner").hidden = true);

    $("marathon").addEventListener("input", () => switchTo($("marathon").value));
    $("m-new").onclick = async () => {
      const name = await dialog("Name your new marathon", { input: true, initial: Store.uniqueName(data, "New marathon") });
      if (!name) return;
      Store.create(data, Store.uniqueName(data, name));
      switchTo(data.current);
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
