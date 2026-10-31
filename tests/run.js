// `npm test`: unit tests, then the browser tests against a throwaway local server.
// The browser tests need the desktop dependencies (`npm run setup`) and use Electron as the browser.
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { createServer } = require("../serve.js");

const root = path.join(__dirname, "..");
const only = process.argv[2]; // "unit" to skip the browser tests
let failed = false;

// Async on purpose: the test server lives in this process and must keep answering requests.
function run(label, cmd, args, env = {}) {
  console.log(`\n=== ${label} ===`);
  const clean = { ...process.env, ...env };
  delete clean.ELECTRON_RUN_AS_NODE; // some editors set this, which stops Electron opening a window
  return new Promise((resolve) => {
    spawn(cmd, args, { stdio: "inherit", env: clean }).on("exit", (code) => { if (code !== 0) failed = true; resolve(); });
  });
}

(async () => {
  await run("unit tests", process.execPath, [path.join(__dirname, "unit.js")]);

  if (only !== "unit") {
    const electron = path.join(root, "desktop", "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
    if (!fs.existsSync(electron)) {
      console.error("\nElectron isn't installed, so the browser tests can't run. Run `npm run setup` first.");
      process.exit(1);
    }
    const server = createServer(path.join(root, "web"));
    await new Promise((r) => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    await run("browser tests (needs internet for the title lookup checks)", electron, [path.join(__dirname, "e2e.js")], { BASE_URL: base });
    await run("desktop-mode tests (file://, no server)", electron, [path.join(__dirname, "file-mode.js")]);
    server.close();
  }

  console.log(failed ? "\nSOME TESTS FAILED" : "\nALL TEST SUITES PASSED");
  process.exit(failed ? 1 : 0);
})();
