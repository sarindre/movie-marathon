// Share links, plain-text export and calendar (.ics) export. All pure functions.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./ordering.js"));
  else root.Share = factory(root.Ordering);
})(typeof self !== "undefined" ? self : this, function (Ordering) {
  const { formatDuration, formatClock } = Ordering;

  const toB64 = (str) => {
    let bin = "";
    for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromB64 = (s) => {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  };

  // orderedIds = the plan as displayed, so the receiver sees the same order.
  function encodePlan({ name, movies, settings, orderedIds }) {
    const idx = new Map(movies.map((m, i) => [m.id, i]));
    return toB64(JSON.stringify({
      v: 1, n: name,
      m: movies.map((m) => [m.title, m.minutes, m.watched ? 1 : 0, Number.isInteger(m.pin) ? m.pin : -1]),
      s: [settings.strategy, settings.brk, settings.budget, settings.start, settings.date, settings.buffer],
      o: orderedIds.map((id) => idx.get(id)).filter((i) => i !== undefined),
    }));
  }

  const STRATEGIES = ["bestfit", "shortest", "longest", "balanced"];
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Everything in a link is untrusted: validate and clamp it all.
  function decodePlan(str, newId = uid) {
    const p = JSON.parse(fromB64(str));
    if (!p || p.v !== 1 || !Array.isArray(p.m) || !Array.isArray(p.s)) throw new Error("bad share link");
    if (p.m.length > 200) throw new Error("too many movies");
    const movies = p.m.map((r) => {
      const movie = { id: newId(), title: String(r[0] || "Untitled").slice(0, 120), minutes: num(r[1], 1, 2000, 90) };
      if (r[2]) movie.watched = true;
      if (Number.isInteger(r[3]) && r[3] >= 0 && r[3] < 200) movie.pin = r[3];
      return movie;
    });
    const [strategy, brk, budget, start, date, buffer] = p.s;
    const order = (Array.isArray(p.o) ? p.o : []).filter((i) => movies[i] && !Number.isInteger(movies[i].pin)).map((i) => movies[i].id);
    return {
      name: String(p.n || "Shared marathon").slice(0, 60),
      movies,
      order: order.length ? order : null,
      settings: {
        strategy: STRATEGIES.includes(strategy) ? strategy : "bestfit",
        brk: num(brk, 0, 180, 10),
        budget: Number.isFinite(+budget) && +budget > 0 && +budget <= 48 ? String(+budget) : "",
        start: /^\d\d:\d\d$/.test(start) ? start : "18:00",
        date: /^\d{4}-\d\d-\d\d$/.test(date) ? date : "",
        buffer: num(buffer, 0, 60, 0),
      },
    };
  }

  // items: [{ title, runtime, start, end }] with offsets in minutes from `start` (HH:MM).
  function toText({ name, items, total, start }) {
    const head = `🎬 ${name}\nStarts ${formatClock(start, 0)} · ends ${formatClock(start, total)} · ${formatDuration(total)} total\n`;
    return head + "\n" + items.map((it, i) =>
      `${i + 1}. ${it.title} (${formatDuration(it.runtime)}) — ${formatClock(start, it.start)} to ${formatClock(start, it.end)}`).join("\n");
  }

  const pad = (n) => String(n).padStart(2, "0");
  const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

  // Floating local times, so the events land at the same wall-clock time wherever you open them.
  function toICS({ name, items, date, start, now = new Date() }) {
    const [y, mo, d] = date.split("-").map(Number);
    const [h, mi] = start.split(":").map(Number);
    const at = (offset) => new Date(y, mo - 1, d, h, mi + offset);
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Movie Marathon//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`];
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    items.forEach((it, i) => {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${local(now)}-${i}-${Math.random().toString(36).slice(2, 8)}@moviemarathon`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${local(at(it.start))}`,
        `DTEND:${local(at(it.end))}`,
        `SUMMARY:${esc("🎬 " + it.title)}`,
        `DESCRIPTION:${esc(`${name} — movie ${i + 1} of ${items.length} (${formatDuration(it.runtime)})`)}`,
        "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  // Backup file: every marathon as a share code, so imports get the same validation as links.
  function exportAll(data) {
    return JSON.stringify({
      app: "movie-marathon", version: 1, exported: new Date().toISOString(),
      marathons: Object.values(data.lists).map((c) => encodePlan({ name: c.name, movies: c.movies, settings: c.settings, orderedIds: c.order || [] })),
    }, null, 2);
  }

  // Returns decoded plans; throws if the file isn't one of ours. Marathons that fail are skipped.
  function parseExport(text, newId) {
    if (text.length > 2_000_000) throw new Error("file too large");
    const f = JSON.parse(text);
    if (!f || f.app !== "movie-marathon" || !Array.isArray(f.marathons)) throw new Error("not a Movie Marathon backup");
    const plans = [];
    for (const code of f.marathons.slice(0, 100)) {
      try { plans.push(decodePlan(String(code), newId)); } catch {}
    }
    return plans;
  }

  return { encodePlan, decodePlan, toText, toICS, exportAll, parseExport };
});
