export const PROTOCOL_VERSION = 1;

// ── Message Payloads ────────────────────────────────────────────────────────

export interface StateUpdatePayload {
  entries: Record<string, { value: unknown; timestamp: number }>;
}

export interface StateSyncResponsePayload {
  state: Record<string, { value: unknown; timestamp: number }>;
}

export interface LeaderClaimPayload {
  createdAt: number;
  claimId: string;
  generation: number;
}

export interface LeaderAckPayload {
  claimId: string;
  generation: number;
}

export interface TabAnnouncePayload {
  createdAt: number;
  isActive: boolean;
  url: string;
  title?: string;
}

export interface RpcRequestPayload {
  callId: string;
  method: string;
  args: unknown;
}

export interface RpcResponsePayload {
  callId: string;
  result?: unknown;
  error?: string;
}

// ── Discriminated-Union Message System ──────────────────────────────────────

/**
 * Maps every message type to its exact payload shape.
 * Adding a new message only requires extending this interface.
 */
export interface MessagePayloadMap {
  STATE_UPDATE: StateUpdatePayload;
  STATE_SYNC_REQUEST: null;
  STATE_SYNC_RESPONSE: StateSyncResponsePayload;
  LEADER_CLAIM: LeaderClaimPayload;
  LEADER_ACK: LeaderAckPayload;
  LEADER_HEARTBEAT: null;
  LEADER_RESIGN: null;
  TAB_ANNOUNCE: TabAnnouncePayload;
  TAB_GOODBYE: null;
  RPC_REQUEST: RpcRequestPayload;
  RPC_RESPONSE: RpcResponsePayload;
}

export type MessageType = keyof MessagePayloadMap;

/**
 * Discriminated union of all inter-tab messages.
 *
 * Checking `msg.type` narrows `msg.payload` to the exact payload type,
 * eliminating the need for runtime casts:
 *
 * ```ts
 * if (msg.type === 'STATE_UPDATE') {
 *   msg.payload.entries; // ← StateUpdatePayload, fully typed
 * }
 * ```
 */
export type TabMessage = {
  [K in MessageType]: {
    readonly type: K;
    readonly senderId: string;
    readonly targetId?: string;
    readonly timestamp: number;
    readonly version?: number;
    readonly payload: MessagePayloadMap[K];
  };
}[MessageType];

/** Extract a single message variant by its type discriminant. */
export type MessageOf<T extends MessageType> = Extract<TabMessage, { type: T }>;

/** Function that sends a message through the transport channel. */
export type SendFn = (message: TabMessage) => void;
