import type { EntityView, Kind } from "../protocol";

function formatLv(level?: number) {
    return level == null ? "Lv?" : `Lv${level}`;
}

export function kindLabel(kind: Kind, id: number) {
    if (kind === "P") return `P${id}`;
    if (kind === "M") return `M${id}`;
    return `마법의 물약`;
}

export function entityHeadText(v: EntityView) {
    const kind = v.kind as Kind;

    if (kind === "D") return "마법의 물약";
    if (kind === "M") return `M${v.id} ${formatLv(v.level)}  ${v.hp}/${v.maxHp}`;
    return `P${v.id} ${formatLv(v.level)}`;
}
