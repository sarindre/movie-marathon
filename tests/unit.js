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

// seasonal theme by date
const T = require(web + "theme.js");
const dates = { "2026-01-10": "winter", "2026-02-10": "valentine", "2026-02-20": "winter", "2026-03-12": "stpatrick", "2026-03-18": "spring", "2026-07-02": "july4", "2026-07-05": "summer", "2026-09-15": "autumn", "2026-10-31": "halloween", "2026-11-10": "autumn", "2026-11-20": "thanksgiving", "2026-11-30": "thanksgiving", "2026-12-01": "christmas", "2026-12-25": "christmas" };
for (const [d, expected] of Object.entries(dates)) t("theme on " + d + " is " + expected, T.themeForDate(new Date(d + "T12:00:00")) === expected, T.themeForDate(new Date(d + "T12:00:00")));

// backup export / import
const store = { current: "a", lists: {
  a: { name: "One", movies: [{ id: "1", title: "A", minutes: 100 }, { id: "2", title: "B", minutes: 90, pin: 0, watched: true }], settings: { strategy: "shortest", brk: 5, budget: "3", start: "20:00", date: "", buffer: 5 }, order: ["1"], live: null },
  b: { name: "Two", movies: [], settings: St.defaults(), order: null, live: null },
} };
const backup = Sh.exportAll(store);
const plans = Sh.parseExport(backup);
t("backup round trip", plans.length === 2 && plans[0].name === "One" && plans[0].movies[1].pin === 0 && plans[0].movies[1].watched && plans[0].settings.budget === "3" && plans[0].order.length === 1 && plans[1].movies.length === 0);
t("backup marks the app", JSON.parse(backup).app === "movie-marathon");
for (const bad of ["nope", "{}", '{"app":"x","marathons":[]}', '{"app":"movie-marathon","marathons":"no"}']) {
  let threw2 = false; try { Sh.parseExport(bad); } catch { threw2 = true; }
  t("rejects " + bad.slice(0, 30), threw2);
}
t("skips broken entries but keeps good ones", Sh.parseExport(JSON.stringify({ app: "movie-marathon", marathons: ["!!bad!!", JSON.parse(backup).marathons[0]] })).length === 1);

// ---------- limits (bug fixes): a list can always be shared and backed up ----------
const many = (n) => Buffer.from(JSON.stringify({ v: 1, n: "big", m: Array.from({ length: n }, (_, i) => ["M" + i, 90, 0, -1]), s: ["bestfit", 10, "", "18:00", "", 0], o: [] })).toString("base64url");
t("200 movies still decode", Sh.decodePlan(many(200)).movies.length === 200);
let tooMany = false; try { Sh.decodePlan(many(201)); } catch { tooMany = true; }
t("201 movies are rejected", tooMany);
t("limits are exported", Sh.LIMITS.movies === 200 && Sh.LIMITS.marathons === 100);
const bigStore = { current: "m0", lists: {} };
for (let i = 0; i < 105; i++) bigStore.lists["m" + i] = { name: "L" + i, movies: [], settings: St.defaults(), order: null, live: null };
t("a backup restores at most 100 marathons", Sh.parseExport(Sh.exportAll(bigStore)).length === 100);

// ---------- finish by ----------
t("minutesUntil same evening", O.minutesUntil("18:00", "23:00") === 300);
t("minutesUntil past midnight", O.minutesUntil("20:00", "01:00") === 300);
t("minutesUntil equal or missing is ignored", O.minutesUntil("18:00", "18:00") === 0 && O.minutesUntil("18:00", "") === 0 && O.minutesUntil("", "20:00") === 0 && O.minutesUntil("18:00", "99") === 0);
t("finish by alone", JSON.stringify(O.budgetFor({ budgetHours: "", start: "18:00", finishBy: "23:00" })) === '{"minutes":300,"source":"finish"}');
t("time limit alone", JSON.stringify(O.budgetFor({ budgetHours: "2.5", start: "18:00", finishBy: "" })) === '{"minutes":150,"source":"limit"}');
t("the smaller limit wins (finish)", O.budgetFor({ budgetHours: "6", start: "18:00", finishBy: "23:00" }).source === "finish");
t("the smaller limit wins (limit)", O.budgetFor({ budgetHours: "3", start: "18:00", finishBy: "23:00" }).minutes === 180);
t("no limit at all", O.budgetFor({ budgetHours: "", start: "18:00", finishBy: "" }).minutes === 0);
const fb = O.budgetFor({ budgetHours: "", start: "18:00", finishBy: "23:00" }).minutes;
t("finish by plans like the same time limit", ids(O.buildPlan({ movies: M, strategy: "bestfit", breakMin: 10, budgetMin: fb })) === ids(O.buildPlan({ movies: M, strategy: "bestfit", breakMin: 10, budgetMin: 300 })));

// ---------- meal break ----------
const M3 = [mv("a", 90), mv("b", 90), mv("c", 90)];
const meal = { after: 2, min: 45 };
const mp = O.buildPlan({ movies: M3, strategy: "shortest", breakMin: 10, meal });
const msch = O.schedule(mp.ordered, 10, meal);
t("meal break: totals 5h25", mp.total === 325 && msch.total === 325, mp.total);
t("meal break: start times", msch.items.map((i) => i.start).join() === "0,100,235", msch.items.map((i) => i.start).join());
t("meal break: no meal means today's plan", O.buildPlan({ movies: M3, strategy: "shortest", breakMin: 10 }).total === 290 && O.schedule(mp.ordered, 10).total === 290);
const mb = O.buildPlan({ movies: M3, strategy: "bestfit", breakMin: 10, budgetMin: 300, meal });
t("meal break counts against a 5h limit", mb.ordered.length === 2 && mb.total <= 300 && !mb.overBudget, mb.total);
t("without the meal break all three fit 5h", O.buildPlan({ movies: M3, strategy: "bestfit", breakMin: 10, budgetMin: 300 }).ordered.length === 3);
t("meal break after the last movie doesn't exist", O.buildPlan({ movies: M3.slice(0, 2), strategy: "shortest", breakMin: 10, meal }).total === 190);
t("meal break never shorter than the usual break", O.schedule(mp.ordered, 60, { after: 1, min: 20 }).items[1].start === 150);
t("gapAfter", O.gapAfter(2, 10, meal) === 45 && O.gapAfter(1, 10, meal) === 10 && O.gapAfter(2, 10, null) === 10);
let badMeal = 0;
for (let i = 0; i < 400; i++) {
  const n = 2 + Math.floor(Math.random() * 6), ms = [];
  for (let j = 0; j < n; j++) ms.push(mv("m" + j, 60 + Math.floor(Math.random() * 120)));
  const mealR = { after: 1 + Math.floor(Math.random() * 3), min: 15 + Math.floor(Math.random() * 60) };
  for (const strategy of ["bestfit", "shortest", "longest", "balanced"]) {
    const b = 120 + Math.floor(Math.random() * 500);
    const pl = O.buildPlan({ movies: ms, strategy, breakMin: 10, budgetMin: b, buffer: 5, meal: mealR });
    if (pl.total > b) badMeal++;
    if (O.schedule(pl.ordered, 10, mealR).total !== pl.total) badMeal++;
    if (pl.ordered.length + pl.skipped.length !== ms.length) badMeal++;
  }
}
t("fuzz: meal break plans respect the budget", badMeal === 0, badMeal);

// ---------- series ----------
const sv = (id, minutes, series, seq) => ({ ...mv(id, minutes), ...(series ? { series, seq } : {}) });
const S = [sv("Aliens", 137, "Alien", 2), sv("Alien", 117, "Alien", 1), sv("Predator", 107)];
const serLongest = O.buildPlan({ movies: S, strategy: "longest" }).ordered.map((m) => m.id).join();
t("series: longest first keeps the series in order", serLongest === "Alien,Aliens,Predator", serLongest);
let serOk = true;
for (let i = 0; i < 40; i++) {
  const sh = O.buildPlan({ movies: S, strategy: "shortest", order: O.shuffle(S.filter((m) => m.id !== "Predator"), Math.random).map((m) => m.id) });
  const names = sh.ordered.map((m) => m.id);
  if (names.indexOf("Alien") > names.indexOf("Aliens")) serOk = false;
}
t("series: shuffled orders never put the sequel first", serOk);
t("series: names match ignoring case and spaces", ids(O.buildPlan({ movies: [sv("B", 100, " star ", 2), sv("A", 200, "STAR", 1)], strategy: "shortest" })) === "AB");
t("series: a series keeps the slots it was given", O.applySeries([sv("x", 1, "S", 2), mv("m", 5), sv("y", 1, "S", 1)]).map((m) => m.id).join("") === "ymx");
t("series: films without a number go last in their series", O.applySeries([sv("n", 1, "S", undefined), sv("two", 1, "S", 2)]).map((m) => m.id).join() === "two,n");
t("series: violations are reported", O.seriesViolations([sv("b", 1, "S", 2), sv("a", 1, "S", 1)]).join() === "b>a" && O.seriesViolations([sv("a", 1, "S", 1), sv("b", 1, "S", 2)]).length === 0);
const pinnedSeq = O.buildPlan({ movies: [{ ...sv("Aliens", 137, "Alien", 2), pin: 0 }, sv("Alien", 117, "Alien", 1), mv("P", 100)], strategy: "shortest" });
t("series: a pin wins and the plan says so", pinnedSeq.ordered[0].id === "Aliens" && pinnedSeq.seriesBroken === true);
t("series: normal plans are not flagged", O.buildPlan({ movies: S, strategy: "longest" }).seriesBroken === false);

// ---------- sharing the new settings and fields ----------
const newSettings = { strategy: "shortest", brk: 10, budget: "", start: "19:00", date: "2026-12-01", buffer: 0, finishBy: "23:30", mealAfter: 2, mealMin: 45 };
const newMovies = [{ id: "1", title: "Alien", minutes: 117, series: "Alien", seq: 1 }, { id: "2", title: "Heat", minutes: 170 }];
const dec2 = Sh.decodePlan(Sh.encodePlan({ name: "New", movies: newMovies, settings: newSettings, orderedIds: ["1", "2"] }));
t("share roundtrip: finish by and meal break", dec2.settings.finishBy === "23:30" && dec2.settings.mealAfter === 2 && dec2.settings.mealMin === 45, JSON.stringify(dec2.settings));
t("share roundtrip: series", dec2.movies[0].series === "Alien" && dec2.movies[0].seq === 1 && dec2.movies[1].series === undefined && dec2.movies[1].seq === undefined);
const oldLink = Buffer.from(JSON.stringify({ v: 1, n: "Old", m: [["A", 100, 0, -1], ["B", 90, 1, 0]], s: ["shortest", 10, "3", "20:00", "2026-12-01", 5], o: [0] })).toString("base64url");
const od = Sh.decodePlan(oldLink);
t("links made before these features still open", od.movies.length === 2 && od.settings.finishBy === "" && od.settings.mealAfter === 0 && od.settings.mealMin === 0 && od.movies[0].series === undefined && od.settings.budget === "3");
const hostile2 = Sh.decodePlan(Buffer.from(JSON.stringify({ v: 1, n: "x", m: [["A", 100, 0, -1, "<b>" + "s".repeat(200) + "</b>", 99999], ["B", 90, 0, -1, 42, "x"]], s: ["shortest", 10, "", "18:00", "", 0, "nope", -3, 99999] })).toString("base64url"));
t("hostile series and meal values are sanitised", hostile2.movies[0].series.length === 60 && hostile2.movies[0].seq === 999 && hostile2.movies[1].series === undefined && hostile2.settings.finishBy === "" && hostile2.settings.mealAfter === 0 && hostile2.settings.mealMin === 180, JSON.stringify(hostile2.settings));
t("backup keeps series and meal break", (() => {
  const b = Sh.parseExport(Sh.exportAll({ current: "a", lists: { a: { name: "N", movies: newMovies, settings: newSettings, order: null, live: null } } }))[0];
  return b.movies[0].series === "Alien" && b.settings.mealAfter === 2 && b.settings.finishBy === "23:30";
})());

// ---------- duplicate a marathon ----------
let n = 0; const nid = () => "id" + ++n;
const dup = { current: "a", lists: { a: { name: "Night", movies: [{ id: "1", title: "A", minutes: 100, watched: true, pin: 0, series: "S", seq: 1 }, { id: "2", title: "B", minutes: 90 }], settings: { ...St.defaults(), mealAfter: 1, mealMin: 30 }, order: ["2", "1"], live: { order: ["1"], i: 0, phase: "movie", t0: 1 } } } };
const did = St.duplicate(dup, "a", nid);
const cp = dup.lists[did];
t("duplicate: copies movies, settings and pins", cp.movies.length === 2 && cp.movies[0].pin === 0 && cp.movies[0].series === "S" && cp.settings.mealAfter === 1 && cp.name === "Night copy");
t("duplicate: new ids and the order points at them", cp.movies.every((m, i) => m.id !== dup.lists.a.movies[i].id) && cp.order.join() === cp.movies[1].id + "," + cp.movies[0].id);
t("duplicate: clears watched and live, switches to the copy", !cp.movies[0].watched && cp.live === null && dup.current === did && dup.lists.a.movies[0].watched === true);
t("duplicate: original untouched", dup.lists.a.order.join() === "2,1" && dup.lists.a.live !== null);
cp.movies[1].title = "changed";
t("duplicate: editing the copy leaves the original", dup.lists.a.movies[1].title === "B");
t("duplicate: names stay unique", dup.lists[St.duplicate(dup, "a", nid)].name === "Night copy 2");
t("duplicate: long names stay under 60 characters", (() => { const d = { current: "x", lists: { x: { name: "N".repeat(60), movies: [], settings: St.defaults(), order: null, live: null } } }; return d.lists[St.duplicate(d, "x", nid)].name.length <= 60; })());
t("duplicate: an empty marathon works", (() => { const d = { current: "x", lists: { x: { name: "E", movies: [], settings: St.defaults(), order: null, live: null } } }; return d.lists[St.duplicate(d, "x", nid)].movies.length === 0; })());
const old2 = { "marathon-data": JSON.stringify({ current: "a", lists: { a: { name: "Old", movies: [], settings: { strategy: "longest", brk: 5, budget: "", start: "18:00", date: "", buffer: 0 }, order: null, live: null } } }) };
const loaded = St.load({ getItem: (k) => old2[k] ?? null });
t("saved marathons from older versions get the new settings", loaded.lists.a.settings.finishBy === "" && loaded.lists.a.settings.mealAfter === 0 && loaded.lists.a.settings.strategy === "longest");

// ---------- paste a list ----------
const Bk = require(web + "bulk.js");
const pl = (x) => JSON.stringify(Bk.parseLine(x));
t("bulk: 1h57", pl("Alien 1h57") === '{"title":"Alien","minutes":117}', pl("Alien 1h57"));
t("bulk: 1h 57m", Bk.parseLine("Alien 1h 57m").minutes === 117);
t("bulk: comma then minutes", pl("Aliens, 137") === '{"title":"Aliens","minutes":137}');
t("bulk: minutes with a unit", Bk.parseLine("The Thing 109 min").minutes === 109 && Bk.parseLine("The Thing 109m").minutes === 109);
t("bulk: h:mm", Bk.parseLine("Heat - 2:50").minutes === 170 && Bk.parseLine("Cars (1:57)").minutes === 117);
t("bulk: hours only", Bk.parseLine("Big (2h)").minutes === 120);
t("bulk: no runtime", pl("Predator") === '{"title":"Predator","minutes":null}');
t("bulk: numbers inside titles are not runtimes", Bk.parseLine("Apollo 13").minutes === null && Bk.parseLine("Blade Runner 2049").minutes === null && Bk.parseLine("2001: A Space Odyssey").minutes === null && Bk.parseLine("Ocean's 11").minutes === null);
t("bulk: list markers are stripped", Bk.parseLine("1. Alien, 117").title === "Alien" && Bk.parseLine("- Alien, 117").title === "Alien" && Bk.parseLine("• Alien").title === "Alien");
t("bulk: a number alone is not a title", Bk.parseLine("117") !== null && Bk.parseLine("117").title === "117" && Bk.parseLine("   ") === null);
t("bulk: silly runtimes are ignored", Bk.parseLine("Epic, 99999").minutes === null && Bk.parseLine("X, 0").minutes === null);
t("bulk: long titles are cut to 120", Bk.parseLine("T".repeat(300)).title.length === 120);
const bl = Bk.parseList("Alien, 117\n\n  ALIEN, 90\nPredator\nPredator, 107\nHeat 2h50");
t("bulk: blank lines and repeated titles are dropped", bl.items.length === 3 && bl.duplicates === 2 && bl.items[0].minutes === 117 && bl.items[2].minutes === 170, JSON.stringify(bl));
t("bulk: a repeat that has a runtime fills in the one that doesn't", bl.items[1].title === "Predator" && bl.items[1].minutes === 107);
t("bulk: windows line endings", Bk.parseList("A, 90\r\nB, 80\r\n").items.length === 2);

// ---------- alerts setting (device-wide) ----------
const lsMem = {};
global.localStorage = { getItem: (k) => lsMem[k] ?? null, setItem: (k, v) => (lsMem[k] = v) };
t("alerts are off by default", T.alertsOn() === false);
lsMem["marathon-display"] = JSON.stringify({ mode: "light", size: "large" });
T.setAlerts(true);
t("alerts setting keeps the other display settings", T.alertsOn() === true && JSON.parse(lsMem["marathon-display"]).mode === "light" && JSON.parse(lsMem["marathon-display"]).size === "large");
delete global.localStorage;

console.log(fails ? fails + " FAILED" : "ALL PASSED");
