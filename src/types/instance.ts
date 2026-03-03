import type { TabInfo, ChangeMeta } from './common';
import type { RPCMap, RPCArgs, RPCResult, RPCCallAllResult } from './rpc';

export interface TabSyncInstance<
  TState extends Record<string, unknown>,
  TRPCMap extends RPCMap = RPCMap,
> {
  // ── State ──

  /** Read a single value by key. */
  get<K extends keyof TState>(key: K): TState[K];

  /**
   * Read the entire state as a frozen snapshot.
   * Returns the same reference until state changes (safe for React).
   */
  getAll(): Readonly<TState>;

  /** Update a single key. Synced to all tabs. */
  set<K extends keyof TState>(key: K, value: TState[K]): void;

  /** Update multiple keys in a single broadcast. */
  patch(partial: Partial<TState>): void;

  /**
   * Atomically update multiple keys based on the current state.
   * Return `null` to abort the transaction.
   *
   * ```ts
   * sync.transaction((state) => {
   *   if (state.balance >= amount) {
   *     return { balance: state.balance - amount, history: [...state.history, tx] };
   *   }
   *   return null; // abort
   * });
   * ```
   */
  transaction(fn: (state: Readonly<TState>) => Partial<TState> | null): void;

  // ── Subscriptions ──

  /**
   * Subscribe to changes for a specific key.
   * @returns Unsubscribe function.
   *
   * ```ts
   * const off = sync.on('theme', (value, meta) => {
   *   console.log(value, meta.isLocal ? 'local' : 'remote');
   * });
   * off(); // unsubscribe
   * ```
   */
  on<K extends keyof TState>(
    key: K,
    callback: (value: TState[K], meta: ChangeMeta) => void,
  ): () => void;

  /**
   * Subscribe to a specific key, but fire only once then auto-unsubscribe.
   *
   * ```ts
   * sync.once('theme', (value) => console.log('First change:', value));
   * ```
   */
  once<K extends keyof TState>(
    key: K,
    callback: (value: TState[K], meta: ChangeMeta) => void,
  ): () => void;

  /**
   * Subscribe to all state changes.
   * @returns Unsubscribe function.
   */
  onChange(
    callback: (
      state: Readonly<TState>,
      changedKeys: (keyof TState)[],
      meta: ChangeMeta,
    ) => void,
  ): () => void;

  /**
   * Subscribe to a **derived value**. The callback only fires when the
   * selector's return value actually changes (compared via `isEqual`,
   * default `Object.is`).
   *
   * ```ts
   * sync.select(
   *   (s) => s.items.filter(i => i.done).length,
   *   (doneCount) => badge.textContent = doneCount,
   * );
   * ```
   *
   * @returns Unsubscribe function.
   */
  select<TResult>(
    selector: (state: Readonly<TState>) => TResult,
    callback: (result: TResult, meta: ChangeMeta) => void,
    options?: {
      isEqual?: (a: TResult, b: TResult) => boolean;
      debounce?: number;
    },
  ): () => void;

  // ── Leader ──

  /** Whether this tab is currently the leader. */
  isLeader(): boolean;

  /**
   * Register a callback that fires when this tab becomes leader.
   * Optionally return a cleanup function that runs when leadership is lost.
   *
   * ```ts
   * sync.onLeader(() => {
   *   const ws = new WebSocket('...');
   *   return () => ws.close(); // cleanup on resign
   * });
   * ```
   */
  onLeader(callback: () => void | (() => void)): () => void;

  /** Get info about the current leader tab, or `null` if no leader yet. */
  getLeader(): TabInfo | null;

  /**
   * Returns a promise that resolves with the leader's `TabInfo`
   * as soon as a leader is elected. Resolves immediately if a leader
   * already exists.
   *
   * ```ts
   * const leader = await sync.waitForLeader();
   * const result = await sync.call('leader', 'getData');
   * ```
   */
  waitForLeader(): Promise<TabInfo>;

  // ── Tabs ──

  /** Unique ID of this tab (UUID v4). */
  readonly id: string;

  /** List of all currently active tabs. */
  getTabs(): TabInfo[];

  /** Number of currently active tabs. */
  getTabCount(): number;

  /**
   * Subscribe to tab presence changes (join, leave, leader change).
   * @returns Unsubscribe function.
   */
  onTabChange(callback: (tabs: TabInfo[]) => void): () => void;

  // ── RPC (typed when TRPCMap is provided) ──

  /**
   * Call a remote procedure on another tab.
   *
   * ```ts
   * const result = await sync.call('leader', 'getTime');
   * const sum    = await sync.call(tabId, 'add', { a: 1, b: 2 });
   * ```
   *
   * @param target - Tab ID or `'leader'` to auto-resolve.
   * @param method - Method name (typed if `TRPCMap` is provided).
   * @param args   - Arguments to pass to the handler.
   * @param timeout - Timeout in ms. Default: `5000`.
   */
  call<M extends string>(
    target: string | 'leader',
    method: M,
    args?: RPCArgs<TRPCMap, M>,
    timeout?: number,
  ): Promise<RPCResult<TRPCMap, M>>;

  /**
   * Call a method on **all other tabs** (fan-out).
   * Returns an array of per-tab results, including errors.
   *
   * ```ts
   * const results = await sync.callAll('getStatus');
   * for (const { tabId, result, error } of results) { ... }
   * ```
   */
  callAll<M extends string>(
    method: M,
    args?: RPCArgs<TRPCMap, M>,
    timeout?: number,
  ): Promise<RPCCallAllResult<RPCResult<TRPCMap, M>>[]>;

  /**
   * Register an RPC handler that other tabs can call.
   *
   * ```ts
   * sync.handle('add', ({ a, b }) => a + b);
   * ```
   *
   * @returns Unsubscribe function to remove the handler.
   */
  handle<M extends string>(
    method: M,
    handler: (
      args: RPCArgs<TRPCMap, M>,
      callerTabId: string,
    ) => RPCResult<TRPCMap, M> | Promise<RPCResult<TRPCMap, M>>,
  ): () => void;

  // ── Lifecycle ──

  /**
   * Destroy this instance. Sends goodbye to other tabs,
   * cancels all timers, and flushes pending state.
   * Safe to call multiple times.
   */
  destroy(): void;

  /** `false` after `destroy()` has been called. */
  readonly ready: boolean;
}
