import Phaser from "phaser";
import { MainScene } from "./game/scene/MainScene";

new Phaser.Game({
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: "app",
    scene: [MainScene],
});
