import type {
  TabSyncOptions,
  TabSyncInstance,
  TabInfo,
  ChangeMeta,
  TabMessage,
  LeaderOptions,
  Middleware,
  RPCMap,
  SendFn,
} from '../types';
import { PROTOCOL_VERSION } from '../types';
import { generateTabId } from '../utils/id';
import { TabSyncError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { createChannel, type Channel } from '../channels/channel';
import { StateManager } from './state-manager';
import { TabRegistry } from './tab-registry';
import { LeaderElection } from './leader-election';
import { RPCHandler } from './rpc';
import { runMiddleware, notifyMiddleware, destroyMiddleware } from './middleware';
import { resolvePersistOptions, loadPersistedState, createPersistSaver } from './persist';

// ── Factory ─────────────────────────────────────────────────────────────────

export function createTabSync<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TRPCMap extends RPCMap = RPCMap,
>(options?: TabSyncOptions<TState>): TabSyncInstance<TState, TRPCMap> {
  const opts = options ?? ({} as TabSyncOptions<TState>);
  const tabId = generateTabId();
  const tabCreatedAt = Date.now();
  const channelName = opts.channel ?? 'tab-sync';
  const debug = opts.debug ?? false;
  const onError = opts.onError ?? (() => {});

  // ── Leader options ──
  const leaderEnabled = opts.leader !== false;
  const leaderOpts: LeaderOptions =
    typeof opts.leader === 'object' ? opts.leader : {};
  const heartbeatInterval =
    opts.heartbeatInterval ?? leaderOpts.heartbeatInterval ?? 2000;
  const leaderTimeout =
    opts.leaderTimeout ?? leaderOpts.leaderTimeout ?? 6000;
  const missedHeartbeatsLimit = Math.max(
    1,
    Math.round(leaderTimeout / heartbeatInterval),
  );

  // ── Middleware ──
  const middlewares: Middleware<TState>[] = [...(opts.middlewares ?? [])];

  // ── Persistence ──
  const persistOpts = resolvePersistOptions(opts.persist);
  const persister = persistOpts
    ? createPersistSaver<TState>(persistOpts, onError)
    : null;

  // Merge persisted state with initial
  let initialState = (opts.initial ?? {}) as TState;
  if (persistOpts) {
    const restored = loadPersistedState<TState>(persistOpts);
    if (Object.keys(restored).length > 0) {
      initialState = { ...initialState, ...restored } as TState;
    }
  }

  // ── Channel ──
  const channel: Channel = createChannel(channelName, opts.transport, onError);

  // ── Logger ──
  const { log } = createLogger(debug, tabId);

  // ── Send helper (adds protocol version) ──
  const send: SendFn = (message) => {
    log('→', message.type, message.payload);
    channel.postMessage(message);
  };

  // ── Core modules ──
  const stateManager = new StateManager<TState>({
    send,
    tabId,
    initial: initialState,
    merge: opts.merge,
    afterRemoteChange(key, value, meta) {
      notifyMiddleware(middlewares, key, value, meta);
      if (persister) persister.save(stateManager.getAll());
    },
  });

  const registry = new TabRegistry({
    send,
    tabId,
    tabCreatedAt,
    heartbeatInterval,
    tabTimeout: leaderTimeout,
  });

  let election: LeaderElection | null = null;
  if (leaderEnabled) {
    election = new LeaderElection({
      send,
      tabId,
      tabCreatedAt,
      heartbeatInterval,
      missedHeartbeatsLimit,
    });
  }

  const rpc = new RPCHandler({
    send,
    tabId,
    resolveLeaderId: () => election?.getLeaderId() ?? null,
    resolveTabIds: () => registry.getTabs().map((t) => t.id),
    onError,
  });

  // ── Message routing ──
  const unsubChannel = channel.onMessage((message: TabMessage) => {
    log('←', message.type, `from=${message.senderId}`);

    if (message.senderId === tabId) return;

    // Protocol version check (forward compatible)
    if (message.version && message.version > PROTOCOL_VERSION) {
      log('⚠️', `Unknown protocol v${message.version}, ignoring`);
      return;
    }

    registry.handleMessage(message);

    switch (message.type) {
      case 'STATE_UPDATE':
      case 'STATE_SYNC_RESPONSE':
        stateManager.handleMessage(message);
        break;

      case 'STATE_SYNC_REQUEST':
        if (election?.isLeader() ?? true) {
          stateManager.respondToSync(message.senderId);
        }
        break;

      case 'LEADER_CLAIM':
      case 'LEADER_ACK':
      case 'LEADER_HEARTBEAT':
      case 'LEADER_RESIGN':
        election?.handleMessage(message);
        if (election) {
          registry.setLeader(election.getLeaderId());
        }
        break;

      case 'RPC_REQUEST':
      case 'RPC_RESPONSE':
        rpc.handleMessage(message);
        break;
    }
  });

  // ── Start ──
  registry.announce();
  stateManager.requestSync();
  election?.start();

  let ready = true;
  let destroyed = false;

  // ── Destroy guard ──

  function assertAlive(): void {
    if (destroyed) throw TabSyncError.destroyed();
  }

  // ── Middleware-wrapped state operations ──

  function middlewareSet<K extends keyof TState>(key: K, value: TState[K]): void {
    assertAlive();
    if (middlewares.length === 0) {
      stateManager.set(key, value);
      if (persister) persister.save(stateManager.getAll());
      return;
    }

    const meta: ChangeMeta = { sourceTabId: tabId, isLocal: true, timestamp: Date.now() };
    const { value: finalValue, rejected } = runMiddleware(middlewares, {
      key,
      value,
      previousValue: stateManager.get(key),
      meta,
    });

    if (rejected) {
      log('🚫', `Middleware rejected set("${String(key)}")`);
      return;
    }

    stateManager.set(key, finalValue as TState[K]);
    notifyMiddleware(middlewares, key, finalValue, meta);
    if (persister) persister.save(stateManager.getAll());
  }

  function middlewarePatch(partial: Partial<TState>): void {
    assertAlive();
    if (middlewares.length === 0) {
      stateManager.patch(partial);
      if (persister) persister.save(stateManager.getAll());
      return;
    }

    const meta: ChangeMeta = { sourceTabId: tabId, isLocal: true, timestamp: Date.now() };
    const filtered: Partial<TState> = {};
    const appliedKeys: (keyof TState)[] = [];

    for (const [key, value] of Object.entries(partial)) {
      const k = key as keyof TState;
      const { value: finalValue, rejected } = runMiddleware(middlewares, {
        key: k,
        value,
        previousValue: stateManager.get(k),
        meta,
      });

      if (!rejected) {
        (filtered as Record<string, unknown>)[key] = finalValue;
        appliedKeys.push(k);
      }
    }

    if (Object.keys(filtered).length > 0) {
      stateManager.patch(filtered);
      for (const k of appliedKeys) {
        notifyMiddleware(middlewares, k, stateManager.get(k), meta);
      }
      if (persister) persister.save(stateManager.getAll());
    }
  }

  // ── Public instance ──

  const instance: TabSyncInstance<TState, TRPCMap> = {
    // State
    get: <K extends keyof TState>(key: K) => stateManager.get(key),
    getAll: () => stateManager.getAll(),
    set: middlewareSet,
    patch: middlewarePatch,

    transaction: (fn: (state: Readonly<TState>) => Partial<TState> | null): void => {
      assertAlive();
      const current = stateManager.getAll();
      const result = fn(current);
      if (result === null) return;
      middlewarePatch(result);
    },

    // Subscriptions
    on: <K extends keyof TState>(
      key: K,
      callback: (value: TState[K], meta: ChangeMeta) => void,
    ) => stateManager.on(key, callback),

    once: <K extends keyof TState>(
      key: K,
      callback: (value: TState[K], meta: ChangeMeta) => void,
    ) => {
      const unsub = stateManager.on(key, ((value: unknown, meta: ChangeMeta) => {
        unsub();
        callback(value as TState[K], meta);
      }) as (value: TState[K], meta: ChangeMeta) => void);
      return unsub;
    },

    onChange: (
      callback: (
        state: Readonly<TState>,
        changedKeys: (keyof TState)[],
        meta: ChangeMeta,
      ) => void,
    ) => stateManager.onChange(callback),

    select: <TResult>(
      selector: (state: Readonly<TState>) => TResult,
      callback: (result: TResult, meta: ChangeMeta) => void,
      options?: {
        isEqual?: (a: TResult, b: TResult) => boolean;
        debounce?: number;
      },
    ) => {
      const isEqual = options?.isEqual ?? Object.is;
      const debounceMs = options?.debounce;
      let prev = selector(stateManager.getAll());
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const unsub = stateManager.onChange((state, _keys, meta) => {
        const next = selector(state);
        if (!isEqual(prev, next)) {
          prev = next;
          if (debounceMs !== undefined && debounceMs > 0) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              debounceTimer = null;
              callback(prev, meta);
            }, debounceMs);
          } else {
            callback(next, meta);
          }
        }
      });

      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        unsub();
      };
    },

    // Leader
    isLeader: () => election?.isLeader() ?? true,

    onLeader: (callback: () => void | (() => void)) => {
      if (!election) {
        const cleanup = callback();
        return () => {
          if (typeof cleanup === 'function') cleanup();
        };
      }
      return election.onLeader(callback);
    },

    getLeader: (): TabInfo | null => {
      const leaderId = election?.getLeaderId();
      if (!leaderId) return null;
      return registry.getTab(leaderId) ?? null;
    },

    waitForLeader: (): Promise<TabInfo> => {
      if (!leaderEnabled) {
        const selfInfo = registry.getTab(tabId);
        if (selfInfo) return Promise.resolve(selfInfo);
        return Promise.reject(
          new TabSyncError('Leader election is disabled', ErrorCode.RPC_NO_LEADER),
        );
      }

      const leader = instance.getLeader();
      if (leader) return Promise.resolve(leader);

      return new Promise<TabInfo>((resolve) => {
        const unsubs: (() => void)[] = [];
        const check = () => {
          const l = instance.getLeader();
          if (l) {
            for (const u of unsubs) u();
            resolve(l);
          }
        };
        unsubs.push(registry.onTabChange(check));
        if (election) {
          unsubs.push(election.onLeader(() => { check(); return () => {}; }));
        }
      });
    },

    // Tabs
    id: tabId,
    getTabs: () => registry.getTabs(),
    getTabCount: () => registry.getTabCount(),
    onTabChange: (callback) => registry.onTabChange(callback),

    // RPC
    call: ((target: string | 'leader', method: string, args?: unknown, timeout?: number) => {
      assertAlive();
      return rpc.call(target, method, args, timeout);
    }) as TabSyncInstance<TState, TRPCMap>['call'],

    handle: ((method: string, handler: (args: unknown, callerTabId: string) => unknown) => {
      assertAlive();
      return rpc.handle(method, handler);
    }) as TabSyncInstance<TState, TRPCMap>['handle'],

    callAll: ((method: string, args?: unknown, timeout?: number) => {
      assertAlive();
      return rpc.callAll(method, args, timeout);
    }) as TabSyncInstance<TState, TRPCMap>['callAll'],

    // Lifecycle
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      ready = false;

      stateManager.flush();
      persister?.destroy();
      destroyMiddleware(middlewares);
      election?.destroy();
      registry.destroy();
      rpc.destroy();
      stateManager.destroy();
      unsubChannel();
      channel.close();

      log('💀', 'Instance destroyed');
    },

    get ready() {
      return ready;
    },
  };

  log('🚀', 'Instance created', { channel: channelName, leader: leaderEnabled });

  return instance;
}
