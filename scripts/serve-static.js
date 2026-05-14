const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number(process.argv[2] || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const rewrites = {
  "/premium": "/premium.html",
  "/privacidad": "/privacidad.html",
  "/terminos": "/terminos.html",
  "/success": "/success.html",
  "/cancel": "/cancel.html"
};

http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const route = rewrites[parsed.pathname] || parsed.pathname;
  const relative = route === "/" ? "/index.html" : route;
  const filePath = path.normalize(path.join(root, relative));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`InmoRadar web: http://127.0.0.1:${port}`);
});
