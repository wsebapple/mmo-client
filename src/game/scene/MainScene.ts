import Phaser from "phaser";
import type { CombatPayload, EntityView, Kind, StateDeltaPayload, WelcomePayload, WsMessage } from "../protocol";
import { worldToScreen } from "../math/iso";
import { clamp01, lerp, angleLerp } from "../math/util";
import { createEntityRender } from "../render/entityFactory";
import { entityHeadText, kindLabel } from "../render/entityText";
import { redrawEntity } from "../render/redrawEntity";
import type { EntityRender } from "../render/types";
import { WsClient } from "../net/wsClient";
import { createTargetRing } from "../ui/targetRing";
import { createHud, layoutHud, setMyHp, setMyLevelExp, setTargetFrame, type Hud } from "../ui/hud";
import { createToast, showToast, type Toast } from "../ui/toast";
import { pickEntityAtScreen, screenToTile } from "../input/pointer";
import {THEME} from "../theme/theme";
import type { TargetRing } from "../ui/targetRing";
import {drawIsoGrid} from "../render/grid";
import {createGrassMap} from "../render/grassMap";

export class MainScene extends Phaser.Scene {
    ws!: WsClient;

    gridG?: Phaser.GameObjects.Graphics;
    grassLayer?: Phaser.GameObjects.Container;
    drawGridEnabled = true;

    myId = 0;
    myTargetId = 0;
    seq = 0;

    lastEntityView = new Map<number, EntityView>();
    entities = new Map<number, EntityRender>();

    // ui
    hud!: Hud;
    toast!: Toast;

    targetRing!: TargetRing;

    hoverG!: Phaser.GameObjects.Graphics;
    hoverTile = { x: -999, y: -999 };
    drawGridEnabled = true;

    create() {
        const cam = this.cameras.main;
        cam.setBackgroundColor(THEME.bg);

        if (this.drawGridEnabled) {
            // this.gridG = drawIsoGrid(this, 120, 120);
            this.grassLayer = createGrassMap(this, 120, 120);
        }

        const start = worldToScreen(18, 18);
        cam.centerOn(start.sx, start.sy);

        this.hoverG = this.add.graphics();
        this.hoverG.setDepth(2500);

        // UI
        this.hud = createHud(this);
        this.toast = createToast(this);
        this.hud.uiLayer.add(this.toast.text);

        this.targetRing = createTargetRing(this);

        this.scale.on("resize", () => layoutHud(this, this.hud, this.toast.text));
        layoutHud(this, this.hud, this.toast.text);

        // WS
        this.ws = new WsClient(`ws://${location.hostname}:8080/ws`, (msg) => this.onWs(msg));
        this.ws.onOpen(() => {
            const savedId = Number(localStorage.getItem("playerId") || "0");
            this.ws.send("AUTH", { playerId: savedId });
        });

        // hover
        this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
            const { tx, ty } = screenToTile(p.worldX, p.worldY);
            if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;
            this.hoverTile.x = tx;
            this.hoverTile.y = ty;
            this.drawHoverTile(tx, ty);
        });

        // click
        this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
            const sx = p.worldX;
            const sy = p.worldY;

            const dropHit = pickEntityAtScreen(this.entities as any, sx, sy, "D");
            if (dropHit) {
                this.ws.send("PICKUP_REQ", { dropId: dropHit });
                return;
            }

            const mobHit = pickEntityAtScreen(this.entities as any, sx, sy, "M");
            if (mobHit) {
                this.ws.send("TARGET_REQ", { targetId: mobHit });
                return;
            }

            const { tx, ty } = screenToTile(sx, sy);
            this.ws.send("MOVE_REQ", { seq: ++this.seq, x: tx, y: ty });
        });
    }

    update(_: number, dtMs: number) {
        const dt = dtMs / 1000;
        const smoothing = 1 - Math.pow(0.001, dt);

        for (const r of this.entities.values()) {
            const v = this.lastEntityView.get(r.id);
            if (!v) continue;

            r.pulseT += dt;

            if (r.kind !== "D") {
                r.hpShown = lerp(r.hpShown, v.hp, smoothing);

                const ratio = v.maxHp > 0 ? clamp01(r.hpShown / v.maxHp) : 0;
                if (r.hpBarFg) {
                    const full = 34;
                    r.hpBarFg.width = full * ratio;
                    r.hpBarFg.fillColor = ratio <= 0.3 ? THEME.hpLow : THEME.hpFg;
                }

                const dx = v.x - r.lastWX;
                const dy = v.y - r.lastWY;
                if (Math.abs(dx) + Math.abs(dy) > 0.001) {
                    const a = Math.atan2(dy, dx);
                    const targetRad = a - Math.PI / 4;
                    r.facingRad = angleLerp(r.facingRad, targetRad, 0.18);
                    r.lastWX = v.x;
                    r.lastWY = v.y;
                }
            }

            redrawEntity(r, v);
        }
    }

    private onWs(msg: WsMessage<any>) {
        if (msg.type === "WELCOME") {
            const p = msg.payload as WelcomePayload;
            this.myId = p.playerId;
            localStorage.setItem("playerId", String(this.myId));
            showToast(this, this.toast, `접속: P${this.myId}`);
            return;
        }

        if (msg.type === "STATE_DELTA") {
            const p = msg.payload as StateDeltaPayload;

            for (const id of p.removes) {
                this.lastEntityView.delete(id);
                this.removeEntity(id);
            }

            for (const e of p.updates) {
                this.lastEntityView.set(e.id, e);
                this.upsertEntity(e);
            }

            this.sortDepth();
            this.updateTargetRingAndHud();
            return;
        }

        if (msg.type === "COMBAT") {
            const p = msg.payload as CombatPayload;
            this.spawnFloatingDamage(p);
        }
    }

    private upsertEntity(e: EntityView) {
        const { sx, sy } = worldToScreen(e.x, e.y);

        const kind = e.kind as Kind;
        let r = this.entities.get(e.id);

        if (!r) {
            r = createEntityRender(this, e.id, kind, e);
            this.entities.set(e.id, r);
        }

        r.c.x = sx;
        r.c.y = sy;

        const newText = entityHeadText(e);
        if (r.name.text !== newText) r.name.setText(newText);

        if (kind !== "D") {
            if (r.hpShown === -1) r.hpShown = e.hp;
        }

        if (e.id === this.myId) {
            this.myTargetId = e.targetId || 0;
            setMyHp(this.hud, e.hp, e.maxHp);
            this.cameras.main.centerOn(sx, sy);
            setMyLevelExp(this.hud, e.level ?? 1, e.exp ?? 0, e.expNeed ?? 0);
        }
    }

    private removeEntity(id: number) {
        const r = this.entities.get(id);
        if (!r) return;
        r.c.destroy(true);
        this.entities.delete(id);
    }

    private sortDepth() {
        const arr = Array.from(this.entities.values());
        arr.sort((a, b) => a.c.y - b.c.y);
        arr.forEach((r, i) => r.c.setDepth(i));
    }

    private updateTargetRingAndHud() {
        const outer = this.targetRing.outer;
        const inner = this.targetRing.inner;

        if (!this.myTargetId) {
            outer.setVisible(false);
            inner.setVisible(false);
            setTargetFrame(this.hud, "대상 없음", undefined, 0, 1);
            return;
        }

        const t = this.entities.get(this.myTargetId);
        const v = this.lastEntityView.get(this.myTargetId);

        if (!t || !v) {
            outer.setVisible(false);
            inner.setVisible(false);
            setTargetFrame(this.hud, "대상 없음", undefined, 0, 1);
            return;
        }

        outer.setVisible(true);
        inner.setVisible(true);

        outer.x = t.c.x;
        outer.y = t.c.y + 12;
        outer.setDepth(t.c.depth - 1);

        inner.x = t.c.x;
        inner.y = t.c.y + 12;
        inner.setDepth(t.c.depth - 1);

        setTargetFrame(this.hud, kindLabel(v.kind as Kind, v.id), v.level, v.hp, v.maxHp);
    }

    private spawnFloatingDamage(p: CombatPayload) {
        const target = this.entities.get(p.targetId);
        if (!target) return;

        const text = p.miss ? "MISS" : `-${p.dmg}`;
        const color = p.miss ? "#bdbdbd" : p.crit ? "#ffd34d" : "#ffffff";
        const size = p.crit ? "16px" : "14px";

        const t = this.add.text(target.c.x, target.c.y - 56, text, { fontSize: size, color }).setOrigin(0.5);

        if (p.crit) {
            this.tweens.add({ targets: t, scale: 1.25, duration: 120, yoyo: true });
        }

        this.tweens.add({
            targets: t,
            y: t.y - 24,
            alpha: 0,
            duration: 520,
            ease: "Quad.easeOut",
            onComplete: () => t.destroy(),
        });
    }

    private drawHoverTile(tx: number, ty: number) {
        // 여기 부분은 원래 코드 그대로 옮기시면 됩니다.
        // (길어서 생략하지 않고 싶으면 말씀 주세요. 그대로 분리해서 드릴게요.)
        this.hoverG.clear();
        const TILE_W = 64, TILE_H = 32;
        const sx = (tx - ty) * (TILE_W / 2);
        const sy = (tx + ty) * (TILE_H / 2);

        const top = new Phaser.Math.Vector2(sx, sy - TILE_H / 2);
        const right = new Phaser.Math.Vector2(sx + TILE_W / 2, sy);
        const bottom = new Phaser.Math.Vector2(sx, sy + TILE_H / 2);
        const left = new Phaser.Math.Vector2(sx - TILE_W / 2, sy);

        this.hoverG.fillStyle(THEME.runeGold, 0.05);
        this.hoverG.beginPath();
        this.hoverG.moveTo(top.x, top.y);
        this.hoverG.lineTo(right.x, right.y);
        this.hoverG.lineTo(bottom.x, bottom.y);
        this.hoverG.lineTo(left.x, left.y);
        this.hoverG.closePath();
        this.hoverG.fillPath();

        this.hoverG.lineStyle(2, THEME.runeGold, 0.45);
        this.hoverG.strokePath();
    }
}
