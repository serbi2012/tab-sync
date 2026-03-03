import { useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { TabSyncInstance, TabInfo } from '../types';
import { TabSyncContext } from './context';

/**
 * Subscribe to the current leader's full `TabInfo`.
 * Returns `null` if no leader has been elected yet.
 *
 * ```tsx
 * const leader = useLeaderInfo();
 * // leader: TabInfo | null
 * ```
 *
 * Must be used within a `<TabSyncProvider>`.
 */
export function useLeaderInfo(): TabInfo | null {
  const instance = useContext(TabSyncContext) as TabSyncInstance<
    Record<string, unknown>
  > | null;

  if (!instance) {
    throw new Error('useLeaderInfo must be used within a <TabSyncProvider>');
  }

  const leaderRef = useRef<TabInfo | null>(instance.getLeader());

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubs: (() => void)[] = [];

      unsubs.push(
        instance.onTabChange(() => {
          const next = instance.getLeader();
          if (next?.id !== leaderRef.current?.id) {
            leaderRef.current = next;
            onStoreChange();
          }
        }),
      );

      unsubs.push(
        instance.onLeader(() => {
          leaderRef.current = instance.getLeader();
          onStoreChange();
          return () => {
            leaderRef.current = instance.getLeader();
            onStoreChange();
          };
        }),
      );

      return () => {
        for (const u of unsubs) u();
      };
    },
    [instance],
  );

  const getSnapshot = useCallback(() => leaderRef.current, []);
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
