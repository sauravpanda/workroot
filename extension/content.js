// Content script injected into localhost pages.
// Captures console errors, unhandled exceptions, and unhandled promise rejections.

(function () {
  "use strict";

  // Deduplication: track recent error signatures
  const recentErrors = new Map();
  const DEDUP_WINDOW_MS = 5000;

  function getErrorSignature(message, source, line) {
    return `${message}|${source || ""}|${line || ""}`;
  }

  function isDuplicate(signature) {
    const now = Date.now();
    const last = recentErrors.get(signature);
    if (last && now - last < DEDUP_WINDOW_MS) {
      return true;
    }
    recentErrors.set(signature, now);
    // Clean old entries
    if (recentErrors.size > 100) {
      for (const [key, time] of recentErrors) {
        if (now - time > DEDUP_WINDOW_MS) {
          recentErrors.delete(key);
        }
      }
    }
    return false;
  }

  function sendError(payload) {
    try {
      chrome.runtime.sendMessage({
        type: "CONSOLE_ERROR",
        payload,
      });
    } catch {
      // Extension context may be invalidated
    }
  }

  // Override console.error
  const originalError = console.error;
  console.error = function (...args) {
    const message = args
      .map((a) => {
        if (a instanceof Error) return `${a.message}\n${a.stack || ""}`;
        if (typeof a === "object") {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      })
      .join(" ");

    const sig = getErrorSignature(message, "", "");
    if (!isDuplicate(sig)) {
      sendError({
        type: "console.error",
        message: message.slice(0, 4096),
        timestamp: new Date().toISOString(),
        page_url: window.location.href,
        user_agent: navigator.userAgent,
      });
    }

    originalError.apply(console, args);
  };

  // Capture unhandled exceptions
  window.addEventListener("error", (event) => {
    const sig = getErrorSignature(
      event.message,
      event.filename,
      event.lineno
    );
    if (isDuplicate(sig)) return;

    sendError({
      type: "exception",
      message: (event.message || "").slice(0, 4096),
      source: event.filename || "",
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack?.slice(0, 4096) || "",
      timestamp: new Date().toISOString(),
      page_url: window.location.href,
      user_agent: navigator.userAgent,
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const stack =
      reason instanceof Error ? reason.stack || "" : "";

    const sig = getErrorSignature(message, "", "");
    if (isDuplicate(sig)) return;

    sendError({
      type: "unhandled_rejection",
      message: message.slice(0, 4096),
      stack: stack.slice(0, 4096),
      timestamp: new Date().toISOString(),
      page_url: window.location.href,
      user_agent: navigator.userAgent,
    });
  });

  // Intercept fetch for response body capture on failures
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const startTime = Date.now();
    try {
      const response = await originalFetch.apply(this, args);
      if (response.status >= 400) {
        const url =
          typeof args[0] === "string"
            ? args[0]
            : args[0]?.url || "";
        const method =
          args[1]?.method || (typeof args[0] === "object" ? args[0]?.method : "GET") || "GET";

        // Clone to read body without consuming
        let responseBody = "";
        try {
          const clone = response.clone();
          const text = await clone.text();
          responseBody = text.slice(0, 16384);
        } catch {
          // Body may not be readable
        }

        let requestBody = null;
        if (args[1]?.body) {
          try {
            requestBody =
              typeof args[1].body === "string"
                ? args[1].body.slice(0, 16384)
                : null;
          } catch {
            // Ignore
          }
        }

        const duration = Date.now() - startTime;

        try {
          chrome.runtime.sendMessage({
            type: "NETWORK_FAILURE",
            payload: {
              url,
              method: method.toUpperCase(),
              status_code: response.status,
              response_body: responseBody,
              request_body: requestBody,
              duration_ms: duration,
              timestamp: new Date().toISOString(),
              page_url: window.location.href,
            },
          });
        } catch {
          // Extension context may be invalidated
        }
      }
      return response;
    } catch (error) {
      throw error;
    }
  };
})();
