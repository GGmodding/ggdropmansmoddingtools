const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../../..");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".md": "text/plain",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const file = path.join(root, p.replace(/^\/+/, ""));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("missing " + p);
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      });
      res.end(data);
    });
  })
  .listen(8765, () => {
    console.log("http://127.0.0.1:8765/tools/grounded-editor/editor.html");
  });
