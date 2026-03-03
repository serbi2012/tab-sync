/**
 * Define your RPC contract for full type inference:
 *
 * ```ts
 * interface MyRPC {
 *   getTime: { args: void; result: { iso: string } };
 *   add:     { args: { a: number; b: number }; result: number };
 * }
 *
 * const sync = createTabSync<State, MyRPC>({ ... });
 * const { iso } = await sync.call('leader', 'getTime');  // fully typed
 * ```
 */
export type RPCMap = Record<string, { args: unknown; result: unknown }>;

export interface RPCCallAllResult<T = unknown> {
  tabId: string;
  result?: T;
  error?: string;
}

/** Resolve args type for a method. Falls back to `unknown` for unregistered methods. */
export type RPCArgs<TMap extends RPCMap, M extends string> =
  M extends keyof TMap ? TMap[M]['args'] : unknown;

/** Resolve result type for a method. Falls back to `unknown` for unregistered methods. */
export type RPCResult<TMap extends RPCMap, M extends string> =
  M extends keyof TMap ? TMap[M]['result'] : unknown;
