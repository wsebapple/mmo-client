import Phaser from "phaser";
import { TILE_W, TILE_H } from "../config";

/**
 * 아이소 마름모 잔디 타일 텍스처를 1회 생성
 * - 내부: 잔디 톤 + 약간의 입자/점(잔디 결)
 * - 외곽: 살짝 어두운 라인
 */
export function ensureGrassTileTexture(scene: Phaser.Scene, key = "tile_grass") {
    if (scene.textures.exists(key)) return key;

    const g = scene.make.graphics({ x: 0, y: 0, add: false });

    const W = TILE_W;
    const H = TILE_H;

    const cx = W / 2;
    const cy = H / 2;

    const top = new Phaser.Math.Vector2(cx, 0);
    const right = new Phaser.Math.Vector2(W, cy);
    const bottom = new Phaser.Math.Vector2(cx, H);
    const left = new Phaser.Math.Vector2(0, cy);

    // 바닥 채움(잔디 기본색)
    g.fillStyle(0x2f6b2f, 1);
    g.beginPath();
    g.moveTo(top.x, top.y);
    g.lineTo(right.x, right.y);
    g.lineTo(bottom.x, bottom.y);
    g.lineTo(left.x, left.y);
    g.closePath();
    g.fillPath();

    // 살짝 밝은 하이라이트(상단/좌측)
    g.fillStyle(0x3f8a3f, 0.18);
    g.beginPath();
    g.moveTo(top.x, top.y);
    g.lineTo(cx, cy);
    g.lineTo(left.x, left.y);
    g.closePath();
    g.fillPath();

    // 살짝 어두운 음영(하단/우측)
    g.fillStyle(0x204a20, 0.18);
    g.beginPath();
    g.moveTo(bottom.x, bottom.y);
    g.lineTo(cx, cy);
    g.lineTo(right.x, right.y);
    g.closePath();
    g.fillPath();

    // 잔디 결(점/입자) - 마름모 내부에만 찍기 위해 간단히 범위 체크
    // 성능: 텍스처 생성 1회만 수행하니 이 정도는 괜찮습니다.
    const insideDiamond = (x: number, y: number) => {
        // 마름모 방정식: |x-cx|/(W/2) + |y-cy|/(H/2) <= 1
        const dx = Math.abs(x - cx) / (W / 2);
        const dy = Math.abs(y - cy) / (H / 2);
        return dx + dy <= 1;
    };

    // 밝은 잔디 점
    g.fillStyle(0x58b058, 0.25);
    for (let i = 0; i < 70; i++) {
        const x = Phaser.Math.Between(0, W);
        const y = Phaser.Math.Between(0, H);
        if (!insideDiamond(x, y)) continue;
        g.fillRect(x, y, 1, 1);
    }

    // 어두운 잔디 점
    g.fillStyle(0x1d3a1d, 0.25);
    for (let i = 0; i < 55; i++) {
        const x = Phaser.Math.Between(0, W);
        const y = Phaser.Math.Between(0, H);
        if (!insideDiamond(x, y)) continue;
        g.fillRect(x, y, 1, 1);
    }

    // 외곽선(너무 선명하지 않게)
    g.lineStyle(1, 0x0f220f, 0.35);
    g.beginPath();
    g.moveTo(top.x, top.y);
    g.lineTo(right.x, right.y);
    g.lineTo(bottom.x, bottom.y);
    g.lineTo(left.x, left.y);
    g.closePath();
    g.strokePath();

    // 텍스처 등록
    g.generateTexture(key, W, H);
    g.destroy();

    return key;
}
