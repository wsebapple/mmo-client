import Phaser from "phaser";
import { worldToScreen } from "../math/iso";
import { ensureGrassTileTexture } from "./grassTile";

/**
 * 아이소 잔디 타일 스프라이트를 w*h 만큼 배치
 * - depth를 y 기준으로 살짝 넣어서 겹침 문제를 줄임
 */
export function createGrassMap(scene: Phaser.Scene, w: number, h: number) {
    const key = ensureGrassTileTexture(scene);

    const layer = scene.add.container(0, 0);
    layer.setDepth(-2000); // 엔티티보다 뒤

    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            const { sx, sy } = worldToScreen(x, y);

            const tile = scene.add.image(sx, sy, key);
            tile.setOrigin(0.5, 0.5);

            // 타일마다 살짝 톤 변주(자연스러움)
            // 0xFFFFFF는 원본, tint는 곱연산이라 너무 튀지 않게 약간만
            const jitter = Phaser.Math.Between(-50, 0);
            const c = Phaser.Display.Color.GetColor(255 + jitter, 255 + jitter, 255 + jitter);
            tile.setTint(c);

            // 겹침 안정용(필요시)
            tile.setDepth(-2000 + sy * 0.001);

            layer.add(tile);
        }
    }

    return layer;
}
