// Мини-сервер на чистом Node.js (без зависимостей).
// Отдаёт страницу, которая показывает твой публичный IP и страну.
// Запуск:  npm start    (или node server.js)

const http = require("http");

const PORT = process.env.PORT || 3000;

const PAGE = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Проверка IP и страны</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a, #1e3a5f);
      color: #e2e8f0; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .card {
      background: #1e293b; border: 1px solid #334155; border-radius: 16px;
      padding: 32px; width: 100%; max-width: 420px; text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,.4);
    }
    h1 { font-size: 20px; margin-bottom: 6px; }
    .sub { color: #94a3b8; font-size: 13px; margin-bottom: 24px; }
    .flag { font-size: 56px; line-height: 1; margin: 8px 0; }
    .ip {
      font-size: 28px; font-weight: 700; color: #38bdf8;
      font-family: ui-monospace, "SF Mono", Menlo, monospace; word-break: break-all;
    }
    .label { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-top: 18px; }
    .country { font-size: 20px; font-weight: 600; margin-top: 4px; }
    .meta { color: #94a3b8; font-size: 13px; margin-top: 4px; }
    .btn {
      margin-top: 24px; cursor: pointer; border: none; padding: 11px 18px;
      border-radius: 10px; font-size: 14px; color: #fff; background: #3b82f6; width: 100%;
    }
    .btn:hover { opacity: .9; }
    .loading { color: #94a3b8; }
    .err { color: #f87171; font-size: 14px; }
    .source { margin-top: 14px; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🌍 Проверка IP</h1>
    <p class="sub">Через какой адрес и страну тебя видит интернет</p>

    <div id="content">
      <p class="loading">Определяю…</p>
    </div>

    <button class="btn" onclick="load()">🔄 Обновить</button>
    <p class="source" id="source"></p>
  </div>

  <script>
    // Несколько источников с фолбэком, чтобы работало надёжно.
    const SOURCES = [
      { url: "https://ipwho.is/", parse: d => ({ ip: d.ip, country: d.country, code: d.country_code, city: d.city, isp: d.connection && d.connection.isp }) },
      { url: "https://ipapi.co/json/", parse: d => ({ ip: d.ip, country: d.country_name, code: d.country_code, city: d.city, isp: d.org }) },
      { url: "http://ip-api.com/json/", parse: d => ({ ip: d.query, country: d.country, code: d.countryCode, city: d.city, isp: d.isp }) }
    ];

    function flagEmoji(code) {
      if (!code || code.length !== 2) return "🏳️";
      return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
    }

    async function load() {
      const content = document.getElementById("content");
      const source = document.getElementById("source");
      content.innerHTML = '<p class="loading">Определяю…</p>';
      source.textContent = "";

      for (const s of SOURCES) {
        try {
          const res = await fetch(s.url, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json();
          const info = s.parse(data);
          if (!info.ip) continue;
          render(info);
          source.textContent = "источник: " + new URL(s.url).host;
          return;
        } catch (e) { /* пробуем следующий источник */ }
      }
      content.innerHTML = '<p class="err">Не удалось определить IP. Проверь подключение/прокси и обнови.</p>';
    }

    function render(info) {
      document.getElementById("content").innerHTML = \`
        <div class="flag">\${flagEmoji(info.code)}</div>
        <div class="label">IP-адрес</div>
        <div class="ip">\${info.ip || "—"}</div>
        <div class="label">Страна</div>
        <div class="country">\${info.country || "—"} \${info.code ? "(" + info.code + ")" : ""}</div>
        \${info.city ? '<div class="meta">' + info.city + '</div>' : ""}
        \${info.isp ? '<div class="meta">' + info.isp + '</div>' : ""}
      \`;
    }

    load();
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

server.listen(PORT, () => {
  console.log("IP-тест запущен:  http://localhost:" + PORT);
  console.log("Останови сервер: Ctrl+C");
});
