import Phaser from "phaser";
import type { Kind } from "../protocol";

export type EntityRender = {
    c: Phaser.GameObjects.Container;
    kind: Kind;
    id: number;

    name: Phaser.GameObjects.Text;

    floorG: Phaser.GameObjects.Graphics;
    bodyG: Phaser.GameObjects.Graphics;

    shadow: Phaser.GameObjects.Ellipse;

    hpBarBg?: Phaser.GameObjects.Rectangle;
    hpBarFg?: Phaser.GameObjects.Rectangle;
    hpShown: number;

    lastWX: number;
    lastWY: number;
    facingRad: number;

    pulseT: number;
};
