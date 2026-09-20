/**
 * Stufen aus Erfahrungspunkten.
 *
 * Feste Schwellen, keine Formel - damit ablesbar bleibt, wann was kommt. Eine
 * gerechnete Kurve waere eleganter und niemand koennte sagen, wie weit es noch
 * ist.
 *
 * Hinter den Stufen steckt nichts: sie schalten nichts frei. Sie geben der
 * Zahl einen Massstab, mehr nicht. 812 Punkte sagen allein nichts, "Stufe 7"
 * schon.
 *
 * Die Punkte selbst rechnet der Worker (worker/services/experience.ts), weil
 * er ueber alle Ergebnisse summieren kann und die Liste hier bei 100 gedeckelt
 * ist. Die Formel lebt dort, die Schwellen leben hier - jede an genau einer
 * Stelle.
 */

/**
 * Untergrenzen der Stufen 1 bis 10.
 *
 * Stufe 7 entspricht rund 18 Raetseln der Sorte 5x5 schwer oder etwa 40
 * gemischten - also einem Kapitel der Sammlung plus etwas.
 */
export const LEVEL_FLOORS = [0, 40, 100, 200, 350, 550, 800, 1100, 1500, 2000];

/** Abstand je Stufe oberhalb der letzten festen Schwelle. */
export const LEVEL_STEP = 700;

/**
 * Stufe und Fortschritt bei einem Punktestand.
 *
 * @param {number} xp
 * @returns {{ level: number, floor: number, next: number, intoLevel: number, levelSpan: number }}
 *   `intoLevel` und `levelSpan` beschreiben den Balken: wie weit in der
 *   aktuellen Stufe, und wie breit sie ist.
 */
export function levelAt(xp) {
    const points = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;

    const last = LEVEL_FLOORS[LEVEL_FLOORS.length - 1];
    let level;
    let floor;
    if (points < last) {
        // Die groesste Schwelle, die der Stand erreicht hat.
        let index = 0;
        while (index + 1 < LEVEL_FLOORS.length && LEVEL_FLOORS[index + 1] <= points) index += 1;
        level = index + 1;
        floor = LEVEL_FLOORS[index];
    } else {
        const steps = Math.floor((points - last) / LEVEL_STEP);
        level = LEVEL_FLOORS.length + steps;
        floor = last + steps * LEVEL_STEP;
    }

    const next = level < LEVEL_FLOORS.length ? LEVEL_FLOORS[level] : floor + LEVEL_STEP;
    return { level, floor, next, intoLevel: points - floor, levelSpan: next - floor };
}
