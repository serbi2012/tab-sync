import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { tabSync } from '../../src/zustand/middleware';
import type { TabSyncInstance } from '../../src/types';

// ── Mock BroadcastChannel ───────────────────────────────────────────────────

class MockBroadcastChannel {
  static instances = new Map<string, Set<MockBroadcastChannel>>();
  name: string;
  private listeners: Array<(event: MessageEvent) => void> = [];

  constructor(name: string) {
    this.name = name;
    const set = MockBroadcastChannel.instances.get(name) ?? new Set();
    set.add(this);
    MockBroadcastChannel.instances.set(name, set);
  }

  postMessage(data: unknown) {
    const peers = MockBroadcastChannel.instances.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === this) continue;
      const event = new MessageEvent('message', { data });
      for (const listener of peer.listeners) {
        queueMicrotask(() => listener(event));
      }
    }
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.push(listener);
  }

  removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  close() {
    MockBroadcastChannel.instances.get(this.name)?.delete(this);
    this.listeners = [];
  }

  static reset() {
    MockBroadcastChannel.instances.clear();
  }
}

const original_bc = globalThis.BroadcastChannel;

beforeEach(() => {
  vi.useFakeTimers();
  MockBroadcastChannel.reset();
  (globalThis as Record<string, unknown>).BroadcastChannel = MockBroadcastChannel;
});

afterEach(() => {
  vi.useRealTimers();
  if (original_bc) {
    globalThis.BroadcastChannel = original_bc;
  } else {
    delete (globalThis as Record<string, unknown>).BroadcastChannel;
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

interface TestState {
  count: number;
  theme: string;
  inc: () => void;
  setTheme: (t: string) => void;
}

function createTestStore(channel: string) {
  return createStore<TestState>()(
    tabSync(
      (set) => ({
        count: 0,
        theme: 'light',
        inc: () => set((s) => ({ count: s.count + 1 })),
        setTheme: (t: string) => set({ theme: t }),
      }),
      { channel },
    ),
  );
}

async function flushSync() {
  vi.advanceTimersByTime(20);
  await vi.advanceTimersByTimeAsync(0);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('tabSync middleware — basic store', () => {
  it('creates a store with initial state intact', () => {
    const store = createTestStore('basic-1');
    const state = store.getState();

    expect(state.count).toBe(0);
    expect(state.theme).toBe('light');
    expect(typeof state.inc).toBe('function');
    expect(typeof state.setTheme).toBe('function');
  });

  it('local set works correctly', () => {
    const store = createTestStore('basic-2');

    store.getState().inc();
    expect(store.getState().count).toBe(1);

    store.getState().setTheme('dark');
    expect(store.getState().theme).toBe('dark');
  });
});

describe('tabSync middleware — cross-tab sync', () => {
  it('syncs state changes from store A to store B', async () => {
    const store_a = createTestStore('sync-1');
    const store_b = createTestStore('sync-1');

    store_a.getState().inc();
    await flushSync();

    expect(store_b.getState().count).toBe(1);
  });

  it('syncs multiple keys via patch-style set', async () => {
    const store_a = createTestStore('sync-2');
    const store_b = createTestStore('sync-2');

    store_a.setState({ count: 10, theme: 'dark' });
    await flushSync();

    expect(store_b.getState().count).toBe(10);
    expect(store_b.getState().theme).toBe('dark');
  });

  it('syncs bidirectionally', async () => {
    const store_a = createTestStore('sync-3');
    const store_b = createTestStore('sync-3');

    store_a.getState().inc();
    await flushSync();
    expect(store_b.getState().count).toBe(1);

    store_b.getState().setTheme('dark');
    await flushSync();
    expect(store_a.getState().theme).toBe('dark');
  });

  it('preserves actions (functions) after remote sync', async () => {
    const store_a = createTestStore('sync-4');
    const store_b = createTestStore('sync-4');

    store_a.getState().inc();
    await flushSync();

    expect(typeof store_b.getState().inc).toBe('function');
    expect(typeof store_b.getState().setTheme).toBe('function');

    store_b.getState().inc();
    expect(store_b.getState().count).toBe(2);
  });
});

describe('tabSync middleware — include/exclude', () => {
  it('only syncs keys listed in include', async () => {
    const store_a = createStore<TestState>()(
      tabSync(
        (set) => ({
          count: 0,
          theme: 'light',
          inc: () => set((s) => ({ count: s.count + 1 })),
          setTheme: (t: string) => set({ theme: t }),
        }),
        { channel: 'filter-1', include: ['count'] },
      ),
    );

    const store_b = createStore<TestState>()(
      tabSync(
        (set) => ({
          count: 0,
          theme: 'light',
          inc: () => set((s) => ({ count: s.count + 1 })),
          setTheme: (t: string) => set({ theme: t }),
        }),
        { channel: 'filter-1', include: ['count'] },
      ),
    );

    store_a.setState({ count: 5, theme: 'dark' });
    await flushSync();

    expect(store_b.getState().count).toBe(5);
    expect(store_b.getState().theme).toBe('light');
  });

  it('excludes keys listed in exclude', async () => {
    const store_a = createStore<TestState>()(
      tabSync(
        (set) => ({
          count: 0,
          theme: 'light',
          inc: () => set((s) => ({ count: s.count + 1 })),
          setTheme: (t: string) => set({ theme: t }),
        }),
        { channel: 'filter-2', exclude: ['theme'] },
      ),
    );

    const store_b = createStore<TestState>()(
      tabSync(
        (set) => ({
          count: 0,
          theme: 'light',
          inc: () => set((s) => ({ count: s.count + 1 })),
          setTheme: (t: string) => set({ theme: t }),
        }),
        { channel: 'filter-2', exclude: ['theme'] },
      ),
    );

    store_a.setState({ count: 5, theme: 'dark' });
    await flushSync();

    expect(store_b.getState().count).toBe(5);
    expect(store_b.getState().theme).toBe('light');
  });

  it('throws when both include and exclude are provided', () => {
    expect(() => {
      createStore(
        tabSync(
          (set) => ({ count: 0, inc: () => set({ count: 1 }) }),
          { channel: 'err-1', include: ['count'], exclude: ['count'] } as never,
        ),
      );
    }).toThrow('`include` and `exclude` are mutually exclusive');
  });
});

describe('tabSync middleware — function exclusion', () => {
  it('never syncs function values to other tabs', async () => {
    const store_a = createTestStore('fn-1');
    const store_b = createTestStore('fn-1');

    const original_inc = store_b.getState().inc;

    store_a.getState().inc();
    await flushSync();

    expect(store_b.getState().inc).toBe(original_inc);
  });
});

describe('tabSync middleware — onSyncReady', () => {
  it('invokes onSyncReady with the tab-bridge instance', () => {
    let captured_instance: TabSyncInstance<Record<string, unknown>> | null = null;

    createStore(
      tabSync(
        (set) => ({ count: 0, inc: () => set({ count: 1 }) }),
        {
          channel: 'ready-1',
          onSyncReady: (instance) => {
            captured_instance = instance;
          },
        },
      ),
    );

    expect(captured_instance).not.toBeNull();
    expect(typeof captured_instance!.id).toBe('string');
    expect(typeof captured_instance!.destroy).toBe('function');

    captured_instance!.destroy();
  });
});

describe('tabSync middleware — no circular updates', () => {
  it('does not re-broadcast remote state changes', async () => {
    const on_error = vi.fn();

    let instance_a: TabSyncInstance<Record<string, unknown>> | null = null;

    createStore<TestState>()(
      tabSync(
        (set) => ({
          count: 0,
          theme: 'light',
          inc: () => set((s) => ({ count: s.count + 1 })),
          setTheme: (t: string) => set({ theme: t }),
        }),
        {
          channel: 'circular-1',
          onError: on_error,
          onSyncReady: (i) => { instance_a = i; },
        },
      ),
    );

    const store_b = createTestStore('circular-1');
    const subscribe_spy = vi.fn();
    store_b.subscribe(subscribe_spy);

    store_b.getState().inc();
    await flushSync();

    const call_count_after_first = subscribe_spy.mock.calls.length;

    await flushSync();
    await flushSync();

    expect(subscribe_spy.mock.calls.length).toBe(call_count_after_first);
    expect(on_error).not.toHaveBeenCalled();

    instance_a?.destroy();
  });
});

describe('tabSync middleware — default channel name', () => {
  it('uses tab-sync-zustand as default channel', () => {
    let captured_instance: TabSyncInstance<Record<string, unknown>> | null = null;

    createStore(
      tabSync(
        (set) => ({ count: 0, inc: () => set({ count: 1 }) }),
        {
          onSyncReady: (instance) => {
            captured_instance = instance;
          },
        },
      ),
    );

    expect(captured_instance).not.toBeNull();
    captured_instance!.destroy();
  });
});
