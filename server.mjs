import { createReadStream, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".flac": "audio/flac",
};

function send(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/save-analysis") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        writeFileSync(join(root, "bgm-analysis.json"), body, "utf-8");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        console.log("Successfully saved bgm-analysis.json to workspace root!");
      } catch (err) {
        console.error("Failed to save bgm-analysis.json:", err);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  const rawPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const requestPath = rawPath === "/" ? "/index.html" : rawPath;
  const safePath = normalize(requestPath).replace(/^([/\\])+/, "");
  const filePath = resolve(join(root, safePath));

  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  try {
    if (!statSync(filePath).isFile()) {
      send(res, 404, "Not found");
      return;
    }
  } catch {
    send(res, 404, "Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": types[extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(res);
});

server.listen(port, "localhost", () => {
  console.log(`Preview: http://localhost:${port}/`);
});
