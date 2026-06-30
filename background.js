// Proxy Switcher Pro - background service worker (MV3)

const STORAGE_KEYS = {
  proxies: "proxies",
  activeId: "activeProxyId",
  enabled: "enabled",
  bypass: "bypassList"
};

const DEFAULT_BYPASS = ["localhost", "127.0.0.1", "<local>"];

// chrome.proxy uses these scheme names
function mapScheme(type) {
  switch ((type || "").toLowerCase()) {
    case "http":
      return "http";
    case "https":
      return "https";
    case "socks5":
      return "socks5";
    case "socks4":
      return "socks4";
    default:
      return "http";
  }
}

async function getState() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.proxies,
    STORAGE_KEYS.activeId,
    STORAGE_KEYS.enabled,
    STORAGE_KEYS.bypass
  ]);
  return {
    proxies: data[STORAGE_KEYS.proxies] || [],
    activeId: data[STORAGE_KEYS.activeId] || null,
    enabled: !!data[STORAGE_KEYS.enabled],
    bypass: data[STORAGE_KEYS.bypass] || DEFAULT_BYPASS
  };
}

function buildConfig(proxy, bypassList) {
  const scheme = mapScheme(proxy.type);
  const single = {
    scheme: scheme,
    host: proxy.host,
    port: Number(proxy.port)
  };
  return {
    mode: "fixed_servers",
    rules: {
      singleProxy: single,
      bypassList: bypassList && bypassList.length ? bypassList : DEFAULT_BYPASS
    }
  };
}

async function applyProxy() {
  const { proxies, activeId, enabled, bypass } = await getState();

  if (!enabled || !activeId) {
    await clearProxy();
    return;
  }

  const proxy = proxies.find((p) => p.id === activeId);
  if (!proxy) {
    await clearProxy();
    return;
  }

  const config = buildConfig(proxy, bypass);
  await chrome.proxy.settings.set({ value: config, scope: "regular" });

  // Handle auth if credentials present
  setupAuth(proxy);

  updateBadge(true, proxy);
}

async function clearProxy() {
  await chrome.proxy.settings.set({ value: { mode: "direct" }, scope: "regular" });
  updateBadge(false);
}

let currentAuth = null;

function setupAuth(proxy) {
  if (proxy && proxy.username) {
    currentAuth = { username: proxy.username, password: proxy.password || "" };
  } else {
    currentAuth = null;
  }
}

// Provide credentials for proxies that need authentication
chrome.webRequest &&
  chrome.webRequest.onAuthRequired &&
  chrome.webRequest.onAuthRequired.addListener(
    (details) => {
      if (details.isProxy && currentAuth) {
        return { authCredentials: currentAuth };
      }
      return {};
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );

function updateBadge(on, proxy) {
  if (on) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
    chrome.action.setTitle({
      title: proxy ? `Proxy: ${proxy.name || proxy.host + ":" + proxy.port}` : "Proxy ON"
    });
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#9ca3af" });
    chrome.action.setTitle({ title: "Proxy OFF" });
  }
}

// React to storage changes from popup/options
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (
    changes[STORAGE_KEYS.activeId] ||
    changes[STORAGE_KEYS.enabled] ||
    changes[STORAGE_KEYS.proxies] ||
    changes[STORAGE_KEYS.bypass]
  ) {
    applyProxy();
  }
});

chrome.runtime.onInstalled.addListener(() => applyProxy());
chrome.runtime.onStartup.addListener(() => applyProxy());

// Messaging API for explicit control
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "APPLY") {
      await applyProxy();
      sendResponse({ ok: true });
    } else if (msg.type === "CLEAR") {
      await clearProxy();
      sendResponse({ ok: true });
    } else if (msg.type === "STATE") {
      sendResponse(await getState());
    }
  })();
  return true;
});
