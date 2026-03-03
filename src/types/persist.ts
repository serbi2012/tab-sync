export interface PersistOptions<
  TState extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Storage key. Default: `'tab-sync:state'` */
  key?: string;
  /** Only persist these keys (whitelist). */
  include?: (keyof TState)[];
  /** Exclude these keys from persistence (blacklist). */
  exclude?: (keyof TState)[];
  /** Custom serializer. Default: `JSON.stringify` */
  serialize?: (state: Partial<TState>) => string;
  /** Custom deserializer. Default: `JSON.parse` */
  deserialize?: (raw: string) => Partial<TState>;
  /** Debounce persistence writes in ms. Default: `100` */
  debounce?: number;
  /** Custom storage backend. Default: `localStorage` */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /**
   * Schema version for state migration. When the persisted version
   * differs from this value, `migrate` is called.
   */
  version?: number;
  /**
   * Migration function called when persisted version differs from current.
   *
   * ```ts
   * persist: {
   *   version: 2,
   *   migrate: (oldState, oldVersion) => ({
   *     ...oldState,
   *     newField: oldVersion < 2 ? 'default' : oldState.newField,
   *   }),
   * }
   * ```
   */
  migrate?: (oldState: Partial<TState>, oldVersion: number) => Partial<TState>;
}
