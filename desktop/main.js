const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// Packaged builds carry their own copy of the site; in development use ../web.
const bundled = path.join(__dirname, "web", "index.html");
const page = fs.existsSync(bundled) ? bundled : path.join(__dirname, "..", "web", "index.html");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 760, height: 820, autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
  });
  // External links (like HorrorHub) open in the default browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.loadFile(page);
});
app.on("window-all-closed", () => app.quit());
