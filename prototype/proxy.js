const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const DASHBOARD_PORT = 3090;
const PROXY_PORT = 3333;

// Load all themes from our tokens.json
const tokens = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "dashboard", "themes", "tokens.json"),
    "utf-8"
  )
);

const INJECT = `
<script>
(function() {
  // Theme picker — floats bottom-right, cycles through all themes
  const ALL_THEMES = ${JSON.stringify(tokens)};

  // Don't inject if already present
  if (document.getElementById('__theme_prototype_picker')) return;

  // Build the picker UI
  const style = document.createElement('style');
  style.textContent = \`
    #__theme_prototype_picker {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 99999;
      background: var(--elev-raised, #18181b);
      border: 1px solid var(--border, #27272a);
      border-radius: 12px;
      padding: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: var(--fg, #f4f4f5);
      min-width: 220px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      user-select: none;
      -webkit-user-select: none;
    }
    #__theme_prototype_picker select {
      width: 100%;
      padding: 6px 8px;
      border-radius: 6px;
      background: var(--bg, #09090b);
      color: var(--fg, #f4f4f5);
      border: 1px solid var(--border, #27272a);
      font-size: 13px;
      margin-top: 4px;
      -webkit-appearance: none;
      appearance: none;
    }
    #__theme_prototype_picker label {
      display: block;
      font-size: 11px;
      opacity: 0.6;
      margin-top: 8px;
    }
    #__theme_prototype_picker label:first-of-type {
      margin-top: 0;
    }
    #__theme_prototype_picker .tt-header {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
    }
    #__theme_prototype_picker .tt-current {
      font-size: 11px;
      opacity: 0.5;
      margin-top: 4px;
    }
  \`;

  document.head.appendChild(style);

  const picker = document.createElement('div');
  picker.id = '__theme_prototype_picker';

  const names = Object.keys(ALL_THEMES);
  const current = document.documentElement.getAttribute('data-theme') || 'default';

  picker.innerHTML = \`
    <div class="tt-header">🎨 Theme Lab</div>
    <label>Theme
      <select id="__theme_select">
        \${names.map(n => \`<option value="\${n}" \${n === current ? 'selected' : ''}>\${n}</option>\`).join('')}
      </select>
    </label>
    <div class="tt-current" id="__theme_mode_label">mode: light</div>
  \`;

  // Also add a light/dark toggle
  const modeLabel = document.createElement('label');
  modeLabel.textContent = 'Mode';
  const modeSelect = document.createElement('select');
  modeSelect.id = '__theme_mode_select';
  modeSelect.innerHTML = '<option value="light">Light</option><option value="dark">Dark</option>';
  picker.appendChild(modeLabel);
  picker.appendChild(modeSelect);

  document.body.appendChild(picker);

  // Apply theme function
  function applyTheme(themeId, mode) {
    const theme = ALL_THEMES[themeId];
    if (!theme) return;
    const vars = theme[mode];
    if (!vars) return;

    const root = document.documentElement;
    // Remove old data-theme to avoid conflicts
    root.removeAttribute('data-theme');

    // Apply every CSS variable from the theme
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    document.getElementById('__theme_mode_label').textContent = 'mode: ' + mode;
  }

  // Detect current mode from existing CSS
  let currentMode = 'light';
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bgColor && !bgColor.includes('255, 255, 255') && !bgColor.includes('#fff') && !bgColor.includes('#fcf')) {
    // Rough heuristic for dark
    currentMode = 'dark';
  }
  modeSelect.value = currentMode;

  // Handlers
  document.getElementById('__theme_select').addEventListener('change', function(e) {
    applyTheme(e.target.value, modeSelect.value);
  });

  modeSelect.addEventListener('change', function(e) {
    applyTheme(document.getElementById('__theme_select').value, e.target.value);
  });

  // Apply initial theme immediately
  applyTheme(current, currentMode);
})();
</script>
`;

const server = http.createServer((req, res) => {
  const opts = {
    hostname: "127.0.0.1",
    port: DASHBOARD_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers },
  };

  // Don't forward host header from the proxy
  delete opts.headers.host;

  const proxyReq = http.request(opts, (proxyRes) => {
    const ct = proxyRes.headers["content-type"] || "";

    // Only inject into HTML pages
    if (ct.includes("text/html")) {
      let body = "";
      proxyRes.setEncoding("utf8");
      proxyRes.on("data", (chunk) => (body += chunk));
      proxyRes.on("end", () => {
        // Inject before </head>
        body = body.replace("</head>", INJECT + "</head>");

        const headers = { ...proxyRes.headers };
        headers["content-length"] = Buffer.byteLength(body);
        delete headers["transfer-encoding"];

        res.writeHead(proxyRes.statusCode, headers);
        res.end(body);
      });
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502);
    res.end("Dashboard dev server not running on port " + DASHBOARD_PORT);
  });

  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, "127.0.0.1", () => {
  console.log(
    `Theme prototype proxy on http://127.0.0.1:${PROXY_PORT} → dashboard:${DASHBOARD_PORT}`
  );
});
