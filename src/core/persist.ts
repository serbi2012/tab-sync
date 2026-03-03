import type { PersistOptions } from '../types';
import { hasLocalStorage } from '../utils/env';

const DEFAULT_KEY = 'tab-sync:state';

export function resolvePersistOptions<TState extends Record<string, unknown>>(
  opt: PersistOptions<TState> | boolean | undefined,
): PersistOptions<TState> | null {
  if (!opt) return null;
  if (opt === true) return {};
  return opt;
}

export function loadPersistedState<TState extends Record<string, unknown>>(
  opts: PersistOptions<TState>,
): Partial<TState> {
  const storage = opts.storage ?? (hasLocalStorage ? localStorage : null);
  if (!storage) return {};
  const key = opts.key ?? DEFAULT_KEY;
  const versionKey = `${key}:version`;
  const deserialize = opts.deserialize ?? JSON.parse;
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    let parsed = deserialize(raw) as Partial<TState>;

    if (opts.version !== undefined && opts.migrate) {
      const rawVersion = storage.getItem(versionKey);
      const oldVersion = rawVersion ? Number(rawVersion) : 0;
      if (oldVersion !== opts.version) {
        parsed = opts.migrate(parsed, oldVersion);
        const serialize = opts.serialize ?? JSON.stringify;
        storage.setItem(key, serialize(parsed));
        storage.setItem(versionKey, String(opts.version));
      }
    }

    return filterPersistKeys(parsed, opts);
  } catch {
    return {};
  }
}

export function filterPersistKeys<TState extends Record<string, unknown>>(
  state: Partial<TState>,
  opts: PersistOptions<TState>,
): Partial<TState> {
  const include = opts.include ? new Set(opts.include) : null;
  const exclude = opts.exclude ? new Set(opts.exclude) : null;
  const result: Partial<TState> = {};
  for (const [key, value] of Object.entries(state)) {
    const k = key as keyof TState;
    if (exclude?.has(k)) continue;
    if (include && !include.has(k)) continue;
    (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

export interface PersistSaver<TState extends Record<string, unknown>> {
  save: (state: Readonly<TState>) => void;
  flush: () => void;
  destroy: () => void;
}

export function createPersistSaver<TState extends Record<string, unknown>>(
  opts: PersistOptions<TState>,
  onError: (e: Error) => void,
): PersistSaver<TState> {
  const storage = opts.storage ?? (hasLocalStorage ? localStorage : null);
  if (!storage) return { save() {}, flush() {}, destroy() {} };

  const key = opts.key ?? DEFAULT_KEY;
  const serialize = opts.serialize ?? JSON.stringify;
  const debounce = opts.debounce ?? 100;
  const versionKey = `${key}:version`;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestState: Readonly<TState> | null = null;

  function doSave() {
    if (!latestState) return;
    try {
      const filtered = filterPersistKeys({ ...latestState } as Partial<TState>, opts);
      storage!.setItem(key, serialize(filtered));
      if (opts.version !== undefined) {
        storage!.setItem(versionKey, String(opts.version));
      }
    } catch (e) {
      onError(e instanceof Error ? e : new Error(String(e)));
    }
    latestState = null;
  }

  return {
    save(state: Readonly<TState>) {
      latestState = state;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          doSave();
        }, debounce);
      }
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      doSave();
    },
    destroy() {
      if (timer) { clearTimeout(timer); timer = null; }
      doSave();
    },
  };
}
