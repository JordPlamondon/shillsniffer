const DEBUG = false;

export function log(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[ShillSniffer]', ...args);
  }
}

export function warn(...args: unknown[]): void {
  if (DEBUG) {
    console.warn('[ShillSniffer]', ...args);
  }
}

export function error(...args: unknown[]): void {
  console.error('[ShillSniffer]', ...args);
}
