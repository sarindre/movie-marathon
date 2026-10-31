// End-to-end tests: drive the real page in a headless Electron window (see tests/run.js).
const { app, BrowserWindow } = require("electron");
const path = require("path");
let fails = 0;
const check = (n, ok, x = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, x); };
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  const errors = [];
  win.webContents.on("console-message", (e, l, m) => { if (l >= 3) errors.push(m); });
  const page = path.join(__dirname, "..", "web", "index.html");
  const js = (c) => win.webContents.executeJavaScript(c);
  await win.loadFile(page); await js("localStorage.clear()"); await win.loadFile(page);
  await js("(()=>{title.value='A';hours.value=1;mins.value=30;document.getElementById('add').requestSubmit();title.value='B';hours.value=2;mins.value=0;document.getElementById('add').requestSubmit()})()");
  check("plan renders from file://", (await js("document.querySelectorAll('#result ol li').length")) === 2);
  check("share-link button hidden in the desktop app", (await js("!document.getElementById('copy-link')")) === true);
  check("copy-as-text, calendar, print still offered", (await js("['copy-text','ics','print','shuffle','start-live'].every(i=>!!document.getElementById(i))")) === true);
  check("install section hidden in the app", (await js("document.getElementById('get-app').hidden")) === true);
  await js("document.getElementById('start-live').click()");
  check("now-playing works", /Now playing/.test(await js("document.getElementById('live-head').innerText")));
  check("no console errors", errors.length === 0, errors.join("|"));
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  app.exit(fails ? 1 : 0);
});
