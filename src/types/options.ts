import type { PersistOptions } from './persist';
import type { Middleware } from './middleware';

export interface LeaderOptions {
  /** Heartbeat interval in ms. Default: `2000` */
  heartbeatInterval?: number;
  /** Leader timeout in ms. Default: `6000` */
  leaderTimeout?: number;
}

export interface TabSyncOptions<
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Initial state used before sync completes. */
  initial?: TState;
  /** Channel name — only tabs sharing the same name communicate. Default: `'tab-sync'` */
  channel?: string;
  /** Force a specific transport layer. Default: auto-detect. */
  transport?: 'broadcast-channel' | 'local-storage';
  /** Custom merge function for LWW conflict resolution. */
  merge?: (localValue: unknown, remoteValue: unknown, key: keyof TState) => unknown;
  /** Enable leader election. Default: `true` */
  leader?: boolean | LeaderOptions;
  /** Heartbeat interval in ms. Default: `2000` */
  heartbeatInterval?: number;
  /** Leader timeout in ms. Default: `6000` */
  leaderTimeout?: number;
  /** Enable debug logging. Default: `false` */
  debug?: boolean;
  /** Persist state across page reloads. `true` uses defaults, or pass options. */
  persist?: PersistOptions<TState> | boolean;
  /** Middleware pipeline for intercepting state changes. */
  middlewares?: Middleware<TState>[];
  /** Error callback for non-fatal errors (storage, channel, etc.). */
  onError?: (error: Error) => void;
}
