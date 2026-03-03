// ── Tab Info ────────────────────────────────────────────────────────────────

export interface TabInfo {
  id: string;
  createdAt: number;
  lastSeen: number;
  isLeader: boolean;
  isActive: boolean;
  url: string;
  title?: string;
}

// ── Change Metadata ─────────────────────────────────────────────────────────

export interface ChangeMeta {
  readonly sourceTabId: string;
  readonly isLocal: boolean;
  readonly timestamp: number;
}
