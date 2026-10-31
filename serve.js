// Tiny static file server for the site in ./web. No dependencies.
//   node serve.js            -> http://localhost:8080
//   PORT=3000 node serve.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".exe": "application/octet-stream",
};

function createServer(root) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const file = path.normalize(path.join(root, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(file).pipe(res);
    });
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = +process.env.PORT || 8080;
  createServer(path.join(__dirname, "web")).listen(port, () => console.log(`Serving web/ at http://localhost:${port}`));
}
