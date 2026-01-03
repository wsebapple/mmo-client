import Phaser from "phaser";

type MsgType =
    | "WELCOME"
    | "STATE_DELTA"
    | "COMBAT"
    | "MOVE_REQ"
    | "TARGET_REQ"
    | "PICKUP_REQ";

type WsMessage<T> = { type: MsgType; payload: T };

type WelcomePayload = { playerId: number; mapId: string; tickRate: number };
type EntityView = {
    id: number;
    kind: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    targetId: number;

    // ✅ 추가
    level?: number;     // 서버가 보내면 표시
    exp?: number;       // (선택) 서버가 보내면 HUD에 표시
    expNeed?: number;   // (선택) 다음 레벨 필요 경험치
};
type StateDeltaPayload = { tick: number; updates: EntityView[]; removes: number[] };
type CombatPayload = {
    tick: number;
    attackerId: number;
    targetId: number;
    dmg: number;
    crit: boolean;
    miss: boolean;
    targetHp: number;
};

const TILE_W = 64;
const TILE_H = 32;

function worldToScreen(x: number, y: number) {
    const sx = (x - y) * (TILE_W / 2);
    const sy = (x + y) * (TILE_H / 2);
    return { sx, sy };
}

function screenToWorld(sx: number, sy: number) {
    const tx = (sy / (TILE_H / 2) + sx / (TILE_W / 2)) / 2;
    const ty = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
    return { x: tx, y: ty };
}

function formatLv(level?: number) {
    return level == null ? "Lv?" : `Lv${level}`;
}

function entityHeadText(v: EntityView) {
    const kind = v.kind as Kind;

    if (kind === "D") return "DROP";

    // 몬스터: HP/레벨 같이
    if (kind === "M") {
        return `M${v.id} ${formatLv(v.level)}  ${v.hp}/${v.maxHp}`;
    }

    // 플레이어: 레벨만(원하면 HP도 같이 가능)
    return `P${v.id} ${formatLv(v.level)}`;
}

type Kind = "P" | "M" | "D";

const THEME = {
    bg: 0x161616,
    grid: 0x2c2c2c,

    player: 0x4da3ff,
    monster: 0xff5a5a,
    drop: 0xffff66,

    text: "#e6e6e6",
    subText: "#bdbdbd",

    hpBg: 0x2b2b2b,
    hpFg: 0x49ff7a,
    hpLow: 0xff5050,

    uiPanel: 0x000000,
    uiPanelAlpha: 0.55,
    uiHp: 0xff3333,
    toast: "#fff2aa",
};

function clamp01(v: number) {
    return Phaser.Math.Clamp(v, 0, 1);
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function kindLabel(kind: Kind, id: number) {
    if (kind === "P") return `P${id}`;
    if (kind === "M") return `M${id}`;
    return `DROP`;
}

type EntityRender = {
    c: Phaser.GameObjects.Container;
    kind: Kind;
    id: number;

    name: Phaser.GameObjects.Text;
    hpBarBg?: Phaser.GameObjects.Rectangle;
    hpBarFg?: Phaser.GameObjects.Rectangle;

    hpShown: number;
};

class MainScene extends Phaser.Scene {
    ws!: WebSocket;
    myId = 0;
    myTargetId = 0;

    lastEntityView = new Map<number, EntityView>();
    entities = new Map<number, EntityRender>();

    seq = 0;

    // 타겟 링
    targetRingOuter?: Phaser.GameObjects.Ellipse;
    targetRingInner?: Phaser.GameObjects.Ellipse;

    // HUD
    uiLayer!: Phaser.GameObjects.Container;
    hpBarBg!: Phaser.GameObjects.Rectangle;
    hpBarFg!: Phaser.GameObjects.Rectangle;
    hpText!: Phaser.GameObjects.Text;

    targetName!: Phaser.GameObjects.Text;
    targetHpBg!: Phaser.GameObjects.Rectangle;
    targetHpFg!: Phaser.GameObjects.Rectangle;

    toastText!: Phaser.GameObjects.Text;
    toastTimer?: Phaser.Time.TimerEvent;

    // ✅ 타일 호버 하이라이트
    hoverG!: Phaser.GameObjects.Graphics;
    hoverTile = { x: -999, y: -999 };

    // 옵션: 그리드 무겁다면 false
    drawGridEnabled = true;

    // ✅ EXP HUD
    expBarBg!: Phaser.GameObjects.Rectangle;
    expBarFg!: Phaser.GameObjects.Rectangle;
    expText!: Phaser.GameObjects.Text;
    targetHpText!: Phaser.GameObjects.Text;

    create() {
        const cam = this.cameras.main;
        cam.setBackgroundColor(THEME.bg);

        if (this.drawGridEnabled) this.drawIsoGrid(120, 120);

        const start = worldToScreen(18, 18);
        cam.centerOn(start.sx, start.sy);

        // ✅ 호버 하이라이트 레이어
        this.hoverG = this.add.graphics();
        this.hoverG.setDepth(2500);
        this.hoverG.setPosition(0, 0);

        this.createTargetRing();
        this.createHud();

        this.ws = new WebSocket(`ws://${location.hostname}:8080/ws`);
        this.ws.onmessage = (ev) => this.onWs(ev.data);

        // ✅ 마우스 호버 타일 표시
        this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
            const sx = p.worldX;
            const sy = p.worldY;

            const w = screenToWorld(sx, sy);

            const tx = this.mapClampX(Math.round(w.x));
            const ty = this.mapClampY(Math.round(w.y));

            if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;

            this.hoverTile.x = tx;
            this.hoverTile.y = ty;

            this.drawHoverTile(tx, ty);
        });

        // 클릭: (1) 드랍 -> 줍기 (2) 몹 -> 타겟 (3) 이동
        this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
            const sx = p.worldX;
            const sy = p.worldY;

            const dropHit = this.pickEntityAtScreen(sx, sy, "D");
            if (dropHit) {
                this.send("PICKUP_REQ", { dropId: dropHit });
                return;
            }

            const mobHit = this.pickEntityAtScreen(sx, sy, "M");
            if (mobHit) {
                this.send("TARGET_REQ", { targetId: mobHit });
                return;
            }

            // (선택) 타일 스냅 이동이 더 예쁨
            const w = screenToWorld(sx, sy);
            const tx = this.mapClampX(Math.round(w.x));
            const ty = this.mapClampY(Math.round(w.y));
            this.send("MOVE_REQ", { seq: ++this.seq, x: tx, y: ty });
        });
    }

    update(_: number, dtMs: number) {
        const dt = dtMs / 1000;
        const smoothing = 1 - Math.pow(0.001, dt);

        for (const r of this.entities.values()) {
            const v = this.lastEntityView.get(r.id);
            if (!v || r.kind === "D") continue;

            r.hpShown = lerp(r.hpShown, v.hp, smoothing);

            const ratio = v.maxHp > 0 ? clamp01(r.hpShown / v.maxHp) : 0;
            if (r.hpBarFg) {
                const full = 34;
                r.hpBarFg.width = full * ratio;
                r.hpBarFg.fillColor = ratio <= 0.3 ? THEME.hpLow : THEME.hpFg;
            }
        }
    }

    // ---------- Grid ----------
    drawIsoGrid(w: number, h: number) {
        const g = this.add.graphics();
        g.lineStyle(1, THEME.grid, 1);

        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                const { sx, sy } = worldToScreen(x, y);
                g.strokePoints(
                    [
                        new Phaser.Math.Vector2(sx, sy - TILE_H / 2),
                        new Phaser.Math.Vector2(sx + TILE_W / 2, sy),
                        new Phaser.Math.Vector2(sx, sy + TILE_H / 2),
                        new Phaser.Math.Vector2(sx - TILE_W / 2, sy),
                        new Phaser.Math.Vector2(sx, sy - TILE_H / 2),
                    ],
                    false
                );
            }
        }
        g.setPosition(0, 0);
        g.setDepth(-1000);
    }

    // ---------- Hover Tile ----------
    mapClampX(x: number) {
        // 서버 맵이 200x200이면 0~199
        return Phaser.Math.Clamp(x, 0, 199);
    }
    mapClampY(y: number) {
        return Phaser.Math.Clamp(y, 0, 199);
    }

    drawHoverTile(tx: number, ty: number) {
        this.hoverG.clear();

        const { sx, sy } = worldToScreen(tx, ty);

        const top = new Phaser.Math.Vector2(sx, sy - TILE_H / 2);
        const right = new Phaser.Math.Vector2(sx + TILE_W / 2, sy);
        const bottom = new Phaser.Math.Vector2(sx, sy + TILE_H / 2);
        const left = new Phaser.Math.Vector2(sx - TILE_W / 2, sy);

        // 살짝 채움 + 두꺼운 윤곽
        this.hoverG.fillStyle(0xffffff, 0.08);
        this.hoverG.beginPath();
        this.hoverG.moveTo(top.x, top.y);
        this.hoverG.lineTo(right.x, right.y);
        this.hoverG.lineTo(bottom.x, bottom.y);
        this.hoverG.lineTo(left.x, left.y);
        this.hoverG.closePath();
        this.hoverG.fillPath();

        this.hoverG.lineStyle(3, 0xffffff, 0.85);
        this.hoverG.strokePath();

        // 코너 포인트(은은한 강조)
        this.hoverG.fillStyle(0xffffff, 0.22);
        this.hoverG.fillCircle(top.x, top.y, 2);
        this.hoverG.fillCircle(right.x, right.y, 2);
        this.hoverG.fillCircle(bottom.x, bottom.y, 2);
        this.hoverG.fillCircle(left.x, left.y, 2);
    }

    // ---------- Picking ----------
    pickEntityAtScreen(sx: number, sy: number, kind: Kind): number | null {
        let best: { id: number; d2: number } | null = null;

        for (const [id, r] of this.entities.entries()) {
            if (r.kind !== kind) continue;

            const dx = r.c.x - sx;
            const dy = r.c.y - sy;
            const d2 = dx * dx + dy * dy;

            if (d2 < 900) {
                if (!best || d2 < best.d2) best = { id, d2 };
            }
        }
        return best ? best.id : null;
    }

    // ---------- WS ----------
    onWs(raw: string) {
        const msg = JSON.parse(raw) as WsMessage<any>;

        if (msg.type === "WELCOME") {
            const p = msg.payload as WelcomePayload;
            this.myId = p.playerId;
            this.toast(`접속: P${this.myId}`);
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

    // ---------- Entity render ----------
    upsertEntity(e: EntityView) {
        const { sx, sy } = worldToScreen(e.x, e.y);
        const px = sx;
        const py = sy;

        const kind = e.kind as Kind;
        let r = this.entities.get(e.id);

        if (!r) {
            r = this.createEntityRender(e.id, kind);
            this.entities.set(e.id, r);
        }

        r.c.x = px;
        r.c.y = py;

        const newText = entityHeadText(e);
        if (r.name.text !== newText) r.name.setText(newText); // ✅ 텍스트 변경 있을 때만

        if (kind !== "D") {
            if (r.hpShown === -1) r.hpShown = e.hp; // 최초 싱크
        }

        if (e.id === this.myId) {
            this.myTargetId = e.targetId || 0;
            this.setMyHp(e.hp, e.maxHp);
            this.cameras.main.centerOn(px, py);
            this.setMyLevelExp(e.level ?? 1, e.exp ?? 0, e.expNeed ?? 0);
        }
    }

    setMyLevelExp(level: number, exp: number, expNeed: number) {
        const ratio = expNeed > 0 ? exp / expNeed : 0;
        this.expBarFg.width = 216 * clamp01(ratio);
        this.expText.setText(`LV ${level}  EXP ${exp}/${expNeed || "?"}`);
    }

    createEntityRender(id: number, kind: Kind): EntityRender {
        const color = kind === "P" ? THEME.player : kind === "M" ? THEME.monster : THEME.drop;

        const shadow = this.add.ellipse(0, 8, 22, 10, 0x000000, 0.35);

        const body =
            kind === "D"
                ? this.add.rectangle(0, 0, 12, 12, color)
                : this.add.circle(0, 0, 10, color);

        if (body instanceof Phaser.GameObjects.Arc) body.setStrokeStyle(2, 0x111111, 0.9);
        if (body instanceof Phaser.GameObjects.Rectangle) body.setStrokeStyle(2, 0x111111, 0.9);

        const name = this.add.text(-18, -30, kindLabel(kind, id, undefined), {
            fontSize: "10px",
            color: THEME.subText,
        });

        let hpBarBg: Phaser.GameObjects.Rectangle | undefined;
        let hpBarFg: Phaser.GameObjects.Rectangle | undefined;

        const children: Phaser.GameObjects.GameObject[] = [shadow, body, name];

        if (kind !== "D") {
            hpBarBg = this.add.rectangle(-18, 14, 36, 6, THEME.hpBg).setOrigin(0, 0.5);
            hpBarFg = this.add.rectangle(-18, 14, 34, 4, THEME.hpFg).setOrigin(0, 0.5);
            children.push(hpBarBg, hpBarFg);
        }

        const c = this.add.container(0, 0, children);
        c.setData("kind", kind);
        c.setData("id", id);

        return {
            c,
            kind,
            id,
            name,
            hpBarBg,
            hpBarFg,
            hpShown: kind === "D" ? 0 : -1,
        };
    }

    removeEntity(id: number) {
        const r = this.entities.get(id);
        if (!r) return;
        r.c.destroy(true);
        this.entities.delete(id);
    }

    sortDepth() {
        const arr = Array.from(this.entities.values());
        arr.sort((a, b) => a.c.y - b.c.y);
        arr.forEach((r, i) => r.c.setDepth(i));
    }

    // ---------- Target ring ----------
    createTargetRing() {
        this.targetRingOuter = this.add.ellipse(0, 0, 44, 22);
        this.targetRingOuter.setStrokeStyle(3, 0xff3333, 0.85);
        this.targetRingOuter.setVisible(false);
        this.targetRingOuter.setDepth(3000);

        this.targetRingInner = this.add.ellipse(0, 0, 34, 16);
        this.targetRingInner.setStrokeStyle(2, 0xff9999, 0.75);
        this.targetRingInner.setVisible(false);
        this.targetRingInner.setDepth(3000);

        this.tweens.add({
            targets: [this.targetRingOuter, this.targetRingInner],
            scaleX: 1.06,
            scaleY: 1.06,
            duration: 420,
            yoyo: true,
            repeat: -1,
        });
    }

    updateTargetRingAndHud() {
        if (!this.targetRingOuter || !this.targetRingInner) return;

        if (!this.myTargetId) {
            this.targetRingOuter.setVisible(false);
            this.targetRingInner.setVisible(false);
            this.setTargetFrame("대상 없음", undefined, 0, 1);
            return;
        }

        const t = this.entities.get(this.myTargetId);
        const v = this.lastEntityView.get(this.myTargetId);

        if (!t || !v) {
            this.targetRingOuter.setVisible(false);
            this.targetRingInner.setVisible(false);
            this.setTargetFrame("대상 없음", undefined, 0, 1);
            return;
        }

        this.targetRingOuter.setVisible(true);
        this.targetRingInner.setVisible(true);

        this.targetRingOuter.x = t.c.x;
        this.targetRingOuter.y = t.c.y + 10;
        this.targetRingOuter.setDepth(t.c.depth - 1);

        this.targetRingInner.x = t.c.x;
        this.targetRingInner.y = t.c.y + 10;
        this.targetRingInner.setDepth(t.c.depth - 1);

        this.setTargetFrame(
            kindLabel(v.kind as Kind, v.id, v.level),
            v.level,
            v.hp,
            v.maxHp
        );
    }

    // ---------- Combat FX ----------
    spawnFloatingDamage(p: CombatPayload) {
        const target = this.entities.get(p.targetId);
        if (!target) return;

        const text = p.miss ? "MISS" : `-${p.dmg}`;
        const color = p.miss ? "#bdbdbd" : p.crit ? "#ffd34d" : "#ffffff";
        const size = p.crit ? "16px" : "14px";

        const t = this.add
            .text(target.c.x, target.c.y - 46, text, { fontSize: size, color })
            .setOrigin(0.5);

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

    // ---------- Send ----------
    send(type: MsgType, payload: any) {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type, payload }));
    }

    // ---------- HUD ----------
    createHud() {
        const w = this.scale.width;
        const h = this.scale.height;

        this.uiLayer = this.add.container(0, 0).setDepth(5000);

        this.hpBarBg = this.add.rectangle(20, 20, 220, 16, 0x333333).setOrigin(0, 0);
        this.hpBarFg = this.add.rectangle(22, 22, 216, 12, THEME.uiHp).setOrigin(0, 0);
        this.hpText = this.add.text(20, 40, "HP 0/0", { fontSize: "12px", color: THEME.text });

        this.hpBarBg.setScrollFactor(0);
        this.hpBarFg.setScrollFactor(0);
        this.hpText.setScrollFactor(0);

        this.uiLayer.add([this.hpBarBg, this.hpBarFg, this.hpText]);

        const tfX = w / 2 - 140;
        const tfY = 10;

        const frameBg = this.add
            .rectangle(tfX, tfY, 280, 46, THEME.uiPanel, THEME.uiPanelAlpha)
            .setOrigin(0, 0);

        this.targetName = this.add.text(tfX + 10, tfY + 6, "대상 없음", {
            fontSize: "12px",
            color: THEME.text,
        });

        this.targetHpBg = this.add.rectangle(tfX + 10, tfY + 26, 260, 10, 0x333333).setOrigin(0, 0);
        this.targetHpFg = this.add.rectangle(tfX + 10, tfY + 26, 260, 10, THEME.uiHp).setOrigin(0, 0);

        frameBg.setScrollFactor(0);
        this.targetName.setScrollFactor(0);
        this.targetHpBg.setScrollFactor(0);
        this.targetHpFg.setScrollFactor(0);

        this.uiLayer.add([frameBg, this.targetName, this.targetHpBg, this.targetHpFg]);

        this.toastText = this.add
            .text(w / 2, h - 90, "", { fontSize: "14px", color: THEME.toast })
            .setOrigin(0.5);
        this.toastText.setAlpha(0);
        this.toastText.setScrollFactor(0);
        this.uiLayer.add(this.toastText);

        this.expBarBg = this.add.rectangle(20, 60, 220, 10, 0x333333).setOrigin(0, 0);
        this.expBarFg = this.add.rectangle(22, 62, 216, 6, 0x4da3ff).setOrigin(0, 0);
        this.expText = this.add.text(20, 74, "LV 1  EXP 0/0", { fontSize: "12px", color: THEME.subText });

        this.expBarBg.setScrollFactor(0);
        this.expBarFg.setScrollFactor(0);
        this.expText.setScrollFactor(0);

        this.uiLayer.add([this.expBarBg, this.expBarFg, this.expText]);

        this.targetHpText = this.add.text(tfX + 10, tfY + 38, "", {
            fontSize: "11px",
            color: THEME.subText,
        });

        this.targetHpText.setScrollFactor(0);
        this.uiLayer.add(this.targetHpText);
    }

    setMyHp(hp: number, maxHp: number) {
        const ratio = maxHp > 0 ? hp / maxHp : 0;
        this.hpBarFg.width = 216 * clamp01(ratio);
        this.hpText.setText(`HP ${hp}/${maxHp}`);
    }

    setTargetFrame(name: string, level: number | undefined, hp: number, maxHp: number) {
        const lv = level == null ? "Lv?" : `Lv${level}`;
        this.targetName.setText(`${name}  ${lv}`);

        const ratio = maxHp > 0 ? hp / maxHp : 0;
        this.targetHpFg.width = 260 * clamp01(ratio);

        this.targetHpText.setText(`HP ${hp}/${maxHp}`);
    }

    toast(msg: string) {
        this.toastText.setText(msg);
        this.toastText.setAlpha(1);
        if (this.toastTimer) this.toastTimer.remove(false);
        this.toastTimer = this.time.addEvent({
            delay: 900,
            callback: () => this.tweens.add({ targets: this.toastText, alpha: 0, duration: 250 }),
        });
    }
}

new Phaser.Game({
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: "app",
    scene: [MainScene],
});
