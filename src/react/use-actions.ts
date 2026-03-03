import { useContext, useMemo } from 'react';
import type { TabSyncInstance } from '../types';
import { TabSyncContext } from './context';

export interface TabSyncActions<TState extends Record<string, unknown>> {
  set: TabSyncInstance<TState>['set'];
  patch: TabSyncInstance<TState>['patch'];
  transaction: TabSyncInstance<TState>['transaction'];
}

/**
 * Returns `set`, `patch`, and `transaction` without subscribing to state.
 * Components using only this hook never re-render due to state changes.
 *
 * ```tsx
 * const { set, patch, transaction } = useTabSyncActions();
 * ```
 *
 * Must be used within a `<TabSyncProvider>`.
 */
export function useTabSyncActions<
  TState extends Record<string, unknown> = Record<string, unknown>,
>(): TabSyncActions<TState> {
  const instance = useContext(TabSyncContext) as TabSyncInstance<TState> | null;

  if (!instance) {
    throw new Error('useTabSyncActions must be used within a <TabSyncProvider>');
  }

  return useMemo(
    () => ({
      set: instance.set.bind(instance),
      patch: instance.patch.bind(instance),
      transaction: instance.transaction.bind(instance),
    }),
    [instance],
  );
}
