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

// Convert user-entered exceptions into valid Chrome bypass patterns.
// Very tolerant: accepts schemes, paths, ports, commas/spaces as separators,
// drops anything invalid so a single bad entry never breaks the whole proxy.
function normalizeBypass(list) {
  const out = new Set();
  const pieces = [];

  (list || []).forEach((raw) => {
    // allow separating by newlines (already split), commas, semicolons, spaces, tabs
    String(raw)
      .split(/[\s,;]+/)
      .forEach((p) => pieces.push(p));
  });

  pieces.forEach((rawEntry) => {
    let e = String(rawEntry).trim().toLowerCase();
    if (!e) return;

    // strip scheme like http:// https:// socks5://
    e = e.replace(/^[a-z0-9+.-]+:\/\//, "");
    // strip credentials user:pass@
    e = e.replace(/^[^@/]*@/, "");
    // strip path / query / hash
    e = e.split(/[/?#]/)[0];
    // strip leading dots
    e = e.replace(/^\.+/, "");
    if (!e) return;

    const special = e === "<local>" || e === "<-loopback>";
    const isCidr = /^[0-9a-f:.]+\/\d{1,3}$/.test(e);
    const isWildcard = e.startsWith("*");
    // split optional :port for validation
    const m = e.match(/^([^:]+|\[[^\]]+\])(?::(\d{1,5}))?$/);

    if (special) {
      out.add(e);
      return;
    }
    if (isCidr) {
      out.add(e);
      return;
    }
    if (!m) {
      // unrecognized shape, skip silently so it can't break the config
      return;
    }

    const host = m[1];
    const port = m[2];
    const hostPort = port ? `${host}:${port}` : host;

    // validate host chars: letters, digits, dot, dash, *, brackets/colon for IPv6
    if (!/^[a-z0-9.\-*\[\]:]+$/.test(host)) return;

    out.add(hostPort);

    // For a plain domain (not IP, not wildcard, not IPv6), also match subdomains
    const isIp = /^[0-9.]+$/.test(host) || host.includes("[") || host.includes("::");
    if (!isWildcard && !isIp && host.includes(".")) {
      out.add(port ? `*.${host}:${port}` : `*.${host}`);
    }
  });

  return Array.from(out);
}

function buildConfig(proxy, bypassList) {
  const scheme = mapScheme(proxy.type);
  const single = {
    scheme: scheme,
    host: proxy.host,
    port: Number(proxy.port)
  };
  let normalized = normalizeBypass(bypassList);
  // always keep loopback safe
  ["localhost", "127.0.0.1", "<local>"].forEach((d) => {
    if (!normalized.includes(d)) normalized.push(d);
  });
  return {
    mode: "fixed_servers",
    rules: {
      singleProxy: single,
      bypassList: normalized
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
  try {
    await chrome.proxy.settings.set({ value: config, scope: "regular" });
  } catch (err) {
    console.error("Failed to set proxy, retrying without bypass:", err);
    // Fallback: apply proxy with only safe defaults so it never breaks
    const safe = buildConfig(proxy, []);
    await chrome.proxy.settings.set({ value: safe, scope: "regular" });
  }

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
