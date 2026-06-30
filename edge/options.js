const KEYS = {
  proxies: "proxies",
  activeId: "activeProxyId",
  enabled: "enabled",
  bypass: "bypassList"
};
const DEFAULT_BYPASS = ["localhost", "127.0.0.1", "<local>"];

const $ = (id) => document.getElementById(id);
let proxies = [];
let activeId = null;

async function init() {
  const data = await chrome.storage.local.get([KEYS.proxies, KEYS.activeId, KEYS.bypass]);
  proxies = data[KEYS.proxies] || [];
  activeId = data[KEYS.activeId] || null;
  $("bypassInput").value = (data[KEYS.bypass] || DEFAULT_BYPASS).join("\n");
  renderTable();
}

function uid() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function save() {
  await chrome.storage.local.set({ [KEYS.proxies]: proxies });
}

function renderTable() {
  const tbody = $("proxyTable");
  tbody.innerHTML = "";
  $("count").textContent = proxies.length;
  $("noProxies").classList.toggle("hidden", proxies.length > 0);

  proxies.forEach((p) => {
    const tr = document.createElement("tr");
    if (p.id === activeId) tr.className = "active-row";
    tr.innerHTML = `
      <td>${p.id === activeId ? "▶" : ""}</td>
      <td>${esc(p.name || "—")}</td>
      <td><span class="badge ${p.type}">${p.type}</span></td>
      <td>${esc(p.host)}:${esc(String(p.port))}</td>
      <td>${p.username ? "🔒 " + esc(p.username) : "—"}</td>
      <td class="actions-cell">
        <button class="btn small" data-act="use" data-id="${p.id}">Включить</button>
        <button class="btn small ghost" data-act="edit" data-id="${p.id}">✏</button>
        <button class="btn small danger" data-act="del" data-id="${p.id}">🗑</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => handleAction(b.dataset.act, b.dataset.id));
  });
}

async function handleAction(act, id) {
  if (act === "del") {
    proxies = proxies.filter((p) => p.id !== id);
    if (activeId === id) {
      activeId = null;
      await chrome.storage.local.set({ [KEYS.activeId]: null, [KEYS.enabled]: false });
    }
    await save();
    renderTable();
    toast("Прокси удалён");
  } else if (act === "edit") {
    const p = proxies.find((x) => x.id === id);
    if (!p) return;
    $("editId").value = p.id;
    $("name").value = p.name || "";
    $("type").value = p.type;
    $("host").value = p.host;
    $("port").value = p.port;
    $("username").value = p.username || "";
    $("password").value = p.password || "";
    $("cancelEdit").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (act === "use") {
    activeId = id;
    await chrome.storage.local.set({ [KEYS.activeId]: id, [KEYS.enabled]: true });
    renderTable();
    toast("Прокси включён для всего браузера");
  }
}

$("proxyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const editId = $("editId").value;
  const entry = {
    id: editId || uid(),
    name: $("name").value.trim(),
    type: $("type").value,
    host: $("host").value.trim(),
    port: Number($("port").value),
    username: $("username").value.trim(),
    password: $("password").value
  };
  if (!entry.host || !entry.port) return;

  if (editId) {
    proxies = proxies.map((p) => (p.id === editId ? entry : p));
    toast("Прокси обновлён");
  } else {
    proxies.push(entry);
    toast("Прокси добавлен");
  }
  await save();
  resetForm();
  renderTable();
});

$("cancelEdit").addEventListener("click", resetForm);

function resetForm() {
  $("proxyForm").reset();
  $("editId").value = "";
  $("cancelEdit").classList.add("hidden");
}

// Bulk import: type://user:pass@host:port  OR  host:port:user:pass  OR  host:port
$("bulkAdd").addEventListener("click", async () => {
  const lines = $("bulkInput").value.split("\n").map((l) => l.trim()).filter(Boolean);
  let added = 0;
  lines.forEach((line) => {
    const parsed = parseProxyLine(line);
    if (parsed) { proxies.push(parsed); added++; }
  });
  if (added) {
    await save();
    renderTable();
    $("bulkInput").value = "";
    toast(`Добавлено: ${added}`);
  } else {
    toast("Не удалось разобрать строки");
  }
});

function parseProxyLine(line) {
  let type = "http";
  let rest = line;
  const schemeMatch = line.match(/^(https?|socks5|socks4):\/\//i);
  if (schemeMatch) {
    type = schemeMatch[1].toLowerCase();
    rest = line.slice(schemeMatch[0].length);
  }
  let username = "", password = "";
  if (rest.includes("@")) {
    const [creds, hostPart] = rest.split("@");
    const cp = creds.split(":");
    username = cp[0] || "";
    password = cp[1] || "";
    rest = hostPart;
  }
  const parts = rest.split(":");
  if (parts.length < 2) return null;
  const host = parts[0];
  const port = Number(parts[1]);
  if (!host || !port) return null;
  // host:port:user:pass form
  if (!username && parts.length >= 4) {
    username = parts[2];
    password = parts[3];
  }
  return { id: uid(), name: "", type, host, port, username, password };
}

// Bypass list
$("saveBypass").addEventListener("click", async () => {
  const list = $("bypassInput").value.split("\n").map((l) => l.trim()).filter(Boolean);
  await chrome.storage.local.set({ [KEYS.bypass]: list.length ? list : DEFAULT_BYPASS });
  toast("Исключения сохранены");
});

// Export / Import JSON
$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(proxies, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "proxies.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const arr = JSON.parse(reader.result);
      if (!Array.isArray(arr)) throw new Error("bad");
      arr.forEach((p) => {
        proxies.push({
          id: uid(),
          name: p.name || "",
          type: p.type || "http",
          host: p.host,
          port: Number(p.port),
          username: p.username || "",
          password: p.password || ""
        });
      });
      await save();
      renderTable();
      toast("Импортировано из JSON");
    } catch {
      toast("Ошибка чтения файла");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

chrome.storage.onChanged.addListener(init);
init();
