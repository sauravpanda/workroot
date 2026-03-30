import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// ─── Retry configuration ────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms before first retry (doubles each attempt). Default: 200. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 5000. */
  maxDelayMs?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
};

// ─── Transient error detection ─────────────────────────────────────────────

/**
 * Returns true if the error string looks like a transient failure that is
 * worth retrying (IPC timeout, channel broken, DB lock contention).
 * Permanent errors (NOT_FOUND, INVALID, auth failures) are not retried.
 */
function isTransient(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("channel") ||
    msg.includes("ipc") ||
    msg.includes("[lock]") ||
    msg.includes("connection refused") ||
    msg.includes("broken pipe")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Wrapper around `invoke()` with configurable exponential-backoff retry.
 *
 * Only retries on transient errors (IPC timeouts, lock contention, channel
 * failures). Permanent errors (validation failures, not-found, auth) are
 * surfaced immediately.
 *
 * ```ts
 * // Drop-in replacement for invoke() with default retry behaviour:
 * const result = await invokeWithRetry<MyType>("my_command", { arg: 1 });
 *
 * // Custom retry config:
 * const result = await invokeWithRetry<MyType>("my_command", { arg: 1 }, { maxAttempts: 5 });
 * ```
 */
export async function invokeWithRetry<T>(
  cmd: string,
  args?: Record<string, unknown>,
  retryOpts?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULTS, ...retryOpts };
  let lastErr: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await tauriInvoke<T>(cmd, args);
    } catch (err) {
      lastErr = err;

      const isLastAttempt = attempt === opts.maxAttempts;
      if (isLastAttempt || !isTransient(err)) {
        throw err;
      }

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1),
        opts.maxDelayMs,
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}
