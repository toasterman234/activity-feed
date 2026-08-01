const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const TOKENS_PATH = path.join(
  __dirname,
  "..",
  "dashboard",
  "themes",
  "tokens.json"
);
const GENERATOR = path.join(
  __dirname,
  "..",
  "dashboard",
  "themes",
  "generate-from-palette.ts"
);
const SHELL = path.join(__dirname, "shell.html");
const DASHBOARD = "http://127.0.0.1:3090";

// Load tokens
let tokens;
try {
  tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
} catch (e) {
  tokens = {};
  console.error("Cannot load tokens.json:", e.message);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  // API: serve all themes
  if (url.pathname === "/api/themes") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(tokens));
    return;
  }

  // API: generate a new theme
  if (url.pathname === "/api/generate-theme") {
    const neutral = url.searchParams.get("neutral") || "mauve";
    const accent = url.searchParams.get("accent") || "violet";
    const style = url.searchParams.get("style") || "comfortable";
    const id = url.searchParams.get("id") || `${neutral}-${accent}-${style}`;

    try {
      const result = execSync(
        `cd ${path.join(__dirname, "..", "dashboard")} && npx ts-node ${GENERATOR} ${neutral} ${accent} ${style} ${id}`,
        { timeout: 10000, encoding: "utf-8" }
      );
      const theme = JSON.parse(result);
      tokens[id] = theme;
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(theme));
    } catch (e) {
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({ error: e.message, stderr: e.stderr?.toString() })
      );
    }
    return;
  }

  // Dashboard proxy — path starts with /_next, /ops, etc.
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/ops") ||
    url.pathname.startsWith("/fleet") ||
    url.pathname === "/"
  ) {
    const opts = {
      hostname: "127.0.0.1",
      port: 3090,
      path: req.url,
      method: req.method,
      headers: { ...req.headers },
    };
    delete opts.headers.host;

    const proxyReq = http.request(opts, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on("error", () => {
      res.writeHead(502);
      res.end("Dashboard not available");
    });
    req.pipe(proxyReq);
    return;
  }

  // Default: serve shell.html
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(fs.readFileSync(SHELL, "utf-8"));
});

const PORT = 3333;
const HOST = "100.71.118.10";
server.listen(PORT, HOST, () => {
  console.log(`Theme lab shell: http://${HOST}:${PORT}`);
});
