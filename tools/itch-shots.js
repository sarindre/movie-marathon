// Run by tools/itch.js under Electron: loads the real page with sample movies and saves screenshots.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL;
const OUT = process.env.OUT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FILMS = [["Hocus Pocus", 1, 36], ["Halloween", 1, 31], ["Beetlejuice", 1, 32], ["Coco", 1, 45], ["Corpse Bride", 1, 17], ["Scream", 1, 51]];

// Each scene: window size, theme/mode, form settings, and a bit of page script to set the view up.
const SCENES = [
  { file: "cover-630x500.png", size: [630, 500], theme: "halloween", mode: "dark", strategy: "shortest", start: "19:00",
    after: `document.head.insertAdjacentHTML('beforeend','<style>#marathons,#add,#list-head,#list,#options,h1,#get-app,#site-footer,.hint.small{display:none!important}main{padding-top:.5rem}</style>')` },
  { file: "01-plan-halloween.png", size: [900, 1300], theme: "halloween", mode: "dark", strategy: "shortest", start: "19:00",
    after: `document.querySelector('#result ol li:nth-child(3) .pin').click()` },
  { file: "02-best-fit.png", size: [900, 800], theme: "halloween", mode: "dark", strategy: "bestfit", budget: "6", start: "19:00",
    after: `document.getElementById('result').scrollIntoView(); window.scrollBy(0,-70)` },
  { file: "03-now-playing.png", size: [900, 640], theme: "halloween", mode: "dark", strategy: "shortest", start: "19:00",
    after: `document.head.insertAdjacentHTML('beforeend','<style>#marathons,#add,#list-head,#list,#options,h1{display:none!important}</style>'); document.getElementById('start-live').click()` },
  { file: "04-light-christmas.png", size: [900, 1000], theme: "christmas", mode: "light", strategy: "balanced", start: "18:30" },
  { file: "05-settings-valentine.png", size: [900, 700], theme: "valentine", mode: "dark", strategy: "longest", start: "20:00",
    after: `document.getElementById('display-menu').open = true` },
];

// One window for every scene: creating a second window after destroying the first fails in Electron.
async function shoot(win, scene) {
  const [w, h] = scene.size;
  win.setContentSize(w, h);
  const js = (c) => win.webContents.executeJavaScript(c);
  await win.loadURL(BASE);
  await js(`localStorage.clear(); localStorage.setItem('marathon-theme', ${JSON.stringify(scene.theme)});
    localStorage.setItem('marathon-display', JSON.stringify({ mode: ${JSON.stringify(scene.mode)}, size: 'normal' }))`);
  await win.loadURL(BASE);
  await js(`(() => { for (const [t, h, m] of ${JSON.stringify(FILMS)}) { title.value = t; hours.value = h; mins.value = m; document.getElementById('add').requestSubmit(); }
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
    set('strategy', ${JSON.stringify(scene.strategy)}); set('start', ${JSON.stringify(scene.start)}); ${scene.budget ? `set('budget', ${JSON.stringify(scene.budget)});` : ""} })()`);
  await sleep(200);
  if (scene.after) await js(`(() => { ${scene.after} })()`);
  // A hidden window can hand back a stale frame: wait for two paints and ask for a fresh one.
  await js("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  win.webContents.invalidate();
  await sleep(1200);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, scene.file), img.toPNG());
  console.log("wrote", scene.file, `${img.getSize().width}x${img.getSize().height}`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 900, height: 1000, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  for (const scene of SCENES) await shoot(win, scene);
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
