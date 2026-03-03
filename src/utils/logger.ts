export interface Logger {
  log: (label: string, ...args: unknown[]) => void;
}

export function createLogger(enabled: boolean, tabId: string): Logger {
  if (!enabled) return { log: (() => {}) as (...args: unknown[]) => void };
  const prefix = `%c[tab-sync:${tabId.slice(0, 8)}]`;
  const style = 'color:#818cf8;font-weight:600';
  return {
    log: (label: string, ...args: unknown[]) =>
      console.log(prefix, style, label, ...args),
  };
}
