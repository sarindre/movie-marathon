// Copies ../web into ./www (minus downloads) so the installer isn't bundled into the app.
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, "..", "web"), dest = path.join(__dirname, "www");
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true, filter: (p) => !p.includes(path.sep + "downloads") });
