import Phaser from "phaser";
import { TILE_W, TILE_H } from "../config";
import { THEME } from "../theme/theme";
import { worldToScreen } from "../math/iso";

export function drawIsoGrid(scene: Phaser.Scene, w: number, h: number) {
    const g = scene.add.graphics();
    g.lineStyle(1, THEME.grid, 1);

    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            const { sx, sy } = worldToScreen(x, y);
            g.strokePoints(
                [
                    new Phaser.Math.Vector2(sx, sy - TILE_H / 2),
                    new Phaser.Math.Vector2(sx + TILE_W / 2, sy),
                    new Phaser.Math.Vector2(sx, sy + TILE_H / 2),
                    new Phaser.Math.Vector2(sx - TILE_W / 2, sy),
                    new Phaser.Math.Vector2(sx, sy - TILE_H / 2),
                ],
                false
            );
        }
    }

    g.setDepth(-1000); // ✅ 엔티티/이펙트보다 뒤
    return g;
}
