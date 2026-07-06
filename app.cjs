const fs = require("node:fs");
const path = require("node:path");

const pages = new Map([
  ["/", "index.html"],
  ["/workspace", "workspace.html"],
  ["/pricing", "pricing.html"],
  ["/signin", "signin.html"],
  ["/signup", "signup.html"],
]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function findPublicFile(requestUrl) {
  const url = new URL(requestUrl, "https://spyda.local");
  const pathname = decodeURIComponent(url.pathname);
  const mappedPage = pages.get(pathname);
  const relativePath = mappedPage || pathname.replace(/^\/+/, "");
  const rootCandidates = ["dist", "."];

  for (const root of rootCandidates) {
    const candidate = path.resolve(__dirname, root, relativePath || "index.html");
    const base = path.resolve(__dirname, root);

    if (!candidate.startsWith(base)) continue;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  return null;
}

module.exports = function handler(request, response) {
  const filePath = findPublicFile(request.url || "/");

  if (!filePath) {
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Spyda page not found.");
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
  response.end(fs.readFileSync(filePath));
};
