import Phaser from "phaser";
import { THEME } from "../theme/theme";

export type Toast = {
    text: Phaser.GameObjects.Text;
    timer?: Phaser.Time.TimerEvent;
};

export function createToast(scene: Phaser.Scene) {
    const t: Toast = {
        text: scene.add.text(0, 0, "", { fontSize: "14px", color: THEME.toast }).setOrigin(0.5),
    };
    t.text.setAlpha(0);
    return t;
}

export function showToast(scene: Phaser.Scene, toast: Toast, msg: string) {
    toast.text.setText(msg);
    toast.text.setAlpha(1);
    if (toast.timer) toast.timer.remove(false);
    toast.timer = scene.time.addEvent({
        delay: 900,
        callback: () => scene.tweens.add({ targets: toast.text, alpha: 0, duration: 250 }),
    });
}
