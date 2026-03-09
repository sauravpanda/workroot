const DAEMON_URL = "http://127.0.0.1:4444";
let connected = false;

// Health check every 10 seconds
async function checkConnection() {
  try {
    const resp = await fetch(`${DAEMON_URL}/health`, { method: "GET" });
    const wasConnected = connected;
    connected = resp.ok;
    if (connected && !wasConnected) {
      console.log("[Workroot] Connected to daemon");
      updateIcon(true);
    } else if (!connected && wasConnected) {
      console.log("[Workroot] Disconnected from daemon");
      updateIcon(false);
    }
  } catch {
    if (connected) {
      console.log("[Workroot] Disconnected from daemon");
    }
    connected = false;
    updateIcon(false);
  }
}

function updateIcon(isConnected) {
  const path = isConnected ? "icons/icon-connected" : "icons/icon-disconnected";
  chrome.action.setIcon({
    path: {
      16: `${path}16.png`,
      48: `${path}48.png`,
    },
  }).catch(() => {
    // Icons may not exist yet
  });
}

// Send data to daemon
async function sendToDaemon(endpoint, payload) {
  if (!connected) return null;
  try {
    const resp = await fetch(`${DAEMON_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONSOLE_ERROR") {
    sendToDaemon("/browser/error", {
      ...message.payload,
      tab_url: sender.tab?.url || "",
      tab_id: sender.tab?.id,
    });
    sendResponse({ ok: true });
  } else if (message.type === "NETWORK_FAILURE") {
    sendToDaemon("/browser/network-failure", {
      ...message.payload,
      tab_url: sender.tab?.url || "",
      tab_id: sender.tab?.id,
    });
    sendResponse({ ok: true });
  } else if (message.type === "GET_STATUS") {
    sendResponse({ connected });
  }
  return true;
});

// Monitor network responses for failures
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400) {
      sendToDaemon("/browser/network-failure", {
        url: details.url,
        method: details.method,
        status_code: details.statusCode,
        type: details.type,
        timestamp: new Date().toISOString(),
      });
    }
  },
  { urls: ["http://localhost/*", "http://127.0.0.1/*"] }
);

// Start health check loop
checkConnection();
setInterval(checkConnection, 10000);
