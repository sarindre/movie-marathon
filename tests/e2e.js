// End-to-end tests: drive the real page in a headless Electron window (see tests/run.js).
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const URL_ = process.env.BASE_URL || "http://localhost:8080/";
const OUT = process.env.OUT;   // set OUT=<folder> to also save screenshots
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, x === undefined ? "" : x); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 800, height: 1000, webPreferences: { backgroundThrottling: false } });
  const errors = [];
  win.webContents.on("console-message", (e, l, m) => { if (l >= 3) errors.push(m); if (m.startsWith("DBGAPP")) console.log(m); });
  win.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36");
  const js = (c) => win.webContents.executeJavaScript(c);
  const fresh = async (url = URL_) => { await win.loadURL(URL_); await js("localStorage.clear()"); await win.loadURL(url); };
  const q = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).innerText`);
  const count = (sel) => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const set = (id, v) => js(`(()=>{const e=document.getElementById('${id}');e.value=${JSON.stringify(String(v))};e.dispatchEvent(new Event('input'))})()`);
  const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const add = (t, h, m) => js(`(()=>{title.value=${JSON.stringify(t)};hours.value=${h};mins.value=${m};document.getElementById('add').requestSubmit()})()`);
  const order = () => js(`[...document.querySelectorAll('#result ol li .ptext')].map(l=>l.textContent.split(' (')[0]).join('')`);
  const shot = async (n) => { if (!OUT) return; await sleep(300); fs.writeFileSync(`${OUT}/ui-${n}.png`, (await win.webContents.capturePage()).toPNG()); };
  const seed = async () => { await add("A", 2, 0); await add("B", 1, 30); await add("C", 2, 30); await add("D", 1, 40); };

  // ---------- core planner ----------
  await fresh(); await seed();
  check("4 movies listed", (await count("#list li")) === 4);
  await set("strategy", "shortest"); check("shortest", (await order()) === "BDAC", await order());
  await set("strategy", "longest"); check("longest", (await order()) === "CADB", await order());
  await set("strategy", "balanced"); check("balanced", (await order()) === "CBAD", await order());
  check("total", /8h 10m total/.test(await q("#result h2")), await q("#result h2"));
  await set("budget", "5"); await set("strategy", "bestfit"); check("bestfit 5h picks A+C", (await order()) === "AC");
  check("didn't fit shown", /Didn't fit/.test(await q("#result .skipped")));
  await set("strategy", "shortest"); check("shortest 5h picks B+D", (await order()) === "BD");
  await set("budget", "0.5"); check("nothing fits", /Nothing fits/.test(await q("#result")));
  await set("budget", "");
  await win.loadURL(URL_); check("movies persist", (await count("#list li")) === 4);

  // ---------- 1. pin + drag + move ----------
  await set("strategy", "shortest");           // B D A C
  await click("#result ol li:nth-child(3) .pin"); // pin A in slot 2
  check("pin button toggles on", (await js("document.querySelector('#result ol li:nth-child(3) .pin').classList.contains('on')")) === true);
  let slotOk = true, changed = 0, prev = await order();
  for (let i = 0; i < 25; i++) { await click("#shuffle"); const o = await order(); if (o[2] !== "A") slotOk = false; if (o !== prev) changed++; prev = o; }
  check("pinned movie keeps slot 3 across 25 shuffles", slotOk);
  check("the others still shuffle", changed >= 20, changed + "/25");
  await set("strategy", "longest"); check("pin survives strategy change", (await order())[2] === "A", await order());
  await set("strategy", "shortest");
  await click("#result ol li:nth-child(3) .pin"); check("unpin", (await js("document.querySelector('#result ol li:nth-child(3) .pin').classList.contains('on')")) === false);
  await set("strategy", "longest"); await set("strategy", "shortest"); // reset to BDAC
  check("reset to BDAC", (await order()) === "BDAC", await order());
  await click("#result ol li:nth-child(1) .down"); check("▼ moves B later", (await order()) === "DBAC", await order());
  await click("#result ol li:nth-child(4) .up"); check("▲ moves C earlier", (await order()) === "DBCA", await order());
  check("first ▲ and last ▼ disabled", (await js("document.querySelector('#result ol li:first-child .up').disabled && document.querySelector('#result ol li:last-child .down').disabled")) === true);
  // simulated drag: item 4 (A) onto item 1
  await js(`(()=>{const lis=document.querySelectorAll('#result ol li');const dt=new DataTransfer();
    const f=(t,el)=>el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:dt}));
    f('dragstart',lis[3]); f('dragover',lis[0]); f('drop',lis[0]); f('dragend',lis[3]);})()`);
  check("drag A to the front", (await order()) === "ADBC", await order());
  await win.loadURL(URL_); check("manual order persists after reload", (await order()) === "ADBC", await order());
  await set("break", "15"); check("changing break resets manual order", (await order()) === "BDAC", await order());
  await set("break", "10");

  // ---------- 6. buffer ----------
  const base = await q("#result h2");
  await set("buffer", "10");
  check("extra-per-movie changes total", /8h 50m total/.test(await q("#result h2")) && /Includes 10 extra/.test(await q("#result")), await q("#result h2"));
  check("buffer extends each slot", /6:00 PM to 7:40 PM/.test(await q("#result ol li:first-child")), await q("#result ol li:first-child .ptext"));
  await set("buffer", "0");

  // ---------- 7. edit ----------
  await click("#list li:nth-child(2) .edit");
  await js("(()=>{const f=document.querySelector('.edit-form');f.querySelector('.e-title').value='B edited';f.querySelector('.e-h').value=3;f.querySelector('.e-m').value=0;f.requestSubmit()})()");
  check("edit saves title + time", /B edited — 3h 00m/.test(await q("#list")), (await q("#list li:nth-child(2)")));
  await click("#list li:nth-child(2) .edit"); await click(".e-cancel");
  check("cancel keeps it", /B edited — 3h 00m/.test(await q("#list")));
  await click("#list li:nth-child(2) .edit");
  await js("(()=>{const f=document.querySelector('.edit-form');f.querySelector('.e-title').value='B';f.querySelector('.e-h').value=1;f.querySelector('.e-m').value=30;f.requestSubmit()})()");

  // ---------- 9. watched ----------
  await js("document.querySelector('#list li:nth-child(1) .watched-box').click()");
  check("watched movie leaves the plan", (await order()) === "BDC", await order());
  check("reset-watched button appears", (await js("!document.getElementById('reset-watched').hidden")) === true);
  check("watched row struck through", await js("document.querySelector('#list li:nth-child(1) .mtitle').classList.contains('done')"));
  await click("#reset-watched"); check("reset watched brings it back", (await order()).includes("A"));

  // ---------- 8. saved marathons ----------
  const dlg = async (value, button) => { await sleep(300); if (value !== null) await js(`document.getElementById('dlg-input').value=${JSON.stringify(value)}`); await click(button); for (let i = 0; i < 40 && (await js("document.getElementById('dlg').open")); i++) await sleep(100); await sleep(1200); };
  check("delete disabled with one marathon", await js("document.getElementById('m-delete').disabled"));
  await click("#m-new"); await dlg("Horror night", "#dlg-ok");
  check("new marathon is empty + selected", (await count("#list li")) === 0 && (await js("marathon.selectedOptions[0].textContent")) === "Horror night");
  await add("Scream", 1, 51); check("movie added to new marathon", (await count("#list li")) === 1);
  await js("(()=>{const s=document.getElementById('marathon');s.selectedIndex=0;s.dispatchEvent(new Event('input'))})()");
  check("switching back restores first marathon", (await count("#list li")) === 4);
  check("settings are per marathon", (await js("document.getElementById('strategy').value")) === "shortest");
  await js("(()=>{const s=document.getElementById('marathon');s.selectedIndex=1;s.dispatchEvent(new Event('input'))})()");
  check("second marathon keeps its own settings", (await js("document.getElementById('strategy').value")) === "bestfit");
  await click("#m-rename"); await dlg("Scary night", "#dlg-ok");
  check("rename works", (await js("marathon.selectedOptions[0].textContent")) === "Scary night");
  await click("#m-new"); await dlg(null, "#dlg-cancel"); check("cancel creates nothing", (await js("marathon.options.length")) === 2);
  await win.loadURL(URL_); check("marathons persist", (await js("marathon.options.length")) === 2);
  await click("#m-delete"); await dlg(null, "#dlg-ok");
  check("delete removes it", (await js("marathon.options.length")) === 1 && /Scary/.test(await js("document.body.innerText")) === false);
  check("falls back to the other marathon", (await count("#list li")) === 4);

  // ---------- 2. share ----------
  await js("window.__copied=[];navigator.clipboard.writeText=(t)=>{window.__copied.push(t);return Promise.resolve()};0");
  await set("strategy", "shortest"); await click("#result ol li:nth-child(3) .pin"); // pin A
  await set("budget", ""); await click("#shuffle");
  const before = await order();
  await click("#copy-text");
  const txt = (await js("window.__copied[0]"));
  check("copy as text", /^🎬 My marathon\nStarts 6:00 PM/.test(txt) && /1\. \w/.test(txt) && txt.split("\n").length >= 7, "\n" + txt);
  await click("#copy-link");
  const link = await js("window.__copied[1]");
  check("copy link is a url with a share code", /^http:\/\/localhost:\d+\/#m=[\w-]+$/.test(link), link && link.slice(0, 70));
  const prevCount = await js("marathon.options.length");
  await win.loadURL(URL_ + "x"); await js("localStorage.clear()");   // pretend to be a different person
  await win.loadURL(link);
  check("opening a share link imports it", (await js("marathon.options.length")) === 1 && !(await js("document.getElementById('banner').hidden")), await q("#banner"));
  check("shared plan has the same order", (await order()) === before, before + " vs " + (await order()));
  check("pin came along", (await js("document.querySelectorAll('#result .pin.on').length")) === 1);
  check("url hash cleared after import", (await js("location.hash")) === "");
  await win.loadURL(URL_ + "?bad=1#m=this-is-garbage");
  check("bad link shows a friendly message", /couldn't be read/.test(await q("#banner")));

  // ---------- 3. calendar ----------
  await fresh(); await seed(); await set("strategy", "shortest"); await set("date", "2026-12-24"); await set("start", "19:30");
  await js("window.__blob=null;URL.createObjectURL=(b)=>{window.__blob=b;return 'blob:x'};HTMLAnchorElement.prototype.click=function(){window.__dl=this.download};0");
  await click("#ics");
  const ics = await js("window.__blob.text()");
  check("ics downloads with a name", /\.ics$/.test(await js("window.__dl")), await js("window.__dl"));
  check("ics has 4 events starting 7:30 PM on the chosen date", (ics.match(/BEGIN:VEVENT/g) || []).length === 4 && ics.includes("DTSTART:20241224T193000".replace("2024", "2026")), ics.split("\r\n").slice(5, 9).join(" | "));
  check("ics rolls past midnight", /DTSTART:20261225T/.test(ics));

  // ---------- 4. now playing ----------
  await fresh(); await add("Short", 0, 30); await add("Mid", 1, 0); await add("Long", 1, 30);
  await set("strategy", "shortest"); await set("break", "5");
  await click("#start-live");
  check("live view shown, plan hidden", !(await js("document.getElementById('live').hidden")) && (await js("document.getElementById('result').hidden")));
  check("shows first movie", (await q("#live-title")) === "Short" && /Now playing/.test(await q("#live-head")));
  check("countdown ~30:00", /^(29:5\d|30:00)$/.test(await q("#live-timer")), await q("#live-timer"));
  check("up next + end estimate", /Up next: Mid at about/.test(await q("#live-next")) && /Marathon ends about .* to go/.test(await q("#live-end")), (await q("#live-next")) + " / " + (await q("#live-end")));
  await shot("live");
  await win.loadURL(URL_); check("live survives reload", (await q("#live-title")) === "Short");
  await click("#live-done");
  check("break after Done", /Break time/.test(await q("#live-head")) && /^[45]:\d\d$/.test(await q("#live-timer")) && /Next: Mid/.test(await q("#live-title")), await q("#live-timer"));
  await click("#live-next-btn"); check("start next now", (await q("#live-title")) === "Mid");
  await click("#live-done"); await click("#live-next-btn");
  check("last movie hints", /last movie/.test(await q("#live-next")) && /finish/.test(await q("#live-done")));
  await click("#live-done");
  check("complete screen", /Marathon complete/.test(await q("#live-head")));
  check("summary lists what you watched", (await count("#live-summary li")) === 3 && /3 movies, 3h 00m of film/.test(await q("#live-sub")), await q("#live-sub"));
  await click("#live-close");
  check("closing returns to plan; all watched", !(await js("document.getElementById('live').hidden")) === false && /watched everything/.test(await q("#result")));
  check("watched marks were saved", (await count(".watched-box:checked")) === 3);
  await click("#reset-watched"); await click("#start-live"); await click("#live-stop");
  check("stop returns to plan", (await js("document.getElementById('live').hidden")) && (await count("#result ol li")) === 3);

  // ---------- 10. light mode + text size ----------
  const bg0 = await js("getComputedStyle(document.body).backgroundColor");
  await js("document.getElementById('display-menu').open=true");
  await set("mode", "light");
  check("light mode", (await js("document.documentElement.dataset.mode")) === "light" && (await js("getComputedStyle(document.body).backgroundColor")) === "rgb(246, 246, 248)", bg0);
  await set("textsize", "large");
  check("large text", (await js("getComputedStyle(document.documentElement).fontSize")) === "18.88px", await js("getComputedStyle(document.documentElement).fontSize"));
  await shot("light-large");
  await win.loadURL(URL_); check("display settings persist", (await js("document.documentElement.dataset.mode")) === "light");
  await js("document.getElementById('display-menu').open=true"); await set("mode", "dark"); await set("textsize", "normal");

  // ---------- 11. print ----------
  await fresh(); await seed(); await set("strategy", "shortest");
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { media: "print" });
  const disp = (sel) => js(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).display`);
  check("print hides the editing UI", (await disp("#list")) === "none" && (await disp("#options")) === "none" && (await disp("#topbar")) === "none" && (await disp("#actions")) === "none");
  check("print shows header + plan", (await disp("#print-head")) !== "none" && (await disp("#result ol")) !== "none" && /My marathon/.test(await q("#print-head")), await q("#print-head"));
  check("print is black on white", (await js("getComputedStyle(document.body).backgroundColor")) === "rgb(255, 255, 255)");
  await shot("print");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { media: "screen" });

  // ---------- HorrorHub link ----------
  await fresh();
  const hub = await js("(()=>{const a=document.querySelector('#site-footer a');return a&&{href:a.href,target:a.target,rel:a.rel,text:a.textContent,visible:a.getBoundingClientRect().height>0}})()");
  check("footer links to HorrorHub", hub && hub.href === "https://sarindre.itch.io/horrorhub" && hub.text === "HorrorHub" && hub.visible, JSON.stringify(hub));
  check("link opens in a new tab safely", hub && hub.target === "_blank" && /noopener/.test(hub.rel));
  check("footer is visible with no movies and with movies", (await js("document.getElementById('site-footer').getBoundingClientRect().height>0")) && (await seed(), await js("document.getElementById('site-footer').getBoundingClientRect().height>0")));

  // ---------- keyboard reordering ----------
  await fresh(); await seed(); await set("strategy", "shortest");   // B D A C
  const key = (idx, k, alt) => js(`document.querySelectorAll('#result ol li')[${idx}].dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)},altKey:${!!alt},bubbles:true,cancelable:true}))`);
  const focusedId = () => js("document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id");
  const idAt = (idx) => js(`document.querySelectorAll('#result ol li')[${idx}].dataset.id`);
  await js("document.querySelectorAll('#result ol li')[0].focus()");
  const bId = await idAt(0);
  await key(0, "ArrowDown", true);
  check("Alt+Down moves the row", (await order()) === "DBAC", await order());
  check("focus follows the moved row", (await focusedId()) === bId);
  await key(1, "ArrowUp", true);
  check("Alt+Up moves it back", (await order()) === "BDAC", await order());
  await key(0, "ArrowUp", true);
  check("Alt+Up at the top does nothing", (await order()) === "BDAC");
  await key(2, "p", false);
  check("P pins the focused row", (await count("#result .pin.on")) === 1 && (await js("document.querySelectorAll('#result ol li')[2].querySelector('.pin').classList.contains('on')")));
  check("rows are keyboard focusable", (await js("[...document.querySelectorAll('#result ol li')].every(l=>l.tabIndex===0)")) === true);
  await js("document.querySelector('#result ol li:nth-child(2) .down').click()");
  check("▼ button keeps focus on the same button", (await js("document.activeElement.className")) === "down" || (await js("document.activeElement.tagName")) === "LI");

  // ---------- backup: export and import ----------
  await fresh(); await seed(); await set("strategy", "shortest");
  await click("#result ol li:nth-child(3) .pin");
  await js("window.__blob=null;URL.createObjectURL=(b)=>{window.__blob=b;return 'blob:x'};HTMLAnchorElement.prototype.click=function(){window.__dl=this.download};0");
  await click("#m-new"); await dlg("Second list", "#dlg-ok"); await add("Solo", 1, 20);
  await click("#export-btn");
  const backup = await js("window.__blob.text()");
  const parsed = JSON.parse(backup);
  check("export file is named and marked", /^movie-marathons-\d{4}-\d\d-\d\d\.json$/.test(await js("window.__dl")) && parsed.app === "movie-marathon" && parsed.marathons.length === 2, await js("window.__dl"));
  await fresh();
  const importText = (text) => js(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(text)}],'b.json',{type:'application/json'}));const i=document.getElementById('import-file');i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  await importText(backup); await sleep(800);
  check("import adds both marathons", (await js("marathon.options.length")) === 3 && /Imported 2 marathons/.test(await q("#toast")), await q("#toast"));
  const names = await js("[...marathon.options].map(o=>o.textContent).join('|')");
  check("imported names kept", /My marathon/.test(names) && /Second list/.test(names), names);
  await js("(()=>{const s=document.getElementById('marathon');s.selectedIndex=1;s.dispatchEvent(new Event('input'))})()");
  check("imported marathon has its movies, pin and settings", (await count("#list li")) === 4 && (await count("#result .pin.on")) === 1 && (await js("document.getElementById('strategy').value")) === "shortest");
  await importText("this is not json"); await sleep(600);
  check("a bad file is rejected politely", /isn't a Movie Marathon backup/.test(await q("#toast")) && (await js("marathon.options.length")) === 3);
  await importText(JSON.stringify({ app: "something-else", marathons: [] })); await sleep(600);
  check("a foreign json file is rejected", /isn't a Movie Marathon backup/.test(await q("#toast")) && (await js("marathon.options.length")) === 3);

  // ---------- extra holiday themes ----------
  await js("document.getElementById('display-menu').open=true");
  check("12 theme choices (auto + 11)", (await js("document.getElementById('theme').options.length")) === 12);
  for (const t of ["stpatrick", "july4", "thanksgiving"]) { await set("theme", t); check("theme " + t, (await js("document.documentElement.dataset.theme")) === t); }
  await set("theme", "auto");

  // ---------- accessibility: every control has a name ----------
  await fresh(); await seed(); await set("strategy", "shortest");
  if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach("1.3");
  await js("document.getElementById('display-menu').open=true");
  const ax = await win.webContents.debugger.sendCommand("Accessibility.getFullAXTree");
  const unnamed = ax.nodes.filter((n) => !n.ignored && ["button", "textbox", "combobox", "checkbox", "spinbutton", "link", "searchbox", "slider"].includes(n.role && n.role.value) && !(n.name && n.name.value && n.name.value.trim()));
  check("all controls have accessible names", unnamed.length === 0, unnamed.map((n) => n.role.value + ":" + (n.backendDOMNodeId)).join(","));
  const names2 = ax.nodes.filter((n) => !n.ignored && n.role && n.role.value === "textbox").map((n) => n.name && n.name.value);
  check("movie title box is named", names2.includes("Movie title"), names2.join("|"));

  // ---------- lookup still fills in the runtime (live network) ----------
  await fresh();
  await set("title", "Inception");
  for (let n = 0; n < 30 && (await js("document.getElementById('suggestions').hidden")); n++) await sleep(300);
  if (!(await count("#suggestions button"))) {
    console.log("SKIP lookup checks (Wikidata unreachable: are you offline?)");
    console.log(fails ? fails + " FAILED" : "ALL PASSED");
    return app.exit(fails ? 1 : 0);
  }
  check("lookup suggestions appear", (await count("#suggestions button")) >= 1);
  check("lookup rows have no images", (await count("#suggestions img")) === 0);
  await click("#suggestions button");
  check("click fills 2h 28m", (await js("hours.value+':'+mins.value")) === "2:28");
  await js("document.getElementById('add').requestSubmit()");
  check("no images anywhere in list or plan", (await count("#list img, #result img, #live img")) === 0);
  check("saved movie has no poster field", !("poster" in (await js("JSON.parse(localStorage.getItem('marathon-data')).lists[Object.keys(JSON.parse(localStorage.getItem('marathon-data')).lists)[0]].movies[0]"))));

  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  app.exit(fails ? 1 : 0);
});
