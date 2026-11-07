/**
 * Error handling helpers.
 *
 * `catch (e: any)` plus `e.message` appears throughout the app and is wrong in
 * two ways: TypeScript cannot check it, and a thrown string or `null` renders
 * as "undefined" in the middle of a user-facing alert. These helpers keep the
 * message extraction in one place so the fallback is always deliberate.
 */

/** A message safe to show a user: never empty, never "undefined". */
export function errorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error.trim();

  // IndexedDB and some libraries reject with a plain object.
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return fallback;
}

/**
 * True when a save was interrupted by the page going away rather than failing.
 *
 * Dexie raises `PrematureCommitError` when a transaction is still open as the
 * document is torn down, and `TransactionInactiveError` when it is opened
 * against an already-closing connection. The write itself has usually landed;
 * surfacing an error dialog for it (or marking the editor as broken) is wrong,
 * because the user did nothing wrong and there is nothing to retry.
 */
export function isBenignSaveAbort(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return (
    name === "PrematureCommitError" ||
    name === "TransactionInactiveError" ||
    name === "AbortError" ||
    name === "InvalidStateError"
  );
}
