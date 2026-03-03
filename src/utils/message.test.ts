import { describe, it, expect } from 'vitest';
import { createMessage } from './message';
import { PROTOCOL_VERSION } from '../types';

describe('createMessage', () => {
  it('creates a message with correct structure', () => {
    const msg = createMessage('TAB_ANNOUNCE', 'tab-1', {
      createdAt: 1000,
      url: 'http://localhost',
    });

    expect(msg.type).toBe('TAB_ANNOUNCE');
    expect(msg.senderId).toBe('tab-1');
    expect(msg.version).toBe(PROTOCOL_VERSION);
    expect(msg.payload).toEqual({ createdAt: 1000, url: 'http://localhost' });
    expect(msg.timestamp).toBeTypeOf('number');
    expect(msg.targetId).toBeUndefined();
  });

  it('includes targetId when provided', () => {
    const msg = createMessage(
      'RPC_REQUEST',
      'tab-1',
      { callId: 'c1', method: 'test', args: null },
      'tab-2',
    );

    expect(msg.targetId).toBe('tab-2');
  });

  it('produces monotonically increasing timestamps', () => {
    const msg1 = createMessage('TAB_GOODBYE', 'tab-1', undefined as never);
    const msg2 = createMessage('TAB_GOODBYE', 'tab-1', undefined as never);
    expect(msg2.timestamp).toBeGreaterThanOrEqual(msg1.timestamp);
  });
});
