import Phaser from "phaser";

export function clamp01(v: number) {
    return Phaser.Math.Clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export function angleLerp(current: number, target: number, t: number) {
    const d = Phaser.Math.Angle.Wrap(target - current);
    return current + d * t;
}

// 색 밝기 조절
export function shade(hex: number, amt: number) {
    const r = Phaser.Math.Clamp(((hex >> 16) & 255) + amt, 0, 255);
    const g = Phaser.Math.Clamp(((hex >> 8) & 255) + amt, 0, 255);
    const b = Phaser.Math.Clamp((hex & 255) + amt, 0, 255);
    return (r << 16) | (g << 8) | b;
}
