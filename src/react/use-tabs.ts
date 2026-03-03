import { useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { TabSyncInstance, TabInfo } from '../types';
import { TabSyncContext } from './context';

const SERVER_SNAPSHOT: TabInfo[] = [];

/**
 * Subscribe to the list of active tabs. Re-renders when tabs join or leave.
 *
 * ```tsx
 * const tabs = useTabs();
 * // tabs: TabInfo[]
 * ```
 *
 * Must be used within a `<TabSyncProvider>`.
 */
export function useTabs(): TabInfo[] {
  const instance = useContext(TabSyncContext) as TabSyncInstance<
    Record<string, unknown>
  > | null;

  if (!instance) {
    throw new Error('useTabs must be used within a <TabSyncProvider>');
  }

  const tabsRef = useRef(instance.getTabs());

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      instance.onTabChange((tabs) => {
        tabsRef.current = tabs;
        onStoreChange();
      }),
    [instance],
  );

  const getSnapshot = useCallback(() => tabsRef.current, []);
  const getServerSnapshot = useCallback(() => SERVER_SNAPSHOT, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
