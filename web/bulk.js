// Turns pasted text (one movie per line) into titles and, where the line gives one, a runtime.
// Accepted endings: "Alien 1h57", "Alien 1h 57m", "Alien (2h)", "Alien, 117", "Alien - 1:57", "Alien 117 min".
// A bare number only counts after a comma, dash, colon or bar, so "Apollo 13" stays a title.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Bulk = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_TITLE = 120, MAX_MINUTES = 2000;
  const MARKER = /^\s*(?:\d{1,3}[.)]\s+|[-*•]\s+)/;           // "1. ", "2) ", "- ", "• "
  const HOURS = /(?:^|[\s,\-–—:|(])\(?(\d{1,2})\s*h(?:ours?|rs?)?\s*(?:([0-5]?\d)\s*m?(?:in(?:ute)?s?)?)?\s*\)?$/i;
  const CLOCK = /(?:^|[\s,\-–—:|(])\(?(\d{1,2}):(\d{2})\)?$/;
  const UNIT = /(?:^|[\s,\-–—:|(])\(?(\d{1,4})\s*(?:m|mins?|minutes?)\)?$/i;
  const BARE = /[,\-–—:|]\s*\(?(\d{1,4})\)?$/;

  function parseLine(raw) {
    let line = String(raw).replace(MARKER, "").trim();
    if (!line) return null;
    let minutes = null, m;
    const take = (re, calc) => {
      if (minutes !== null || !(m = re.exec(line))) return;
      const mins = calc(m);
      if (mins >= 1 && mins <= MAX_MINUTES && line.slice(0, m.index).replace(/[\s,\-–—:|(]+$/, "").trim()) {
        minutes = mins;
        line = line.slice(0, m.index);
      }
    };
    take(HOURS, (x) => +x[1] * 60 + (+x[2] || 0));
    take(CLOCK, (x) => (+x[2] < 60 ? +x[1] * 60 + +x[2] : 0));
    take(UNIT, (x) => +x[1]);
    take(BARE, (x) => +x[1]);
    const title = line.replace(/[\s,\-–—:|(]+$/, "").trim().slice(0, MAX_TITLE);
    return title ? { title, minutes } : null;
  }

  // Returns { items: [{ title, minutes|null, line }], duplicates } with repeated titles removed.
  function parseList(text) {
    const items = [], seen = new Map();
    let duplicates = 0;
    for (const line of String(text).split(/\r?\n/)) {
      const it = parseLine(line);
      if (!it) continue;
      const key = it.title.toLowerCase();
      if (seen.has(key)) {
        duplicates++;
        const first = seen.get(key);
        if (first.minutes === null && it.minutes !== null) Object.assign(first, { minutes: it.minutes, line: line.trim() });   // keep the copy that has a runtime
        continue;
      }
      const item = { ...it, line: line.trim() };
      seen.set(key, item);
      items.push(item);
    }
    return { items, duplicates };
  }

  return { parseLine, parseList };
});
