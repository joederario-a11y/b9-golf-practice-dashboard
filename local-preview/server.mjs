import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "local-preview", "dist");
const publicDir = join(root, "public");
const port = Number(process.env.PORT ?? 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function safeFilePath(baseDir, pathname) {
  const cleanPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  return join(baseDir, cleanPath);
}

function serveFile(res, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  res.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
  return true;
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const pathname = url.pathname;

  if (pathname === "/api/sessions") {
    sendJson(res, { mode: "guest", sessions: [] });
    return;
  }

  if (pathname === "/api/account") {
    sendJson(res, { devAuthEnabled: false, mode: "guest", user: null });
    return;
  }

  if (pathname === "/api/profile") {
    sendJson(res, { mode: "guest", profile: null });
    return;
  }

  if (pathname === "/api/videos") {
    sendJson(res, { mode: "guest", videos: [] });
    return;
  }

  if (serveFile(res, safeFilePath(distDir, pathname === "/" ? "/index.html" : pathname))) return;
  if (serveFile(res, safeFilePath(publicDir, pathname))) return;
  serveFile(res, join(distDir, "index.html"));
}).listen(port, "0.0.0.0", () => {
  console.log(`Local preview ready at http://localhost:${port}/`);
});
