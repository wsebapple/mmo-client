import Phaser from "phaser";
import { THEME } from "../theme/theme";
import { clamp01 } from "../math/util";

export type Hud = {
    uiLayer: Phaser.GameObjects.Container;

    // target frame
    frameBg: Phaser.GameObjects.Rectangle;
    targetName: Phaser.GameObjects.Text;
    targetHpBg: Phaser.GameObjects.Rectangle;
    targetHpFg: Phaser.GameObjects.Rectangle;
    targetHpText: Phaser.GameObjects.Text;

    // player hud
    playerHud: Phaser.GameObjects.Container;
    hpBarBg: Phaser.GameObjects.Rectangle;
    hpBarFg: Phaser.GameObjects.Rectangle;
    hpText: Phaser.GameObjects.Text;

    expBarBg: Phaser.GameObjects.Rectangle;
    expBarFg: Phaser.GameObjects.Rectangle;
    expText: Phaser.GameObjects.Text;
};

export function createHud(scene: Phaser.Scene): Hud {
    const w = scene.scale.width;
    const h = scene.scale.height;

    const uiLayer = scene.add.container(0, 0).setDepth(5000);
    uiLayer.setScrollFactor(0);

    const frameBg = scene.add
        .rectangle(w / 2 - 140, 10, 280, 52, THEME.uiPanel, THEME.uiPanelAlpha)
        .setOrigin(0, 0);

    const targetName = scene.add.text(w / 2 - 140 + 10, 16, "대상 없음", {
        fontSize: "12px",
        color: THEME.text,
    });

    const targetHpBg = scene.add.rectangle(w / 2 - 140 + 10, 36, 260, 10, 0x333333).setOrigin(0, 0);
    const targetHpFg = scene.add.rectangle(w / 2 - 140 + 10, 36, 260, 10, THEME.uiHp).setOrigin(0, 0);

    const targetHpText = scene.add.text(w / 2 - 140 + 10, 48, "", {
        fontSize: "11px",
        color: THEME.subText,
    });

    uiLayer.add([frameBg, targetName, targetHpBg, targetHpFg, targetHpText]);

    const playerHud = scene.add.container(w / 2, h - 90).setDepth(5000);
    playerHud.setScrollFactor(0);

    const panelBg = scene.add.rectangle(0, 0, 260, 72, THEME.uiPanel, THEME.uiPanelAlpha).setOrigin(0.5);

    const hpBarBg = scene.add.rectangle(-110, -10, 220, 14, 0x333333).setOrigin(0, 0.5);
    const hpBarFg = scene.add.rectangle(-108, -10, 216, 10, THEME.uiHp).setOrigin(0, 0.5);
    const hpText = scene.add.text(0, -28, "HP 0/0", { fontSize: "12px", color: THEME.text }).setOrigin(0.5);

    const expBarBg = scene.add.rectangle(-110, 14, 220, 8, 0x333333).setOrigin(0, 0.5);
    const expBarFg = scene.add.rectangle(-108, 14, 216, 6, 0x4da3ff).setOrigin(0, 0.5);
    const expText = scene.add.text(0, 28, "LV 1  EXP 0/0", { fontSize: "11px", color: THEME.subText }).setOrigin(0.5);

    playerHud.add([panelBg, hpBarBg, hpBarFg, hpText, expBarBg, expBarFg, expText]);

    return {
        uiLayer,
        frameBg,
        targetName,
        targetHpBg,
        targetHpFg,
        targetHpText,
        playerHud,
        hpBarBg,
        hpBarFg,
        hpText,
        expBarBg,
        expBarFg,
        expText,
    };
}

export function layoutHud(scene: Phaser.Scene, hud: Hud, toastText?: Phaser.GameObjects.Text) {
    const w = scene.scale.width;
    const h = scene.scale.height;

    hud.playerHud.setPosition(w / 2, h - 90);

    hud.frameBg.setPosition(w / 2 - 140, 10);
    hud.targetName.setPosition(w / 2 - 140 + 10, 16);
    hud.targetHpBg.setPosition(w / 2 - 140 + 10, 36);
    hud.targetHpFg.setPosition(w / 2 - 140 + 10, 36);
    hud.targetHpText.setPosition(w / 2 - 140 + 10, 48);

    if (toastText) toastText.setPosition(w / 2, h - 160);
}

export function setMyHp(hud: Hud, hp: number, maxHp: number) {
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    hud.hpBarFg.width = 216 * clamp01(ratio);
    hud.hpText.setText(`HP ${hp}/${maxHp}`);
}

export function setMyLevelExp(hud: Hud, level: number, exp: number, expNeed: number) {
    const ratio = expNeed > 0 ? exp / expNeed : 0;
    hud.expBarFg.width = 216 * clamp01(ratio);
    hud.expText.setText(`LV ${level}  EXP ${exp}/${expNeed || "?"}`);
}

export function setTargetFrame(hud: Hud, name: string, level: number | undefined, hp: number, maxHp: number) {
    const lv = level == null ? "Lv?" : `Lv${level}`;
    hud.targetName.setText(`${name}  ${lv}`);

    const ratio = maxHp > 0 ? hp / maxHp : 0;
    hud.targetHpFg.width = 260 * clamp01(ratio);

    hud.targetHpText.setText(`HP ${hp}/${maxHp}`);
}
