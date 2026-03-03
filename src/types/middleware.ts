import type { ChangeMeta } from './common';

export interface MiddlewareContext<TState extends Record<string, unknown>> {
  readonly key: keyof TState;
  readonly value: unknown;
  readonly previousValue: unknown;
  readonly meta: ChangeMeta;
}

/**
 * Return `false` to reject the change, `{ value }` to transform it,
 * or `void`/`undefined` to pass through unchanged.
 */
export type MiddlewareResult = { value: unknown } | false;

export interface Middleware<
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: string;
  /** Intercept local `set` / `patch` calls before they are applied. */
  onSet?: (ctx: MiddlewareContext<TState>) => MiddlewareResult | void;
  /** Called after any state change (local or remote) has been committed. */
  afterChange?: (key: keyof TState, value: unknown, meta: ChangeMeta) => void;
  /** Cleanup when the instance is destroyed. */
  onDestroy?: () => void;
}
