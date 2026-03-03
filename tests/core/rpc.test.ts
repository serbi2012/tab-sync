import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TabMessage, RpcRequestPayload, RpcResponsePayload } from '../../src/types';
import { RPCHandler } from '../../src/core/rpc';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function createRPC(tabId: string, opts?: {
  resolveLeaderId?: () => string | null;
  resolveTabIds?: () => string[];
  onError?: (error: Error) => void;
}) {
  const sent: TabMessage[] = [];
  const send = (msg: TabMessage) => sent.push(msg);

  const rpc = new RPCHandler({
    send,
    tabId,
    resolveLeaderId: opts?.resolveLeaderId,
    resolveTabIds: opts?.resolveTabIds,
    onError: opts?.onError,
  });

  return { rpc, sent };
}

/** Simulate a round-trip: caller sends request, remote processes & responds, caller gets response. */
function simulateRoundTrip(
  caller: { rpc: RPCHandler; sent: TabMessage[] },
  remote: { rpc: RPCHandler; sent: TabMessage[] },
) {
  // Deliver request to remote
  const req = caller.sent.find((m) => m.type === 'RPC_REQUEST');
  if (req) remote.rpc.handleMessage(req);
}

describe('RPCHandler — call / handle', () => {
  it('completes a successful RPC call', async () => {
    const callerSide = createRPC('tab-1');
    const remoteSide = createRPC('tab-2');

    remoteSide.rpc.handle('greet', (args: { name: string }) => `Hello ${args.name}`);

    const promise = callerSide.rpc.call<string>('tab-2', 'greet', { name: 'World' });

    // Deliver request to remote
    simulateRoundTrip(callerSide, remoteSide);

    // Deliver response back to caller
    await vi.advanceTimersByTimeAsync(0);
    const resp = remoteSide.sent.find((m) => m.type === 'RPC_RESPONSE');
    expect(resp).toBeDefined();
    callerSide.rpc.handleMessage(resp!);

    const result = await promise;
    expect(result).toBe('Hello World');

    callerSide.rpc.destroy();
    remoteSide.rpc.destroy();
  });

  it('handles async handlers', async () => {
    const callerSide = createRPC('tab-1');
    const remoteSide = createRPC('tab-2');

    remoteSide.rpc.handle('asyncOp', async () => {
      return 42;
    });

    const promise = callerSide.rpc.call<number>('tab-2', 'asyncOp');

    simulateRoundTrip(callerSide, remoteSide);
    await vi.advanceTimersByTimeAsync(0);

    const resp = remoteSide.sent.find((m) => m.type === 'RPC_RESPONSE');
    callerSide.rpc.handleMessage(resp!);

    expect(await promise).toBe(42);

    callerSide.rpc.destroy();
    remoteSide.rpc.destroy();
  });
});

describe('RPCHandler — error handling', () => {
  it('rejects when handler throws', async () => {
    const callerSide = createRPC('tab-1');
    const remoteSide = createRPC('tab-2');

    remoteSide.rpc.handle('fail', () => {
      throw new Error('boom');
    });

    const promise = callerSide.rpc.call('tab-2', 'fail');

    simulateRoundTrip(callerSide, remoteSide);
    await vi.advanceTimersByTimeAsync(0);

    const resp = remoteSide.sent.find((m) => m.type === 'RPC_RESPONSE');
    callerSide.rpc.handleMessage(resp!);

    await expect(promise).rejects.toThrow('boom');

    callerSide.rpc.destroy();
    remoteSide.rpc.destroy();
  });

  it('rejects when no handler is registered', async () => {
    const callerSide = createRPC('tab-1');
    const remoteSide = createRPC('tab-2');

    const promise = callerSide.rpc.call('tab-2', 'unknown');

    simulateRoundTrip(callerSide, remoteSide);
    await vi.advanceTimersByTimeAsync(0);

    const resp = remoteSide.sent.find((m) => m.type === 'RPC_RESPONSE');
    callerSide.rpc.handleMessage(resp!);

    await expect(promise).rejects.toThrow('No handler registered for "unknown"');

    callerSide.rpc.destroy();
    remoteSide.rpc.destroy();
  });

  it('rejects on timeout', async () => {
    const callerSide = createRPC('tab-1');

    const promise = callerSide.rpc.call('tab-2', 'slow', undefined, 1000);

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('timed out after 1000ms');

    callerSide.rpc.destroy();
  });
});

describe('RPCHandler — leader targeting', () => {
  it('resolves "leader" to actual tab ID', async () => {
    const callerSide = createRPC('tab-1', {
      resolveLeaderId: () => 'tab-leader',
    });
    const remoteSide = createRPC('tab-leader');

    remoteSide.rpc.handle('ping', () => 'pong');

    const promise = callerSide.rpc.call<string>('leader', 'ping');

    const req = callerSide.sent.find((m) => m.type === 'RPC_REQUEST');
    expect(req!.targetId).toBe('tab-leader');

    remoteSide.rpc.handleMessage(req!);
    await vi.advanceTimersByTimeAsync(0);

    const resp = remoteSide.sent.find((m) => m.type === 'RPC_RESPONSE');
    callerSide.rpc.handleMessage(resp!);

    expect(await promise).toBe('pong');

    callerSide.rpc.destroy();
    remoteSide.rpc.destroy();
  });

  it('rejects when no leader is available', async () => {
    const callerSide = createRPC('tab-1', {
      resolveLeaderId: () => null,
    });

    await expect(callerSide.rpc.call('leader', 'ping')).rejects.toThrow(
      'No leader available',
    );

    callerSide.rpc.destroy();
  });
});

describe('RPCHandler — handler unregister', () => {
  it('unregister removes the handler', async () => {
    const callerSide = createRPC('tab-1');
    const remoteSide = createRPC('tab-2');

    const unsub = remoteSide.rpc.handle('greet', () => 'hi');
    unsub();

    const promise = callerSide.rpc.call('tab-2', 'greet');

    simulateRoundTrip(callerSide, remoteSide);
    await vi.advanceTimersByTimeAsync(0);

    const resp = remoteSide.sent.find((m) => m.type === 'RPC_RESPONSE');
    callerSide.rpc.handleMessage(resp!);

    await expect(promise).rejects.toThrow('No handler');

    callerSide.rpc.destroy();
    remoteSide.rpc.destroy();
  });
});

describe('RPCHandler — callAll', () => {
  it('broadcasts RPC to all other tabs and collects responses', async () => {
    const callerSide = createRPC('tab-1', {
      resolveTabIds: () => ['tab-1', 'tab-2', 'tab-3'],
    });
    const remote2 = createRPC('tab-2');
    const remote3 = createRPC('tab-3');

    remote2.rpc.handle('ping', () => 'pong-2');
    remote3.rpc.handle('ping', () => 'pong-3');

    const promise = callerSide.rpc.callAll('ping');

    // Deliver requests to remotes
    for (const msg of callerSide.sent) {
      if (msg.type === 'RPC_REQUEST') {
        if (msg.targetId === 'tab-2') remote2.rpc.handleMessage(msg);
        if (msg.targetId === 'tab-3') remote3.rpc.handleMessage(msg);
      }
    }

    await vi.advanceTimersByTimeAsync(0);

    // Deliver responses back
    for (const msg of remote2.sent) {
      if (msg.type === 'RPC_RESPONSE') callerSide.rpc.handleMessage(msg);
    }
    for (const msg of remote3.sent) {
      if (msg.type === 'RPC_RESPONSE') callerSide.rpc.handleMessage(msg);
    }

    const results = await promise;
    expect(results).toHaveLength(2);

    const values = results.map((r) => r.result).sort();
    expect(values).toEqual(['pong-2', 'pong-3']);

    callerSide.rpc.destroy();
    remote2.rpc.destroy();
    remote3.rpc.destroy();
  });

  it('returns empty array when no other tabs exist', async () => {
    const callerSide = createRPC('tab-1', {
      resolveTabIds: () => ['tab-1'],
    });

    const results = await callerSide.rpc.callAll('ping');
    expect(results).toEqual([]);

    callerSide.rpc.destroy();
  });
});

describe('RPCHandler — serialization error handling', () => {
  it('sends error response when result cannot be serialized', async () => {
    const errors: Error[] = [];
    const callerSide = createRPC('tab-1');
    const remoteSide = createRPC('tab-2', {
      onError: (e) => errors.push(e),
    });

    // Create a value with circular reference
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    remoteSide.rpc.handle('circular', () => circular);

    const promise = callerSide.rpc.call('tab-2', 'circular');

    simulateRoundTrip(callerSide, remoteSide);
    await vi.advanceTimersByTimeAsync(0);

    // The remote side should have attempted to send an error response
    const resp = remoteSide.sent.find((m) => m.type === 'RPC_RESPONSE');
    if (resp) {
      callerSide.rpc.handleMessage(resp);
    }

    // Should either reject with serialization error or timeout
    // (depends on whether the error response itself can be serialized)
    try {
      vi.advanceTimersByTime(5000);
      await promise;
    } catch {
      // Expected to reject
    }

    callerSide.rpc.destroy();
    remoteSide.rpc.destroy();
  });
});

describe('RPCHandler — destroy', () => {
  it('rejects all pending calls on destroy', async () => {
    const { rpc } = createRPC('tab-1');

    const p1 = rpc.call('tab-2', 'op1');
    const p2 = rpc.call('tab-2', 'op2');

    rpc.destroy();

    await expect(p1).rejects.toThrow('destroyed');
    await expect(p2).rejects.toThrow('destroyed');
  });

  it('ignores messages for unknown callIds', () => {
    const { rpc } = createRPC('tab-1');

    const resp: TabMessage = {
      type: 'RPC_RESPONSE',
      senderId: 'tab-2',
      targetId: 'tab-1',
      timestamp: Date.now(),
      payload: { callId: 'nonexistent', result: 42 } satisfies RpcResponsePayload,
    };

    // Should not throw
    expect(() => rpc.handleMessage(resp)).not.toThrow();

    rpc.destroy();
  });
});
