import type {
  StateCreator,
  StoreMutatorIdentifier,
} from 'zustand/vanilla';
import { createTabSync } from '../core/tab-sync';
import type { TabSyncInstance } from '../types';
import type { TabSyncZustandOptions } from './types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function shouldSyncKey<T>(
  key: string,
  value: unknown,
  options?: TabSyncZustandOptions<T>,
): boolean {
  if (typeof value === 'function') return false;
  if (options?.include) return (options.include as readonly string[]).includes(key);
  if (options?.exclude) return !(options.exclude as readonly string[]).includes(key);
  return true;
}

function extractSyncableState<T extends Record<string, unknown>>(
  state: T,
  options?: TabSyncZustandOptions<T>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (shouldSyncKey(key, value, options)) {
      result[key] = value;
    }
  }
  return result;
}

function validateOptions<T>(options?: TabSyncZustandOptions<T>): void {
  if (options?.include && options?.exclude) {
    throw new Error(
      '[tab-bridge/zustand] `include` and `exclude` are mutually exclusive',
    );
  }
}

// ── Type declarations ───────────────────────────────────────────────────────

type TabSyncMiddleware = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, Mps, Mcs>,
  options?: TabSyncZustandOptions<T>,
) => StateCreator<T, Mps, Mcs>;

type TabSyncImpl = <T extends Record<string, unknown>>(
  initializer: StateCreator<T, [], []>,
  options?: TabSyncZustandOptions<T>,
) => StateCreator<T, [], []>;

// ── Implementation ──────────────────────────────────────────────────────────

const tabSyncImpl: TabSyncImpl = (initializer, options) => (set, get, api) => {
  validateOptions(options);

  let sync_instance: TabSyncInstance<Record<string, unknown>> | null = null;
  let is_remote_update = false;

  const initial_state = initializer(set, get, api);

  const syncable_initial = extractSyncableState(initial_state, options);

  sync_instance = createTabSync({
    initial: syncable_initial,
    channel: options?.channel ?? 'tab-sync-zustand',
    debug: options?.debug,
    transport: options?.transport,
    merge: options?.merge,
    onError: options?.onError,
  });

  api.subscribe((next_state, prev_state) => {
    if (is_remote_update || !sync_instance) return;

    const next = next_state as Record<string, unknown>;
    const prev = prev_state as Record<string, unknown>;
    const diff: Record<string, unknown> = {};
    let has_diff = false;

    for (const key of Object.keys(next)) {
      if (
        shouldSyncKey(key, next[key], options) &&
        !Object.is(prev[key], next[key])
      ) {
        diff[key] = next[key];
        has_diff = true;
      }
    }

    if (has_diff) {
      sync_instance.patch(diff);
    }
  });

  sync_instance.onChange((remote_state, changed_keys, meta) => {
    if (meta.isLocal) return;

    is_remote_update = true;
    try {
      const patch: Record<string, unknown> = {};
      let has_patch = false;
      for (const key of changed_keys) {
        patch[key as string] = remote_state[key as string];
        has_patch = true;
      }
      if (has_patch) {
        (api.setState as (state: Record<string, unknown>) => void)(patch);
      }
    } finally {
      is_remote_update = false;
    }
  });

  options?.onSyncReady?.(sync_instance);

  return initial_state;
};

/**
 * Zustand middleware that synchronizes store state across browser tabs
 * via tab-bridge's BroadcastChannel/localStorage transport.
 *
 * Functions (actions) are automatically excluded from synchronization.
 * Use `include` or `exclude` options to further filter which keys are synced.
 *
 * @param initializer - Zustand StateCreator function.
 * @param options - Synchronization options.
 * @returns A wrapped StateCreator that synchronizes state across tabs.
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
 *     { channel: 'my-app' }
 *   )
 * );
 * // All tabs sharing channel 'my-app' will have synchronized state.
 * ```
 */
export const tabSync = tabSyncImpl as unknown as TabSyncMiddleware;
