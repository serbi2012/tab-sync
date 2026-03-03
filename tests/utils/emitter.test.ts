import { describe, it, expect, vi } from 'vitest';
import { Emitter } from '../../src/utils/emitter';

interface TestEvents {
  click: { x: number; y: number };
  close: void;
  data: string;
}

describe('Emitter', () => {
  it('calls handler when event is emitted', () => {
    const bus = new Emitter<TestEvents>();
    const handler = vi.fn();
    bus.on('click', handler);
    bus.emit('click', { x: 1, y: 2 });
    expect(handler).toHaveBeenCalledWith({ x: 1, y: 2 });
  });

  it('supports multiple handlers for the same event', () => {
    const bus = new Emitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('click', h1);
    bus.on('click', h2);
    bus.emit('click', { x: 0, y: 0 });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('returns unsubscribe function from on()', () => {
    const bus = new Emitter<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('data', handler);
    bus.emit('data', 'hello');
    expect(handler).toHaveBeenCalledOnce();

    off();
    bus.emit('data', 'world');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('once() fires handler only once', () => {
    const bus = new Emitter<TestEvents>();
    const handler = vi.fn();
    bus.once('data', handler);
    bus.emit('data', 'first');
    bus.emit('data', 'second');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('first');
  });

  it('once() returns unsubscribe function that works before firing', () => {
    const bus = new Emitter<TestEvents>();
    const handler = vi.fn();
    const off = bus.once('data', handler);
    off();
    bus.emit('data', 'nope');
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles void events', () => {
    const bus = new Emitter<TestEvents>();
    const handler = vi.fn();
    bus.on('close', handler);
    bus.emit('close');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does nothing when emitting an event with no handlers', () => {
    const bus = new Emitter<TestEvents>();
    expect(() => bus.emit('data', 'test')).not.toThrow();
  });

  it('listenerCount returns correct count', () => {
    const bus = new Emitter<TestEvents>();
    expect(bus.listenerCount('click')).toBe(0);
    const off1 = bus.on('click', () => {});
    expect(bus.listenerCount('click')).toBe(1);
    bus.on('click', () => {});
    expect(bus.listenerCount('click')).toBe(2);
    off1();
    expect(bus.listenerCount('click')).toBe(1);
  });

  it('removeAll(event) removes handlers for specific event', () => {
    const bus = new Emitter<TestEvents>();
    const clickHandler = vi.fn();
    const dataHandler = vi.fn();
    bus.on('click', clickHandler);
    bus.on('data', dataHandler);

    bus.removeAll('click');
    bus.emit('click', { x: 0, y: 0 });
    bus.emit('data', 'test');
    expect(clickHandler).not.toHaveBeenCalled();
    expect(dataHandler).toHaveBeenCalledOnce();
  });

  it('removeAll() without args removes all handlers', () => {
    const bus = new Emitter<TestEvents>();
    const clickHandler = vi.fn();
    const dataHandler = vi.fn();
    bus.on('click', clickHandler);
    bus.on('data', dataHandler);

    bus.removeAll();
    bus.emit('click', { x: 0, y: 0 });
    bus.emit('data', 'test');
    expect(clickHandler).not.toHaveBeenCalled();
    expect(dataHandler).not.toHaveBeenCalled();
  });
});
