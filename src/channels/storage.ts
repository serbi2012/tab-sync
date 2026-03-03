import type { TabMessage } from '../types';
import type { Channel } from './channel';
import { isBrowser, hasLocalStorage } from '../utils/env';

const KEY_PREFIX = '__tab_sync__';

/**
 * Fallback transport using `localStorage` `storage` events.
 *
 * Limitations vs BroadcastChannel:
 * - Values must be JSON-serializable
 * - `storage` event only fires on OTHER tabs (same-tab is not needed since
 *   the originating tab already handles the change locally)
 * - Slightly slower due to serialization overhead
 */
export class StorageChannel implements Channel {
  private readonly key: string;
  private readonly listeners = new Set<(event: StorageEvent) => void>();
  private readonly onError?: (error: Error) => void;
  private closed = false;
  private seq = 0;

  constructor(channelName: string, onError?: (error: Error) => void) {
    this.key = `${KEY_PREFIX}${channelName}`;
    this.onError = onError;
  }

  postMessage(message: TabMessage): void {
    if (this.closed || !hasLocalStorage) return;
    try {
      const wrapped = JSON.stringify({ m: message, s: this.seq++ });
      localStorage.setItem(this.key, wrapped);
    } catch (e) {
      this.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }

  onMessage(callback: (message: TabMessage) => void): () => void {
    if (!isBrowser) return () => {};

    const handler = (event: StorageEvent) => {
      if (event.key !== this.key || !event.newValue) return;
      try {
        const { m } = JSON.parse(event.newValue) as { m: TabMessage };
        callback(m);
      } catch {
        // Ignore malformed data
      }
    };

    this.listeners.add(handler);
    window.addEventListener('storage', handler);

    return () => {
      this.listeners.delete(handler);
      window.removeEventListener('storage', handler);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (isBrowser) {
      for (const handler of this.listeners) {
        window.removeEventListener('storage', handler);
      }
    }
    this.listeners.clear();

    if (hasLocalStorage) {
      try {
        localStorage.removeItem(this.key);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
