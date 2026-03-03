import type { TabSyncInstance } from '../types';

/**
 * Options for the `tabSync` Zustand middleware.
 *
 * @example
 * ```ts
 * import { create } from 'zustand';
 * import { tabSync } from 'tab-bridge/zustand';
 *
 * const useStore = create(
 *   tabSync(
 *     (set) => ({
 *       count: 0,
 *       inc: () => set((s) => ({ count: s.count + 1 })),
 *     }),
 *     { channel: 'my-app', exclude: ['localOnly'] }
 *   )
 * );
 * ```
 */
export interface TabSyncZustandOptions<T = Record<string, unknown>> {
  /** Channel name for cross-tab communication. @default 'tab-sync-zustand' */
  channel?: string;

  /**
   * Only sync these keys. Functions are always excluded.
   * Mutually exclusive with `exclude`.
   */
  include?: readonly (keyof T & string)[];

  /**
   * Exclude these keys from syncing. Functions are always excluded.
   * Mutually exclusive with `include`.
   */
  exclude?: readonly (keyof T & string)[];

  /**
   * Custom conflict resolution.
   * Called when the same key is updated on two tabs simultaneously.
   * @default Last-write-wins (LWW)
   */
  merge?: (localValue: unknown, remoteValue: unknown, key: string) => unknown;

  /** Force a specific transport layer. @default auto-detect */
  transport?: 'broadcast-channel' | 'local-storage';

  /** Enable debug logging. @default false */
  debug?: boolean;

  /** Error callback for non-fatal errors (channel failures, etc.). */
  onError?: (error: Error) => void;

  /**
   * Callback invoked when the underlying `TabSyncInstance` is ready.
   * Use this to access advanced features (RPC, leader election, etc.)
   * or to store a reference for manual cleanup via `instance.destroy()`.
   */
  onSyncReady?: (instance: TabSyncInstance<Record<string, unknown>>) => void;
}
