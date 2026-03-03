import { describe, it, expect, vi } from 'vitest';
import { runMiddleware, notifyMiddleware, destroyMiddleware } from './middleware';
import type { Middleware, MiddlewareContext, ChangeMeta } from '../types';

type TestState = { name: string; age: number };

const makeMeta = (overrides?: Partial<ChangeMeta>): ChangeMeta => ({
  sourceTabId: 'tab-1',
  isLocal: true,
  timestamp: Date.now(),
  ...overrides,
});

const makeCtx = (
  overrides?: Partial<MiddlewareContext<TestState>>,
): MiddlewareContext<TestState> => ({
  key: 'name',
  value: 'Alice',
  previousValue: '',
  meta: makeMeta(),
  ...overrides,
});

describe('runMiddleware', () => {
  it('passes through when no middlewares have onSet', () => {
    const mw: Middleware<TestState>[] = [{ name: 'empty' }];
    const result = runMiddleware(mw, makeCtx());
    expect(result).toEqual({ value: 'Alice', rejected: false });
  });

  it('allows value transformation via { value }', () => {
    const mw: Middleware<TestState>[] = [
      { name: 'trim', onSet: (ctx) => ({ value: String(ctx.value).trim() }) },
    ];
    const result = runMiddleware(mw, makeCtx({ value: '  Bob  ' }));
    expect(result).toEqual({ value: 'Bob', rejected: false });
  });

  it('rejects change when onSet returns false', () => {
    const mw: Middleware<TestState>[] = [
      {
        name: 'validator',
        onSet: (ctx) => (ctx.key === 'age' && (ctx.value as number) < 0 ? false : undefined),
      },
    ];
    const result = runMiddleware(mw, makeCtx({ key: 'age', value: -1 }));
    expect(result.rejected).toBe(true);
  });

  it('chains multiple middlewares in order', () => {
    const mw: Middleware<TestState>[] = [
      { name: 'upper', onSet: (ctx) => ({ value: String(ctx.value).toUpperCase() }) },
      { name: 'prefix', onSet: (ctx) => ({ value: `Mr. ${ctx.value}` }) },
    ];
    const result = runMiddleware(mw, makeCtx({ value: 'alice' }));
    expect(result).toEqual({ value: 'Mr. ALICE', rejected: false });
  });

  it('stops pipeline on rejection', () => {
    const secondOnSet = vi.fn();
    const mw: Middleware<TestState>[] = [
      { name: 'blocker', onSet: () => false },
      { name: 'never-reached', onSet: secondOnSet },
    ];
    runMiddleware(mw, makeCtx());
    expect(secondOnSet).not.toHaveBeenCalled();
  });
});

describe('notifyMiddleware', () => {
  it('calls afterChange on all middlewares', () => {
    const afterChange1 = vi.fn();
    const afterChange2 = vi.fn();
    const mw: Middleware<TestState>[] = [
      { name: 'a', afterChange: afterChange1 },
      { name: 'b', afterChange: afterChange2 },
    ];
    const meta = makeMeta();
    notifyMiddleware(mw, 'name', 'Alice', meta);
    expect(afterChange1).toHaveBeenCalledWith('name', 'Alice', meta);
    expect(afterChange2).toHaveBeenCalledWith('name', 'Alice', meta);
  });

  it('skips middlewares without afterChange', () => {
    const mw: Middleware<TestState>[] = [{ name: 'no-hook' }];
    expect(() => notifyMiddleware(mw, 'name', 'test', makeMeta())).not.toThrow();
  });
});

describe('destroyMiddleware', () => {
  it('calls onDestroy on all middlewares', () => {
    const destroy1 = vi.fn();
    const destroy2 = vi.fn();
    const mw: Middleware<TestState>[] = [
      { name: 'a', onDestroy: destroy1 },
      { name: 'b', onDestroy: destroy2 },
    ];
    destroyMiddleware(mw);
    expect(destroy1).toHaveBeenCalledOnce();
    expect(destroy2).toHaveBeenCalledOnce();
  });

  it('skips middlewares without onDestroy', () => {
    const mw: Middleware<TestState>[] = [{ name: 'no-hook' }];
    expect(() => destroyMiddleware(mw)).not.toThrow();
  });
});
