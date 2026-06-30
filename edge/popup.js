const KEYS = {
  proxies: "proxies",
  activeId: "activeProxyId",
  enabled: "enabled"
};

const els = {
  toggle: document.getElementById("masterToggle"),
  dot: document.getElementById("statusDot"),
  list: document.getElementById("proxyList"),
  search: document.getElementById("search"),
  empty: document.getElementById("empty"),
  openOptions: document.getElementById("openOptions"),
  activeInfo: document.getElementById("activeInfo")
};

let state = { proxies: [], activeId: null, enabled: false };

async function load() {
  const data = await chrome.storage.local.get([KEYS.proxies, KEYS.activeId, KEYS.enabled]);
  state.proxies = data[KEYS.proxies] || [];
  state.activeId = data[KEYS.activeId] || null;
  state.enabled = !!data[KEYS.enabled];
  render();
}

function render() {
  els.toggle.checked = state.enabled;
  els.dot.classList.toggle("on", state.enabled && !!state.activeId);

  const term = els.search.value.trim().toLowerCase();
  const filtered = state.proxies.filter((p) => {
    if (!term) return true;
    return (
      (p.name || "").toLowerCase().includes(term) ||
      (p.host || "").toLowerCase().includes(term) ||
      String(p.port).includes(term)
    );
  });

  els.list.innerHTML = "";
  els.empty.classList.toggle("hidden", state.proxies.length > 0);

  filtered.forEach((p) => {
    const li = document.createElement("li");
    li.className = "item" + (p.id === state.activeId ? " active" : "");
    li.innerHTML = `
      <span class="badge ${p.type}">${p.type}</span>
      <div class="meta">
        <div class="name">${escapeHtml(p.name || p.host)}</div>
        <div class="sub">${escapeHtml(p.host)}:${escapeHtml(String(p.port))}${p.username ? " 🔒" : ""}</div>
      </div>
      ${p.id === state.activeId ? '<span class="check">✓</span>' : ""}
    `;
    li.addEventListener("click", () => selectProxy(p.id));
    els.list.appendChild(li);
  });

  const active = state.proxies.find((p) => p.id === state.activeId);
  els.activeInfo.textContent = active
    ? (state.enabled ? `▶ ${active.name || active.host}` : "выключено")
    : "не выбрано";
}

async function selectProxy(id) {
  state.activeId = id;
  // selecting a proxy auto-enables it
  state.enabled = true;
  await chrome.storage.local.set({
    [KEYS.activeId]: id,
    [KEYS.enabled]: true
  });
  render();
}

els.toggle.addEventListener("change", async () => {
  state.enabled = els.toggle.checked;
  await chrome.storage.local.set({ [KEYS.enabled]: state.enabled });
  render();
});

els.search.addEventListener("input", render);

els.openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Pick a random proxy and enable it
document.getElementById("randomProxy").addEventListener("click", async () => {
  if (!state.proxies.length) return;
  const candidates = state.proxies.filter((p) => p.id !== state.activeId);
  const pool = candidates.length ? candidates : state.proxies;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  await selectProxy(pick.id);
});

// Open an IP check page in a new tab
document.getElementById("checkIp").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://ipwho.is/" });
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

chrome.storage.onChanged.addListener(load);
load();
