import { TILE_W, TILE_H } from "../config";

export function worldToScreen(x: number, y: number) {
    const sx = (x - y) * (TILE_W / 2);
    const sy = (x + y) * (TILE_H / 2);
    return { sx, sy };
}

export function screenToWorld(sx: number, sy: number) {
    const tx = (sy / (TILE_H / 2) + sx / (TILE_W / 2)) / 2;
    const ty = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
    return { x: tx, y: ty };
}
