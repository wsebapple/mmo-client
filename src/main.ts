import Phaser from "phaser";

type MsgType =
    | "AUTH"
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

    level?: number;
    exp?: number;
    expNeed?: number;
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

type Kind = "P" | "M" | "D";

function formatLv(level?: number) {
    return level == null ? "Lv?" : `Lv${level}`;
}

function kindLabel(kind: Kind, id: number) {
    if (kind === "P") return `P${id}`;
    if (kind === "M") return `M${id}`;
    return `DROP`;
}

function entityHeadText(v: EntityView) {
    const kind = v.kind as Kind;
    if (kind === "D") return "DROP";
    if (kind === "M") return `M${v.id} ${formatLv(v.level)}  ${v.hp}/${v.maxHp}`;
    return `P${v.id} ${formatLv(v.level)}`;
}

// 드랍(포션) 기준: 타일 꼭지점(엔티티 위치)에서 위로 올려서 "바닥 접지"
const DROP_FOOT_Y = 12;

const THEME = {
    bg: 0x161616,
    grid: 0x2c2c2c,

    player: 0x3d8bff,
    monster: 0xb10f0f,
    drop: 0xe6d28a,

    text: "#e6e6e6",
    subText: "#bdbdbd",

    hpBg: 0x2b2b2b,
    hpFg: 0x49ff7a,
    hpLow: 0xff5050,

    uiPanel: 0x000000,
    uiPanelAlpha: 0.55,
    uiHp: 0xff3333,
    toast: "#fff2aa",

    metalRim: 0x0b0b0b,
    bone: 0xd8d0b8,
    ember: 0xff9a3c,

    bloodDark: 0x3b0606,
    bloodMid: 0x7a0b0b,
    runeGold: 0xd6b15a,
};

function clamp01(v: number) {
    return Phaser.Math.Clamp(v, 0, 1);
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function angleLerp(current: number, target: number, t: number) {
    const d = Phaser.Math.Angle.Wrap(target - current);
    return current + d * t;
}

function shade(hex: number, amt: number) {
    const r = Phaser.Math.Clamp(((hex >> 16) & 255) + amt, 0, 255);
    const g = Phaser.Math.Clamp(((hex >> 8) & 255) + amt, 0, 255);
    const b = Phaser.Math.Clamp((hex & 255) + amt, 0, 255);
    return (r << 16) | (g << 8) | b;
}

function rotVec(x: number, y: number, rot: number) {
    return new Phaser.Math.Vector2(x, y).rotate(rot);
}

type EntityRender = {
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

class MainScene extends Phaser.Scene {
    ws!: WebSocket;
    myId = 0;
    myTargetId = 0;

    lastEntityView = new Map<number, EntityView>();
    entities = new Map<number, EntityRender>();

    seq = 0;

    targetRingOuter?: Phaser.GameObjects.Ellipse;
    targetRingInner?: Phaser.GameObjects.Ellipse;

    uiLayer!: Phaser.GameObjects.Container;

    // 플레이어 HUD(하단 중앙)
    playerHud!: Phaser.GameObjects.Container;
    hpBarBg!: Phaser.GameObjects.Rectangle;
    hpBarFg!: Phaser.GameObjects.Rectangle;
    hpText!: Phaser.GameObjects.Text;

    expBarBg!: Phaser.GameObjects.Rectangle;
    expBarFg!: Phaser.GameObjects.Rectangle;
    expText!: Phaser.GameObjects.Text;

    // 타겟 프레임
    frameBg!: Phaser.GameObjects.Rectangle;
    targetName!: Phaser.GameObjects.Text;
    targetHpBg!: Phaser.GameObjects.Rectangle;
    targetHpFg!: Phaser.GameObjects.Rectangle;
    targetHpText!: Phaser.GameObjects.Text;

    toastText!: Phaser.GameObjects.Text;
    toastTimer?: Phaser.Time.TimerEvent;

    hoverG!: Phaser.GameObjects.Graphics;
    hoverTile = { x: -999, y: -999 };

    drawGridEnabled = true;

    create() {
        const cam = this.cameras.main;
        cam.setBackgroundColor(THEME.bg);

        if (this.drawGridEnabled) this.drawIsoGrid(120, 120);

        const start = worldToScreen(18, 18);
        cam.centerOn(start.sx, start.sy);

        this.hoverG = this.add.graphics();
        this.hoverG.setDepth(2500);

        this.createTargetRing();
        this.createHud();
        this.scale.on("resize", () => this.layoutHud());

        this.ws = new WebSocket(`ws://${location.hostname}:8080/ws`);
        this.ws.onopen = () => {
            const savedId = Number(localStorage.getItem("playerId") || "0");
            this.send("AUTH", { playerId: savedId });
        };
        this.ws.onmessage = (ev) => this.onWs(ev.data);

        // 호버
        this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
            const w = screenToWorld(p.worldX, p.worldY);
            const tx = this.mapClampX(Math.round(w.x));
            const ty = this.mapClampY(Math.round(w.y));

            if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;
            this.hoverTile.x = tx;
            this.hoverTile.y = ty;
            this.drawHoverTile(tx, ty);
        });

        // 클릭
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
                    const targetRad = a - Math.PI / 4; // 아이소 보정
                    r.facingRad = angleLerp(r.facingRad, targetRad, 0.18);
                    r.lastWX = v.x;
                    r.lastWY = v.y;
                }
            }

            this.renderEntity(r, v);
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
        g.setDepth(-1000);
    }

    // ---------- Hover Tile ----------
    mapClampX(x: number) {
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

    // ---------- Picking ----------
    pickEntityAtScreen(sx: number, sy: number, kind: Kind): number | null {
        let best: { id: number; d2: number } | null = null;

        const cfg =
            kind === "D"
                ? { r2: 3400, ox: 0, oy: -DROP_FOOT_Y } // 드랍은 위로 올려져 있으니 그만큼 보정
                : kind === "M"
                    ? { r2: 2200, ox: 0, oy: -4 }
                    : { r2: 2000, ox: 0, oy: -6 };

        for (const [id, r] of this.entities.entries()) {
            if (r.kind !== kind) continue;

            const cx = r.c.x + cfg.ox;
            const cy = r.c.y + cfg.oy;

            const dx = cx - sx;
            const dy = cy - sy;
            const d2 = dx * dx + dy * dy;

            if (d2 < cfg.r2) {
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
            localStorage.setItem("playerId", String(this.myId));
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

    // ---------- Entity ----------
    upsertEntity(e: EntityView) {
        const { sx, sy } = worldToScreen(e.x, e.y);

        const kind = e.kind as Kind;
        let r = this.entities.get(e.id);

        if (!r) {
            r = this.createEntityRender(e.id, kind, e);
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
            this.setMyHp(e.hp, e.maxHp);
            this.cameras.main.centerOn(sx, sy);
            this.setMyLevelExp(e.level ?? 1, e.exp ?? 0, e.expNeed ?? 0);
        }
    }

    setMyLevelExp(level: number, exp: number, expNeed: number) {
        const ratio = expNeed > 0 ? exp / expNeed : 0;
        this.expBarFg.width = 216 * clamp01(ratio);
        this.expText.setText(`LV ${level}  EXP ${exp}/${expNeed || "?"}`);
    }

    createEntityRender(id: number, kind: Kind, e0: EntityView): EntityRender {
        const shadow = this.add.ellipse(0, 12, kind === "P" ? 34 : 30, kind === "P" ? 16 : 14, 0x000000, 0.38);

        const floorG = this.add.graphics();
        floorG.setBlendMode(Phaser.BlendModes.ADD);

        const bodyG = this.add.graphics();

        const name = this.add.text(-22, -40, kindLabel(kind, id), {
            fontSize: "10px",
            color: THEME.subText,
        });

        let hpBarBg: Phaser.GameObjects.Rectangle | undefined;
        let hpBarFg: Phaser.GameObjects.Rectangle | undefined;

        const children: Phaser.GameObjects.GameObject[] = [floorG, shadow, bodyG, name];

        if (kind !== "D") {
            hpBarBg = this.add.rectangle(-18, 18, 36, 6, THEME.hpBg).setOrigin(0, 0.5);
            hpBarFg = this.add.rectangle(-18, 18, 34, 4, THEME.hpFg).setOrigin(0, 0.5);
            children.push(hpBarBg, hpBarFg);
        }

        const c = this.add.container(0, 0, children);
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

        this.renderEntity(r, e0);
        return r;
    }

    // ---------- Render (정리) ----------
    renderEntity(r: EntityRender, e: EntityView) {
        const floor = r.floorG;
        const body = r.bodyG;

        floor.clear();
        body.clear();

        if (r.kind === "D") {
            this.drawDropPotion(r, e);
            return;
        }

        if (r.kind === "P") {
            this.drawPlayerKnight(r, e);
            return;
        }

        this.drawMonsterDemon(r, e);
    }

    // ---- DROP: 포션 ----
    drawDropPotion(r: EntityRender, e: EntityView) {
        const floor = r.floorG;
        const body = r.bodyG;

        // 그림자: 꼭지점 근처(접지)
        r.shadow.setVisible(true);
        r.shadow.setPosition(0, 2);
        r.shadow.setScale(0.55, 0.40);
        r.shadow.setAlpha(0.45);

        // 포션은 꼭지점 기준 위로 올려서 바닥에 닿는 느낌
        body.setY(-DROP_FOOT_Y);

        const liquid = (e.id % 2) === 0 ? 0x2b66ff : 0xc61a1a;
        const rim = THEME.metalRim;

        // 은은한 글로우(너무 튀면 타일 판별이 어려워짐)
        floor.setBlendMode(Phaser.BlendModes.ADD);
        floor.fillStyle(liquid, 0.015);
        floor.fillCircle(0, 0, 10);

        // 짧고 뚱뚱 + 작게
        const BW = 11;
        const BH = 9;

        // 몸통
        body.fillStyle(THEME.bone, 0.12);
        body.lineStyle(2, rim, 0.9);
        body.fillRoundedRect(-BW / 2, -BH, BW, BH, 5);
        body.strokeRoundedRect(-BW / 2, -BH, BW, BH, 5);

        // 액체
        body.fillStyle(liquid, 0.90);
        body.fillRoundedRect(-BW / 2 + 1, -6, BW - 2, 4, 4);

        // 목
        body.fillStyle(THEME.bone, 0.14);
        body.fillRoundedRect(-4, -BH - 5, 8, 5, 3);
        body.strokeRoundedRect(-4, -BH - 5, 8, 5, 3);

        // 마개
        body.fillStyle(THEME.runeGold, 0.28);
        body.fillRect(-4, -BH - 8, 8, 3);
        body.lineStyle(2, rim, 0.7);
        body.strokeRect(-4, -BH - 8, 8, 3);

        // 하이라이트
        body.fillStyle(0xffffff, 0.10);
        body.fillCircle(-2, -BH + 2, 2);

        body.setY(0);
    }

    // ---- PLAYER: 기사(휴머노이드) + 방향(짧은 검) ----
    drawPlayerKnight(r: EntityRender, e: EntityView) {
        const floor = r.floorG;
        const body = r.bodyG;

        // 바닥 룬(플레이어는 은은한 황동 링)
        r.shadow.setVisible(true);
        r.shadow.setPosition(0, 12);
        r.shadow.setScale(0.75, 0.55);
        r.shadow.setAlpha(0.33);

        const pulse = 0.45 + 0.25 * Math.sin(r.pulseT * 2.2);
        floor.setBlendMode(Phaser.BlendModes.ADD);
        floor.lineStyle(2, THEME.runeGold, 0.06 + pulse * 0.04);
        floor.strokeCircle(0, 0, 18);
        floor.lineStyle(2, THEME.runeGold, 0.03 + pulse * 0.03);
        floor.strokeCircle(0, 0, 24);

        const rot = r.facingRad;
        const rim = THEME.metalRim;

        const steel = 0x8f9aa7;
        const steelDark = 0x5b6673;
        const cloth = 0x243b7a;

        // 사람 실루엣: 너무 위로 뜨면 이상하니 딱 한 번만 보정
        const oy = -6;

        // 다리(짧고 확실하게 2개)
        body.fillStyle(steelDark, 0.95);
        body.lineStyle(2, rim, 0.55);
        {
            const a = rotVec(-4, 5 + oy, rot);
            const b = rotVec(-1, 5 + oy, rot);
            const c = rotVec(-1, 13 + oy, rot);
            const d = rotVec(-4, 13 + oy, rot);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();
        }
        {
            const a = rotVec(1, 5 + oy, rot);
            const b = rotVec(4, 5 + oy, rot);
            const c = rotVec(4, 13 + oy, rot);
            const d = rotVec(1, 13 + oy, rot);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();
        }

        // 몸통(갑옷)
        body.fillStyle(steel, 0.92);
        body.lineStyle(2, rim, 0.7);
        {
            const a = rotVec(-7, -4 + oy, rot);
            const b = rotVec(7, -4 + oy, rot);
            const c = rotVec(6, 6 + oy, rot);
            const d = rotVec(-6, 6 + oy, rot);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();
        }

        // 머리(투구) — 원형이라 “사람” 인지가 확 올라감
        body.fillStyle(steel, 0.95);
        body.lineStyle(2, rim, 0.75);
        {
            const p = rotVec(0, -13 + oy, rot);
            body.fillCircle(p.x, p.y, 5);
            body.strokeCircle(p.x, p.y, 5);

            // 시야 슬롯(짧게)
            body.fillStyle(0x0b0b0b, 0.45);
            const s1 = rotVec(-3, -13 + oy, rot);
            const s2 = rotVec(3, -13 + oy, rot);
            const s3 = rotVec(3, -12 + oy, rot);
            const s4 = rotVec(-3, -12 + oy, rot);
            body.beginPath(); body.moveTo(s1.x,s1.y); body.lineTo(s2.x,s2.y); body.lineTo(s3.x,s3.y); body.lineTo(s4.x,s4.y); body.closePath();
            body.fillPath();
        }

        // 망토(뒤쪽) — 작게만(과하면 덩어리로 보임)
        body.fillStyle(cloth, 0.20 + 0.08 * pulse);
        {
            const back = rot + Math.PI;
            const a = rotVec(-6, -2 + oy, back);
            const b = rotVec(6, -2 + oy, back);
            const c = rotVec(9, 10 + oy, back);
            const d = rotVec(-9, 10 + oy, back);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath();
        }

        // 방패(왼손) — 너무 크면 “몸이 안 보임”
        body.fillStyle(steelDark, 0.9);
        body.lineStyle(2, rim, 0.85);
        {
            const a = rotVec(-12, -6 + oy, rot);
            const b = rotVec(-7, -7 + oy, rot);
            const c = rotVec(-6, 2 + oy, rot);
            const d = rotVec(-11, 4 + oy, rot);
            body.beginPath(); body.moveTo(a.x,a.y); body.lineTo(b.x,b.y); body.lineTo(c.x,c.y); body.lineTo(d.x,d.y); body.closePath();
            body.fillPath(); body.strokePath();
        }

        // 검(전방 표시) — 뿔처럼 안 보이게: “짧고 넓게”
        {
            const handY = -4 + oy;
            const swordLen = 16;
            const swordW = 4;

            const tip = rotVec(0, handY - swordLen, rot);
            const bl = rotVec(-swordW, handY - 2, rot);
            const br = rotVec(swordW, handY - 2, rot);

            body.fillStyle(0xe6e6e6, 0.90);
            body.beginPath();
            body.moveTo(tip.x, tip.y);
            body.lineTo(br.x, br.y);
            body.lineTo(bl.x, bl.y);
            body.closePath();
            body.fillPath();

            body.lineStyle(2, rim, 0.85);
            body.strokePath();

            // 가드
            body.lineStyle(3, rim, 0.85);
            const g1 = rotVec(-7, handY - 2, rot);
            const g2 = rotVec(7, handY - 2, rot);
            body.beginPath(); body.moveTo(g1.x,g1.y); body.lineTo(g2.x,g2.y); body.strokePath();
        }
    }

    // ---- MONSTER: 기존 스타일 유지(조금 정돈) ----
    drawMonsterDemon(r: EntityRender, e: EntityView) {
        const floor = r.floorG;
        const body = r.bodyG;

        const base = THEME.monster;
        const rim = THEME.metalRim;

        const pulse = 0.45 + 0.25 * Math.sin(r.pulseT * 2.2);
        const glow = shade(base, 25);

        // 바닥 피안개
        const hpRatio = e.maxHp > 0 ? clamp01(e.hp / e.maxHp) : 1;
        const anger = 1 - hpRatio;

        r.shadow.setVisible(true);
        r.shadow.setPosition(0, 12);
        r.shadow.setScale(0.72, 0.55);
        r.shadow.setAlpha(0.30);

        floor.setBlendMode(Phaser.BlendModes.ADD);
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

        // 본체(림 + 코어)
        body.lineStyle(3, rim, 0.9);
        body.strokeCircle(0, 0, 12);
        body.lineStyle(2, glow, 0.55);
        body.strokeCircle(0, 0, 12);

        body.fillStyle(shade(base, -35), 0.60);
        body.fillCircle(0, 0, 11);
        body.fillStyle(glow, 0.10 + pulse * 0.06);
        body.fillCircle(-3, -4, 4);

        // 방향(블레이드)
        const rot = r.facingRad;
        const bladeLen = 22;
        const bladeW = 5;
        const guardW = 10;

        const tip = rotVec(0, -bladeLen, rot);
        const baseL = rotVec(-bladeW, -8, rot);
        const baseR = rotVec(bladeW, -8, rot);
        const midL = rotVec(-bladeW, -16, rot);
        const midR = rotVec(bladeW, -16, rot);

        const guardL = rotVec(-guardW, -6, rot);
        const guardR = rotVec(guardW, -6, rot);

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

        // 뒤쪽 가시
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
        this.targetRingOuter.y = t.c.y + 12;
        this.targetRingOuter.setDepth(t.c.depth - 1);

        this.targetRingInner.x = t.c.x;
        this.targetRingInner.y = t.c.y + 12;
        this.targetRingInner.setDepth(t.c.depth - 1);

        this.setTargetFrame(kindLabel(v.kind as Kind, v.id), v.level, v.hp, v.maxHp);
    }

    // ---------- Combat FX ----------
    spawnFloatingDamage(p: CombatPayload) {
        const target = this.entities.get(p.targetId);
        if (!target) return;

        const text = p.miss ? "MISS" : `-${p.dmg}`;
        const color = p.miss ? "#bdbdbd" : p.crit ? "#ffd34d" : "#ffffff";
        const size = p.crit ? "16px" : "14px";

        const t = this.add
            .text(target.c.x, target.c.y - 56, text, { fontSize: size, color })
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
        this.uiLayer.setScrollFactor(0);

        // 타겟 프레임(상단 중앙)
        this.frameBg = this.add
            .rectangle(w / 2 - 140, 10, 280, 52, THEME.uiPanel, THEME.uiPanelAlpha)
            .setOrigin(0, 0);

        this.targetName = this.add.text(w / 2 - 140 + 10, 16, "대상 없음", {
            fontSize: "12px",
            color: THEME.text,
        });

        this.targetHpBg = this.add.rectangle(w / 2 - 140 + 10, 36, 260, 10, 0x333333).setOrigin(0, 0);
        this.targetHpFg = this.add.rectangle(w / 2 - 140 + 10, 36, 260, 10, THEME.uiHp).setOrigin(0, 0);

        this.targetHpText = this.add.text(w / 2 - 140 + 10, 48, "", {
            fontSize: "11px",
            color: THEME.subText,
        });

        this.uiLayer.add([this.frameBg, this.targetName, this.targetHpBg, this.targetHpFg, this.targetHpText]);

        // 토스트
        this.toastText = this.add.text(w / 2, h - 160, "", { fontSize: "14px", color: THEME.toast }).setOrigin(0.5);
        this.toastText.setAlpha(0);
        this.uiLayer.add(this.toastText);

        // 플레이어 HUD(하단 중앙)
        this.playerHud = this.add.container(w / 2, h - 90).setDepth(5000);
        this.playerHud.setScrollFactor(0);

        const panelBg = this.add.rectangle(0, 0, 260, 72, THEME.uiPanel, THEME.uiPanelAlpha).setOrigin(0.5);

        this.hpBarBg = this.add.rectangle(-110, -10, 220, 14, 0x333333).setOrigin(0, 0.5);
        this.hpBarFg = this.add.rectangle(-108, -10, 216, 10, THEME.uiHp).setOrigin(0, 0.5);
        this.hpText = this.add.text(0, -28, "HP 0/0", { fontSize: "12px", color: THEME.text }).setOrigin(0.5);

        this.expBarBg = this.add.rectangle(-110, 14, 220, 8, 0x333333).setOrigin(0, 0.5);
        this.expBarFg = this.add.rectangle(-108, 14, 216, 6, 0x4da3ff).setOrigin(0, 0.5);
        this.expText = this.add.text(0, 28, "LV 1  EXP 0/0", { fontSize: "11px", color: THEME.subText }).setOrigin(0.5);

        this.playerHud.add([panelBg, this.hpBarBg, this.hpBarFg, this.hpText, this.expBarBg, this.expBarFg, this.expText]);

        this.layoutHud();
    }

    layoutHud() {
        const w = this.scale.width;
        const h = this.scale.height;

        if (this.playerHud) this.playerHud.setPosition(w / 2, h - 90);
        if (this.toastText) this.toastText.setPosition(w / 2, h - 160);

        if (this.frameBg) this.frameBg.setPosition(w / 2 - 140, 10);
        if (this.targetName) this.targetName.setPosition(w / 2 - 140 + 10, 16);
        if (this.targetHpBg) this.targetHpBg.setPosition(w / 2 - 140 + 10, 36);
        if (this.targetHpFg) this.targetHpFg.setPosition(w / 2 - 140 + 10, 36);
        if (this.targetHpText) this.targetHpText.setPosition(w / 2 - 140 + 10, 48);
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
