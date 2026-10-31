// `npm run itch`: builds everything needed for the itch.io page into ./itch
//   itch/movie-marathon-html.zip   the browser build (upload as "played in the browser")
//   itch/screenshots/*.png         cover image + screenshots
// Needs `npm run setup` first (uses the zip tool and Electron from desktop/node_modules).
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createServer } = require("../serve.js");

const root = path.join(__dirname, "..");
const out = path.join(root, "itch");
const shots = path.join(out, "screenshots");
const zipPath = path.join(out, "movie-marathon-html.zip");

function zipSite() {
  const { path7za } = require(path.join(root, "desktop", "node_modules", "7zip-bin"));
  // Copy web/ without downloads/ so index.html sits at the top level of the zip, as itch.io requires.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "marathon-itch-"));
  fs.cpSync(path.join(root, "web"), tmp, { recursive: true, filter: (p) => !p.includes(path.sep + "downloads") });
  fs.rmSync(zipPath, { force: true });
  const r = spawnSync(path7za, ["a", "-tzip", "-mx=9", zipPath, "*"], { cwd: tmp, encoding: "utf8" });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) throw new Error("zip failed:\n" + r.stdout + r.stderr);
  const size = fs.statSync(zipPath).size;
  console.log(`zip: ${path.relative(root, zipPath)} (${(size / 1024).toFixed(0)} KB)`);
}

async function takeScreenshots() {
  const electron = path.join(root, "desktop", "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const server = createServer(path.join(root, "web"));
  await new Promise((r) => server.listen(0, r));
  const env = { ...process.env, BASE_URL: `http://localhost:${server.address().port}/`, OUT: shots };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) =>
    spawn(electron, [path.join(__dirname, "itch-shots.js")], { stdio: "inherit", env }).on("exit", (c) => (c === 0 ? resolve() : reject(new Error("screenshots failed")))));
  server.close();
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  zipSite();
  await takeScreenshots();
  console.log("done. Files are in", path.relative(root, out));
})().catch((e) => { console.error(e.message); process.exit(1); });
