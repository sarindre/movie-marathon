// Unit tests for the pure logic: planning, pins, share links, calendar export, saved marathons.
const web = require("path").join(__dirname, "..", "web") + "/";
const O = require(web + "ordering.js"), Sh = require(web + "share.js"), St = require(web + "store.js");
let fails = 0;
const t = (n, ok, x = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, x); };
const mv = (id, minutes, pin) => ({ id, title: id, minutes, ...(pin !== undefined ? { pin } : {}) });
const M = [mv("A", 120), mv("B", 90), mv("C", 150), mv("D", 100)];
const ids = (p) => p.ordered.map((m) => m.id).join("");

t("plain shortest", ids(O.buildPlan({ movies: M, strategy: "shortest" })) === "BDAC");
t("bestfit 5h", ids(O.buildPlan({ movies: M, strategy: "bestfit", breakMin: 10, budgetMin: 300 })) === "AC");
t("custom order", ids(O.buildPlan({ movies: M, strategy: "shortest", order: ["C", "A"] })) === "CABD");
t("pin keeps its slot", ids(O.buildPlan({ movies: [mv("A", 120, 0), ...M.slice(1)], strategy: "shortest" })) === "ABDC");
t("pin last", ids(O.buildPlan({ movies: [mv("B", 90, 3), M[0], M[2], M[3]], strategy: "shortest" })) === "DACB");
const p = O.buildPlan({ movies: [mv("A", 120, 0), ...M.slice(1)], strategy: "shortest", breakMin: 10, budgetMin: 300 });
t("pinned counts against budget", ids(p) === "AB" && p.total <= 300, ids(p) + " " + p.total);
t("pinned over budget flagged", O.buildPlan({ movies: [mv("C", 150, 0)], strategy: "shortest", breakMin: 10, budgetMin: 60 }).overBudget === true);
const q = O.buildPlan({ movies: M, strategy: "shortest", buffer: 10 });
t("buffer adds time", q.total === 460 + 40 && q.ordered[0].runtime === 90, q.total);

let bad = 0;
for (let i = 0; i < 400; i++) {
  const n = 2 + Math.floor(Math.random() * 5), ms = [];
  for (let j = 0; j < n; j++) ms.push(mv("m" + j, 60 + Math.floor(Math.random() * 120), Math.random() < 0.2 ? Math.floor(Math.random() * n) : undefined));
  for (const strategy of ["bestfit", "shortest", "longest", "balanced"]) {
    const b = 120 + Math.floor(Math.random() * 400);
    const pl = O.buildPlan({ movies: ms, strategy, breakMin: 10, budgetMin: b, buffer: 5 });
    const hasPins = ms.some((m) => m.pin !== undefined);
    if (pl.total > b && !hasPins) bad++;
    if (pl.total > b && hasPins && !pl.overBudget) bad++;
    if (pl.ordered.length + pl.skipped.length !== ms.length) bad++;
    if (new Set([...pl.ordered, ...pl.skipped].map((m) => m.id)).size !== ms.length) bad++;
  }
}
t("fuzz: budget respected, nothing lost or duplicated", bad === 0, bad);

const movies = [{ id: "1", title: 'Ünïcode, "Q" & <b>', minutes: 100 }, { id: "2", title: "B", minutes: 90, watched: true, pin: 1 }, { id: "3", title: "C", minutes: 80 }];
const settings = { strategy: "longest", brk: 15, budget: "4.5", start: "19:30", date: "2026-12-24", buffer: 5 };
const enc = Sh.encodePlan({ name: "Xmas ✨", movies, settings, orderedIds: ["3", "2", "1"] });
const dec = Sh.decodePlan(enc);
t("share roundtrip", dec.name === "Xmas ✨" && dec.movies[0].title === movies[0].title && dec.movies[1].watched && dec.movies[1].pin === 1 && dec.settings.strategy === "longest" && dec.settings.budget === "4.5" && dec.order.length === 2, JSON.stringify(dec.settings));
t("share link short and url-safe", enc.length < 300 && /^[A-Za-z0-9_-]+$/.test(enc), enc.length);
const evil = Buffer.from(JSON.stringify({ v: 1, n: "x".repeat(500), m: [["t", 99999, 0, -1], ["<img src=x onerror=alert(1)>", -5, 1, 9999]], s: ["nope", -5, "abc", "zz", "never", 999], o: [5, 0] })).toString("base64url");
const d2 = Sh.decodePlan(evil);
t("hostile link is sanitised", d2.name.length === 60 && d2.movies[0].minutes === 2000 && d2.movies[1].minutes === 1 && d2.settings.strategy === "bestfit" && d2.settings.brk === 0 && d2.settings.budget === "" && d2.settings.start === "18:00" && d2.settings.date === "" && d2.settings.buffer === 60 && d2.movies[1].pin === undefined, JSON.stringify(d2.settings));
let threw = false; try { Sh.decodePlan("garbage!!"); } catch { threw = true; }
t("garbage link throws", threw);

const items = [{ title: "A", runtime: 120, start: 0, end: 120 }, { title: 'B, the "sequel"; part 2', runtime: 90, start: 130, end: 220 }];
const txt = Sh.toText({ name: "Night", items, total: 220, start: "23:00" });
t("text export", txt.includes("1. A (2h 00m) — 11:00 PM to 1:00 AM") && txt.includes("ends 2:40 AM"), "\n" + txt);
const ics = Sh.toICS({ name: "Night", items, date: "2026-10-31", start: "23:00", now: new Date("2026-10-30T12:00:00Z") });
t("ics events + midnight rollover", ics.includes("DTSTART:20261031T230000") && ics.includes("DTEND:20261101T010000") && ics.includes("DTSTART:20261101T011000") && ics.split("BEGIN:VEVENT").length === 3 && ics.includes('SUMMARY:🎬 B\\, the "sequel"\\; part 2') && ics.endsWith("END:VCALENDAR\r\n"));

const mem = {}, stg = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v) };
mem.marathon = JSON.stringify([{ id: 1, title: "Old", minutes: 100 }]);
const d = St.load(stg);
t("migrates the old single list", d.lists[d.current].movies[0].title === "Old");
St.save(d, stg);
t("saves and loads", St.load(stg).current === d.current);
St.create(d, "Two");
t("create switches", d.lists[d.current].name === "Two" && Object.keys(d.lists).length === 2);
St.remove(d, d.current);
t("delete falls back", Object.keys(d.lists).length === 1 && d.lists[d.current]);
St.remove(d, d.current);
t("deleting the last makes a fresh one", Object.keys(d.lists).length === 1 && d.lists[d.current].movies.length === 0);
t("unique names", St.uniqueName(d, "My marathon") === "My marathon 2");
console.log(fails ? fails + " FAILED" : "ALL PASSED");
