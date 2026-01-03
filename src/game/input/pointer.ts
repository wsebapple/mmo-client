import Phaser from "phaser";
import type { Kind } from "../protocol";
import { screenToWorld } from "../math/iso";
import { MAP_LIMIT } from "../config";

export function mapClampX(x: number) {
    return Phaser.Math.Clamp(x, MAP_LIMIT.xMin, MAP_LIMIT.xMax);
}
export function mapClampY(y: number) {
    return Phaser.Math.Clamp(y, MAP_LIMIT.yMin, MAP_LIMIT.yMax);
}

export function screenToTile(sx: number, sy: number) {
    const w = screenToWorld(sx, sy);
    const tx = mapClampX(Math.round(w.x));
    const ty = mapClampY(Math.round(w.y));
    return { tx, ty };
}

export function pickEntityAtScreen(
    entities: Map<number, { kind: Kind; c: Phaser.GameObjects.Container }>,
    sx: number,
    sy: number,
    kind: Kind
): number | null {
    let best: { id: number; d2: number } | null = null;

    const cfg =
        kind === "D"
            ? { r2: 2800, ox: 0, oy: -10 }
            : kind === "M"
                ? { r2: 2000, ox: 0, oy: -2 }
                : { r2: 1800, ox: 0, oy: -2 };

    for (const [id, r] of entities.entries()) {
        if (r.kind !== kind) continue;
        const cx = r.c.x + cfg.ox;
        const cy = r.c.y + cfg.oy;
        const dx = cx - sx;
        const dy = cy - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 < cfg.r2) {
            if (!best || d2 < best.d2) best = { id, d2 };
        }
    }
    return best ? best.id : null;
}
