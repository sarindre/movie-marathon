const { app, BrowserWindow } = require("electron");
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
  win.loadFile(page);
});
app.on("window-all-closed", () => app.quit());
