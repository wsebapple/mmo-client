import Phaser from "phaser";
import type { EntityView, Kind } from "../protocol";
import type { EntityRender } from "./types";
import { THEME } from "../theme/theme";
import { kindLabel } from "./entityText";
import { redrawEntity } from "./redrawEntity";

export function createEntityRender(
    scene: Phaser.Scene,
    id: number,
    kind: Kind,
    e0: EntityView
): EntityRender {
    const shadow = scene.add.ellipse(
        0,
        12,
        kind === "P" ? 34 : 30,
        kind === "P" ? 16 : 14,
        0x000000,
        0.38
    );

    const floorG = scene.add.graphics();
    floorG.setBlendMode(Phaser.BlendModes.ADD);

    const bodyG = scene.add.graphics();

    const name = scene.add.text(-22, -40, kindLabel(kind, id), {
        fontSize: "10px",
        color: THEME.subText,
    });

    let hpBarBg: Phaser.GameObjects.Rectangle | undefined;
    let hpBarFg: Phaser.GameObjects.Rectangle | undefined;

    const children: Phaser.GameObjects.GameObject[] = [floorG, shadow, bodyG, name];

    if (kind !== "D") {
        hpBarBg = scene.add.rectangle(-18, 18, 36, 6, THEME.hpBg).setOrigin(0, 0.5);
        hpBarFg = scene.add.rectangle(-18, 18, 34, 4, THEME.hpFg).setOrigin(0, 0.5);
        children.push(hpBarBg, hpBarFg);
    }

    const c = scene.add.container(0, 0, children);
    c.setData("kind", kind);
    c.setData("id", id);

    const r: EntityRender = {
        c,
        kind,
        id,
        name,
        floorG,
        bodyG,
        shadow,
        hpBarBg,
        hpBarFg,
        hpShown: kind === "D" ? 0 : -1,
        lastWX: e0.x,
        lastWY: e0.y,
        facingRad: 0,
        pulseT: Math.random() * 10,
    };

    redrawEntity(r, e0);
    return r;
}
