export type MsgType =
    | "AUTH"
    | "WELCOME"
    | "STATE_DELTA"
    | "COMBAT"
    | "MOVE_REQ"
    | "TARGET_REQ"
    | "PICKUP_REQ";

export type WsMessage<T> = { type: MsgType; payload: T };

export type WelcomePayload = { playerId: number; mapId: string; tickRate: number };

export type EntityView = {
    id: number;
    kind: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    targetId: number;

    level?: number;
    exp?: number;
    expNeed?: number;
};

export type StateDeltaPayload = { tick: number; updates: EntityView[]; removes: number[] };

export type CombatPayload = {
    tick: number;
    attackerId: number;
    targetId: number;
    dmg: number;
    crit: boolean;
    miss: boolean;
    targetHp: number;
};

export type Kind = "P" | "M" | "D";
