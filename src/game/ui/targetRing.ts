import Phaser from "phaser";

export type TargetRing = {
    outer: Phaser.GameObjects.Ellipse;
    inner: Phaser.GameObjects.Ellipse;
};

export function createTargetRing(scene: Phaser.Scene): TargetRing {
    const outer = scene.add.ellipse(0, 0, 44, 22);
    outer.setStrokeStyle(3, 0xff3333, 0.85);
    outer.setVisible(false);
    outer.setDepth(3000);

    const inner = scene.add.ellipse(0, 0, 34, 16);
    inner.setStrokeStyle(2, 0xff9999, 0.75);
    inner.setVisible(false);
    inner.setDepth(3000);

    scene.tweens.add({
        targets: [outer, inner],
        scaleX: 1.06,
        scaleY: 1.06,
        duration: 420,
        yoyo: true,
        repeat: -1,
    });

    return { outer, inner };
}
