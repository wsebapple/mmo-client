import Phaser from "phaser";
import type { EntityView } from "../protocol";
import type { EntityRender } from "./types";
import { THEME } from "../theme/theme";
import { clamp01, shade } from "../math/util";
import { DROP_FOOT_Y } from "../config";

export function redrawEntity(r: EntityRender, e: EntityView) {
    const floor = r.floorG;
    const body = r.bodyG;
    floor.clear();
    body.clear();

    // ===== DROP =====
    if (r.kind === "D") {
        r.shadow.setVisible(true);
        r.shadow.setPosition(0, 0);
        r.shadow.setScale(0.6, 0.45);
        r.shadow.setAlpha(0.45);

        body.setY(-DROP_FOOT_Y);

        const liquid = (e.id % 2) === 0 ? 0x2b66ff : 0xc61a1a;
        const rim = THEME.metalRim;

        const BW = 12;
        const BH = 10;

        body.fillStyle(0xd8d0b8, 0.12);
        body.lineStyle(2, rim, 0.9);
        body.fillRoundedRect(-BW / 2, -BH, BW, BH, 5);
        body.strokeRoundedRect(-BW / 2, -BH, BW, BH, 5);

        body.fillStyle(liquid, 0.9);
        body.fillRoundedRect(-BW / 2 + 1, -6, BW - 2, 5, 4);

        body.fillStyle(0xd8d0b8, 0.14);
        body.fillRoundedRect(-4, -BH - 5, 8, 5, 3);
        body.strokeRoundedRect(-4, -BH - 5, 8, 5, 3);

        body.fillStyle(0xd6b15a, 0.3);
        body.fillRect(-4, -BH - 8, 8, 3);

        body.fillStyle(0xffffff, 0.12);
        body.fillCircle(-2, -BH + 2, 2);

        body.setY(0);
        return;
    }

    const isP = r.kind === "P";
    const isM = r.kind === "M";
    const base = isP ? THEME.player : THEME.monster;
    const rim = THEME.metalRim;

    const pulse = 0.45 + 0.25 * Math.sin(r.pulseT * 2.2);
    const glow = shade(base, isP ? 40 : 25);

    // ===== 플레이어(사람 형태) =====
    if (isP) {
        const rot = r.facingRad;
        const R = (x: number, y: number) => new Phaser.Math.Vector2(x, y).rotate(rot);

        const steel = 0x8f9aa7;
        const steelDark = 0x5b6673;
        const cloth = 0x243b7a;
        const skinShadow = 0x0b0b0b;
        const gold = 0xd6b15a;

        const oy = -6;

        // 다리
        body.fillStyle(steelDark, 0.95);
        body.lineStyle(2, rim, 0.6);

        // 왼다리
        {
            const a = R(-4, 6 + oy);
            const b = R(-1, 6 + oy);
            const c = R(-1, 14 + oy);
            const d = R(-4, 14 + oy);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();
        }
        // 오른다리
        {
            const a = R(1, 6 + oy);
            const b = R(4, 6 + oy);
            const c = R(4, 14 + oy);
            const d = R(1, 14 + oy);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();
        }

        // 발
        body.fillStyle(rim, 0.7);
        {
            const a = R(-5, 14 + oy);
            const b = R(-0.5, 14 + oy);
            const c = R(-0.5, 16 + oy);
            const d = R(-5, 16 + oy);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath();
        }
        {
            const a = R(0.5, 14 + oy);
            const b = R(5, 14 + oy);
            const c = R(5, 16 + oy);
            const d = R(0.5, 16 + oy);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath();
        }

        // 몸통
        body.fillStyle(steel, 0.92);
        body.lineStyle(2, rim, 0.75);
        {
            const a = R(-7, -4 + oy);
            const b = R(7, -4 + oy);
            const c = R(6, 7 + oy);
            const d = R(-6, 7 + oy);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();

            body.lineStyle(2, gold, 0.22);
            const l1 = R(0, -2 + oy);
            const l2 = R(0, 6 + oy);
            body.beginPath(); body.moveTo(l1.x,l1.y); body.lineTo(l2.x,l2.y); body.strokePath();
        }

        // 팔
        body.fillStyle(steelDark, 0.92);
        body.lineStyle(2, rim, 0.6);

        // 왼팔
        {
            const a = R(-10, -2 + oy);
            const b = R(-6, -2 + oy);
            const c = R(-6, 5 + oy);
            const d = R(-10, 5 + oy);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();
        }

        // 오른팔
        {
            const a = R(6, -2 + oy);
            const b = R(10, -2 + oy);
            const c = R(10, 5 + oy);
            const d = R(6, 5 + oy);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();
        }

        // 머리(투구)
        body.fillStyle(steel, 0.95);
        body.lineStyle(2, rim, 0.8);
        {
            const p = R(0, -13 + oy);
            body.fillCircle(p.x, p.y, 5);
            body.strokeCircle(p.x, p.y, 5);

            body.fillStyle(skinShadow, 0.55);
            const s1 = R(-3, -13 + oy);
            const s2 = R(3, -13 + oy);
            const s3 = R(3, -12 + oy);
            const s4 = R(-3, -12 + oy);
            body.beginPath(); body.moveTo(s1.x,s1.y); body.lineTo(s2.x,s2.y); body.lineTo(s3.x,s3.y); body.lineTo(s4.x,s4.y); body.closePath();
            body.fillPath();
        }

        // 망토
        body.fillStyle(cloth, 0.28 + 0.10 * (0.5 + 0.5 * Math.sin(r.pulseT * 2.2)));
        {
            const back = rot + Math.PI;
            const RB = (x: number, y: number) => new Phaser.Math.Vector2(x, y).rotate(back);

            const a = RB(-6, -4 + oy);
            const b = RB(6, -4 + oy);
            const c = RB(12, 10 + oy);
            const d = RB(-12, 10 + oy);

            body.beginPath();
            body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y);
            body.closePath();
            body.fillPath();
        }

        // 방패
        body.fillStyle(steelDark, 0.9);
        body.lineStyle(2, rim, 0.85);
        {
            const a = R(-14, -6 + oy);
            const b = R(-8, -8 + oy);
            const c = R(-6, 2 + oy);
            const d = R(-12, 5 + oy);

            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();

            body.lineStyle(2, gold, 0.18);
            const m1 = R(-10, -5 + oy);
            const m2 = R(-9, 3 + oy);
            body.beginPath(); body.moveTo(m1.x,m1.y); body.lineTo(m2.x,m2.y); body.strokePath();
        }

        // 검
        body.lineStyle(3, 0xe6e6e6, 0.9);
        {
            const tip = R(0, -32 + oy);
            const base1 = R(2, -6 + oy);
            const base2 = R(-2, -6 + oy);

            body.beginPath();
            body.moveTo(tip.x, tip.y);
            body.lineTo(base1.x, base1.y);
            body.lineTo(base2.x, base2.y);
            body.closePath();
            body.strokePath();

            body.lineStyle(3, rim, 0.85);
            const g1 = R(-8, -6 + oy);
            const g2 = R(8, -6 + oy);
            body.beginPath(); body.moveTo(g1.x,g1.y); body.lineTo(g2.x,g2.y); body.strokePath();
        }

        return;
    }

    // ===== 몬스터 =====
    const hpRatio = e.maxHp > 0 ? clamp01(e.hp / e.maxHp) : 1;
    const anger = 1 - hpRatio;

    floor.fillStyle(THEME.bloodDark, 0.10 + anger * 0.12);
    floor.fillCircle(0, 0, 18);

    floor.fillStyle(THEME.bloodMid, 0.06 + anger * 0.10);
    floor.fillCircle(0, 0, 24);

    floor.fillStyle(THEME.ember, 0.03 + pulse * 0.03);
    for (let i = 0; i < 4; i++) {
        const a = r.pulseT * (1.4 + i * 0.2) + i;
        const rad = 8 + i * 3;
        floor.fillCircle(Math.cos(a) * rad, Math.sin(a) * rad, 1.5);
    }

    body.lineStyle(3, rim, 0.9);
    body.strokeCircle(0, 0, 12);

    body.lineStyle(2, glow, 0.55);
    body.strokeCircle(0, 0, 12);

    body.fillStyle(shade(base, -35), 0.60);
    body.fillCircle(0, 0, 11);

    body.fillStyle(glow, 0.10 + pulse * 0.06);
    body.fillCircle(-3, -4, 4);

    const rot = r.facingRad;

    const bladeLen = 22;
    const bladeW = 5;
    const guardW = 10;

    const tip = new Phaser.Math.Vector2(0, -bladeLen).rotate(rot);
    const baseL = new Phaser.Math.Vector2(-bladeW, -8).rotate(rot);
    const baseR = new Phaser.Math.Vector2(bladeW, -8).rotate(rot);
    const midL = new Phaser.Math.Vector2(-bladeW, -16).rotate(rot);
    const midR = new Phaser.Math.Vector2(bladeW, -16).rotate(rot);

    const guardL = new Phaser.Math.Vector2(-guardW, -6).rotate(rot);
    const guardR = new Phaser.Math.Vector2(guardW, -6).rotate(rot);

    body.fillStyle(glow, 0.70);
    body.beginPath();
    body.moveTo(tip.x, tip.y);
    body.lineTo(midR.x, midR.y);
    body.lineTo(baseR.x, baseR.y);
    body.lineTo(baseL.x, baseL.y);
    body.lineTo(midL.x, midL.y);
    body.closePath();
    body.fillPath();

    body.lineStyle(2, rim, 0.9);
    body.strokePath();

    body.lineStyle(3, rim, 0.8);
    body.beginPath();
    body.moveTo(guardL.x, guardL.y);
    body.lineTo(guardR.x, guardR.y);
    body.strokePath();

    body.lineStyle(2, shade(glow, 20), 0.22 + pulse * 0.10);
    body.beginPath();
    body.moveTo(guardL.x, guardL.y);
    body.lineTo(guardR.x, guardR.y);
    body.strokePath();

    const spikeCount = 6;
    body.fillStyle(shade(base, 25), 0.40);
    body.lineStyle(2, rim, 0.85);

    for (let i = 0; i < spikeCount; i++) {
        const a = rot + Math.PI + (i - (spikeCount - 1) / 2) * 0.22;
        const p1 = new Phaser.Math.Vector2(Math.cos(a) * 10, Math.sin(a) * 10);
        const p2 = new Phaser.Math.Vector2(Math.cos(a) * 18, Math.sin(a) * 18);
        const p3 = new Phaser.Math.Vector2(Math.cos(a + 0.11) * 10, Math.sin(a + 0.11) * 10);

        body.beginPath();
        body.moveTo(p1.x, p1.y);
        body.lineTo(p2.x, p2.y);
        body.lineTo(p3.x, p3.y);
        body.closePath();
        body.fillPath();
        body.strokePath();
    }

    body.fillStyle(THEME.ember, 0.05 + pulse * 0.05);
    body.fillCircle(3, -1, 3);
}
