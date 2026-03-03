# Next.js에서 tab-bridge 사용하기

> Next.js App Router (13.4+) 환경에서 `tab-bridge`를 안전하게 사용하는 방법을 설명합니다.

---

## 핵심 원칙

`tab-bridge`는 `BroadcastChannel`, `localStorage` 등 **브라우저 전용 API**를 사용합니다.  
Next.js의 SSR/RSC 환경에서는 이 API들이 존재하지 않으므로, 반드시 **클라이언트 사이드에서만 초기화**해야 합니다.

```
❌ 서버 컴포넌트에서 createTabSync() 호출
❌ 모듈 최상위 스코프에서 createTabSync() 호출
✅ 'use client' 컴포넌트의 useEffect 내부에서 초기화
✅ TabSyncProvider를 Client Component로 감싸서 사용
✅ Zustand 미들웨어를 dynamic import로 사용
```

---

## 방법 1: `TabSyncProvider` (권장)

`tab-bridge/react`의 `TabSyncProvider`는 내부적으로 `useRef`를 사용하여 인스턴스를 생성합니다.  
**반드시 Client Component에서만 사용**해야 합니다.

### 1단계: Client Component Provider 생성

```tsx
// app/providers/tab-sync-provider.tsx
'use client';

import { TabSyncProvider } from 'tab-bridge/react';

interface AppState extends Record<string, unknown> {
  theme: string;
  count: number;
}

export function AppTabSyncProvider({ children }: { children: React.ReactNode }) {
  return (
    <TabSyncProvider<AppState>
      options={{
        initial: { theme: 'light', count: 0 },
        channel: 'my-nextjs-app',
      }}
    >
      {children}
    </TabSyncProvider>
  );
}
```

### 2단계: Layout에서 Provider 적용

```tsx
// app/layout.tsx
import { AppTabSyncProvider } from './providers/tab-sync-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppTabSyncProvider>
          {children}
        </AppTabSyncProvider>
      </body>
    </html>
  );
}
```

### 3단계: Client Component에서 Hooks 사용

```tsx
// app/components/counter.tsx
'use client';

import { useTabSyncValue, useTabSyncActions } from 'tab-bridge/react';

export function Counter() {
  const count = useTabSyncValue<{ count: number }>('count');
  const { set } = useTabSyncActions();

  return (
    <div>
      <p>카운터: {count}</p>
      <button onClick={() => set('count', count + 1)}>+1</button>
    </div>
  );
}
```

> **주의**: `useTabSyncValue`, `useTabSync` 등 모든 hooks는 `'use client'` 컴포넌트에서만 사용할 수 있습니다.

---

## 방법 2: `useEffect` 내 직접 초기화

Provider 없이 단일 컴포넌트에서 사용할 때는 `useEffect` 내부에서 초기화합니다.

```tsx
// app/components/sync-widget.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { createTabSync, type TabSyncInstance } from 'tab-bridge';

interface MyState extends Record<string, unknown> {
  message: string;
}

export function SyncWidget() {
  const sync_ref = useRef<TabSyncInstance<MyState> | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const sync = createTabSync<MyState>({
      initial: { message: '' },
      channel: 'sync-widget',
    });

    sync_ref.current = sync;

    const unsub = sync.on('message', (value) => {
      setMessage(value);
    });

    setMessage(sync.get('message'));

    return () => {
      unsub();
      sync.destroy();
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMessage(value);
    sync_ref.current?.set('message', value);
  };

  return <input value={message} onChange={handleChange} />;
}
```

---

## 방법 3: Zustand 미들웨어 (`tab-bridge/zustand`)

Zustand와 함께 사용할 때 가장 간단한 패턴입니다.

### Store 정의

```ts
// lib/store.ts
import { create } from 'zustand';
import { tabSync } from 'tab-bridge/zustand';

interface AppStore {
  count: number;
  theme: string;
  inc: () => void;
  setTheme: (theme: string) => void;
}

export const useAppStore = create<AppStore>()(
  tabSync(
    (set) => ({
      count: 0,
      theme: 'light',
      inc: () => set((s) => ({ count: s.count + 1 })),
      setTheme: (theme) => set({ theme }),
    }),
    { channel: 'my-nextjs-app' }
  )
);
```

### Next.js에서 사용 (Hydration 안전)

Zustand의 `create`는 모듈 스코프에서 실행됩니다. Next.js SSR 시 서버에서도 실행되는데,  
`tabSync` 미들웨어 내부의 `createTabSync`가 `BroadcastChannel`이 없는 환경에서  
`StorageChannel`로 폴백하며, SSR guard가 적용되어 메시지 수신을 건너뜁니다.

하지만 **hydration mismatch**를 방지하려면, 동기화된 상태를 사용하는 컴포넌트에서  
초기 렌더링 시 서버 값과 클라이언트 값을 일치시켜야 합니다:

```tsx
// app/components/counter.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';

export function Counter() {
  const [mounted, setMounted] = useState(false);
  const count = useAppStore((s) => s.count);
  const inc = useAppStore((s) => s.inc);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div>
      <p>카운터: {mounted ? count : 0}</p>
      <button onClick={inc}>+1</button>
    </div>
  );
}
```

또는 Next.js의 `dynamic`을 사용하여 SSR을 완전히 건너뛸 수 있습니다:

```tsx
// app/page.tsx
import dynamic from 'next/dynamic';

const Counter = dynamic(() => import('./components/counter').then(m => m.Counter), {
  ssr: false,
  loading: () => <p>로딩 중...</p>,
});

export default function Page() {
  return <Counter />;
}
```

---

## Hydration Mismatch 방지

tab-bridge가 다른 탭에서 동기화한 상태는 서버 렌더링 시점에 알 수 없습니다.  
이로 인해 서버 HTML과 클라이언트 초기 렌더링 결과가 다를 수 있습니다.

### 패턴 A: `mounted` 가드

```tsx
'use client';

import { useEffect, useState } from 'react';

export function SyncedValue({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; // 또는 스켈레톤 UI

  return <>{children}</>;
}
```

### 패턴 B: `suppressHydrationWarning`

서버/클라이언트 불일치가 의도적인 경우:

```tsx
<p suppressHydrationWarning>
  카운터: {count}
</p>
```

### 패턴 C: `next/dynamic` + `ssr: false`

탭 동기화 컴포넌트를 완전히 클라이언트에서만 렌더링:

```tsx
const SyncPanel = dynamic(() => import('./sync-panel'), { ssr: false });
```

---

## 주의 사항

### 서버 컴포넌트에서 직접 사용 금지

```tsx
// ❌ 이렇게 하면 안 됩니다
// app/page.tsx (Server Component)
import { createTabSync } from 'tab-bridge';

const sync = createTabSync({ ... }); // 서버에서 실행됨 → 에러

export default function Page() {
  return <div>{sync.get('count')}</div>;
}
```

### 모듈 최상위 스코프 초기화 주의

```tsx
// ⚠️ 주의: 이 코드는 서버에서도 실행될 수 있습니다
import { createTabSync } from 'tab-bridge';

const sync = createTabSync({ ... }); // 모듈 로드 시 실행

// ✅ 대신 이렇게 사용하세요 (lazy initialization)
let sync: TabSyncInstance | null = null;

function getSync() {
  if (typeof window === 'undefined') return null;
  if (!sync) {
    sync = createTabSync({ ... });
  }
  return sync;
}
```

### `persist` 옵션과 SSR

`persist: true` 옵션은 `localStorage`를 사용합니다.  
SSR 시 `localStorage`가 없으므로, 초기 상태는 `initial` 옵션값으로 렌더링됩니다.  
클라이언트 hydration 후 `localStorage`에서 상태를 복원합니다.

```ts
const sync = createTabSync({
  initial: { count: 0 },          // SSR 시 이 값이 사용됨
  persist: true,                    // 클라이언트에서만 동작
  channel: 'my-app',
});
```

---

## 요약

| 접근 방식 | SSR 안전 | 복잡도 | 추천 상황 |
|-----------|---------|--------|----------|
| `TabSyncProvider` + hooks | ✅ | 낮음 | React 중심 앱, 여러 컴포넌트에서 공유 |
| `useEffect` 직접 초기화 | ✅ | 중간 | 단일 컴포넌트, 세밀한 제어 필요 시 |
| Zustand 미들웨어 + `dynamic` | ✅ | 낮음 | 이미 Zustand 사용 중인 프로젝트 |
| `typeof window` 가드 | ✅ | 높음 | 프레임워크 없이 직접 사용 시 |

---

## 참고

- [`tab-bridge` README](https://github.com/serbi2012/tab-bridge)
- [`tab-bridge/react` Hooks API](https://github.com/serbi2012/tab-bridge#react-adapter)
- [`tab-bridge/zustand` 미들웨어](https://github.com/serbi2012/tab-bridge#zustand-middleware)
