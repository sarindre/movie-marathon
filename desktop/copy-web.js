// Copies ../web into ./web (minus downloads) so the packaged app is self-contained.
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, "..", "web"), dest = path.join(__dirname, "web");
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true, filter: (p) => !p.includes(path.sep + "downloads") });
console.log("copied web ->", dest);
