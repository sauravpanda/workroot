const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const errorLog = document.getElementById("errorLog");
const networkLog = document.getElementById("networkLog");
const refreshBtn = document.getElementById("refreshBtn");

const errors = [];
const networkFailures = [];

function updateStatus() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      statusDot.classList.remove("connected");
      statusText.textContent = "Disconnected";
      return;
    }
    if (response.connected) {
      statusDot.classList.add("connected");
      statusText.textContent = "Connected to Workroot";
    } else {
      statusDot.classList.remove("connected");
      statusText.textContent = "Disconnected — daemon not running";
    }
  });
}

function addEntry(list, container, entry, className) {
  list.unshift(entry);
  if (list.length > 100) list.pop();
  renderList(list, container, className);
}

function renderList(list, container, className) {
  if (list.length === 0) {
    container.innerHTML = '<div class="empty">No entries</div>';
    return;
  }
  container.innerHTML = list
    .map(
      (e) =>
        `<div class="log-entry ${className}">${escapeHtml(e)}</div>`
    )
    .join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CONSOLE_ERROR") {
    const p = message.payload;
    addEntry(errors, errorLog, `[${p.type}] ${p.message}`, "error");
  } else if (message.type === "NETWORK_FAILURE") {
    const p = message.payload;
    addEntry(
      networkFailures,
      networkLog,
      `${p.method} ${p.url} → ${p.status_code}`,
      "network"
    );
  }
});

refreshBtn.addEventListener("click", updateStatus);

// Initial status check
updateStatus();
setInterval(updateStatus, 10000);
