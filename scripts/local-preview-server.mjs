import http from "node:http";
import path from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import flopStatus from "../api/flop-status.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const rootReal = await realpath(root);
const mime = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"],
  [".svg", "image/svg+xml"], [".txt", "text/plain; charset=utf-8"], [".xml", "application/xml; charset=utf-8"]
]);

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  res.end(body);
}

function apiResponse(res) {
  return {
    setHeader(name, value) { res.setHeader(name, value); return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) {
      res.statusCode = this.statusCode || 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(value));
      return this;
    },
    send(value) { res.statusCode = this.statusCode || 200; res.end(value); return this; }
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/flop-status") {
    const apiRes = apiResponse(res);
    try { await flopStatus({ method: req.method, headers: req.headers }, apiRes); }
    catch { if (!res.headersSent) send(res, 500, JSON.stringify({ error: "Local status handler failed" })); }
    return;
  }
  if (url.pathname === "/api/relay") {
    return send(res, 503, JSON.stringify({ error: "Relay is disabled in the local preview; no external writes are allowed" }));
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    return send(res, 405, JSON.stringify({ error: "Read-only local preview" }));
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return send(res, 400, JSON.stringify({ error: "Invalid path" })); }
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/flop") pathname = "/flop.html";
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(`${root}${path.sep}`)) return send(res, 403, JSON.stringify({ error: "Path forbidden" }));
  try {
    const targetReal = await realpath(target);
    if (!targetReal.startsWith(`${rootReal}${path.sep}`)) return send(res, 403, JSON.stringify({ error: "Path forbidden" }));
    const body = await readFile(targetReal);
    res.writeHead(200, {
      "content-type": mime.get(path.extname(targetReal).toLowerCase()) || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    send(res, 404, JSON.stringify({ error: "Not found" }));
  }
});

const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
server.listen(port, host, () => console.log(`Read-only local preview: http://${host}:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
