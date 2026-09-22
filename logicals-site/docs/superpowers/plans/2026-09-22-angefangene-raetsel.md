# Angefangene Rätsel sichtbar machen — Umsetzungsplan

> **Für agentische Arbeiter:** ERFORDERLICHE UNTER-FÄHIGKEIT: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, Aufgabe für Aufgabe. Die Schritte tragen Kästchen (`- [ ]`).

**Ziel:** Die Sammlung zeigt je Eintrag, ob er angefangen ist und wie weit — und „Weiterspielen" führt auf das zuletzt begonnene Rätsel statt auf einen einzigen, überschreibbaren Platz.

**Architektur:** Ein neues Modul liest die vorhandenen Spielstände aus dem lokalen Speicher, indem es die Schlüssel zerlegt (der Seed steht darin) und nur dort Werte parst, wo eine Zahl gebraucht wird. Jeder Stand bekommt vier Felder mehr und trägt sich damit selbst; der globale Fortsetzungs-Datensatz entfällt nach einem einmaligen Umzug.

**Tech-Stack:** Vanilla ES-Module, Vitest 4 (**Node, kein DOM**), Playwright 1.55.

**Spec:** `docs/superpowers/specs/2026-09-22-angefangene-raetsel-design.md`

## Globale Bedingungen

- Jede Shell-Zeile beginnt mit `rtk`, auch in `&&`-Ketten.
- Commit-Betreff: konventionelles Format **und kleiner Anfangsbuchstabe** (`feat(sammlung): …`). commitlint weist sonst zurück.
- **Niemals** einen `Co-Authored-By`-Zusatz oder irgendeinen anderen KI-Hinweis in Commits, PRs oder Kommentaren.
- Vitest läuft in **Node ohne DOM**: kein `document`, kein echtes `localStorage`. Speicher wird als Parameter hereingereicht.
- Nach jedem Teilschritt `rtk npx tsc --noEmit` — Exit 0.
- Der Speicherschlüssel lautet `logicals:play:${mode}:${room}:${player}:${themeId}:${seed}:${dimensions}:${clues}`, neun mit `:` getrennte Teile. `dimensions` ist `Kategorien×Werte`, z. B. `5x5`.
- Sichere Zuordnungen insgesamt: `Werte · Kategorien · (Kategorien − 1) / 2`.
- Regel für die Kapitelansicht: **höchstens eine Statuszeile je Eintrag**, Rangfolge gelöst → angefangen → Neu-Hinweis.

## Dateien

| Datei | Verantwortung |
|-------|---------------|
| `client/js/play/savedGames.js` (neu) | Kennt den Speicher, keinen Bildschirm: Schlüssel zerlegen, Stände lesen, jüngsten finden, Obergrenze halten |
| `test/saved-games.test.ts` (neu) | Alles daraus, mit eingehängtem Speicher |
| `client/js/play/playState.js` | `save()` schreibt `options`, `fingerprint`, `title`, `savedAt` |
| `client/js/play/playController.js` | Reicht `meta` an `save()`, `rememberForResume` entfällt, `pruneSavedGames` beim Öffnen |
| `client/js/main.js` | „Weiterspielen" liest den jüngsten Stand; einmaliger Umzug |
| `client/js/play/resumeStore.js` | entfällt |
| `client/js/screens/collectionScreen.js` | Statuszeile und Balken je Eintrag, Zahl je Kapitel |
| `client/styles/screens.css` | `.entry-row` darf `.chapter-meter` tragen |

---

### Aufgabe 1: Schlüssel zerlegen

**Dateien:**
- Erstellen: `client/js/play/savedGames.js`
- Test: `test/saved-games.test.ts`

**Schnittstellen:**
- Verbraucht: nichts.
- Liefert: `listSavedGames(playerId, storage)` → `Array<{ key, themeId, seed, categoryCount, valuesPerCategory }>`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`test/saved-games.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { listSavedGames } from '../client/js/play/savedGames.js';

/**
 * Ein Speicher, wie ihn Node nicht hat.
 *
 * `length` und `key(i)` sind der Teil der Storage-Schnittstelle, den das
 * Durchgehen braucht - ohne sie käme man an die Schlüssel gar nicht heran.
 */
function storageWith(entries: Record<string, string>) {
    const keys = Object.keys(entries);
    return {
        get length() { return keys.length; },
        key: (index: number) => keys[index] ?? null,
        getItem: (key: string) => entries[key] ?? null,
        setItem: () => {},
        removeItem: (key: string) => { delete entries[key]; keys.splice(keys.indexOf(key), 1); },
    } as unknown as Storage;
}

const WERT = JSON.stringify({ marks: [], auto: [], usedClues: [], elapsedMs: 0, solved: false });

describe('die gespeicherten Einzelspiele', () => {
    it('zerlegt den Schluessel in seine Bestandteile', () => {
        const speicher = storageWith({
            'logicals:play:solo:none:1:museum:1000003:5x5:a1b2': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([{
            key: 'logicals:play:solo:none:1:museum:1000003:5x5:a1b2',
            themeId: 'museum', seed: 1_000_003,
            categoryCount: 5, valuesPerCategory: 5,
        }]);
    });

    it('laesst Duell-Staende liegen', () => {
        /*
         * Ein Duell-Stand gehoert zu einem Raum, der laengst abgelaufen sein
         * kann. In der Sammlung hat er nichts zu suchen.
         */
        const speicher = storageWith({
            'logicals:play:duel:ABC234:1:museum:1000003:5x5:a1b2': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([]);
    });

    it('laesst fremde Spieler liegen', () => {
        const speicher = storageWith({
            'logicals:play:solo:none:2:museum:1000003:5x5:a1b2': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([]);
    });

    it('uebergeht alles, was nicht wie ein Spielstand aussieht', () => {
        const speicher = storageWith({
            'logicals.prefs.v1': '{}',
            'logicals:play:solo:none:1:museum:kaputt': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([]);
    });

    it('faellt bei gesperrtem Speicher auf eine leere Liste zurueck', () => {
        const gesperrt = {
            get length(): number { throw new Error('SecurityError'); },
            key: () => null, getItem: () => null, setItem: () => {}, removeItem: () => {},
        } as unknown as Storage;
        expect(listSavedGames(1, gesperrt)).toEqual([]);
    });
});
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

Ausführen: `cd logicals-site && rtk npx vitest run test/saved-games.test.ts`
Erwartet: FAIL, „Failed to resolve import ... savedGames.js".

- [ ] **Schritt 3: Minimal umsetzen**

`client/js/play/savedGames.js`:

```js
/**
 * Die gespeicherten Einzelspiele — gelesen aus dem Speicher, nicht aus einem Index.
 *
 * Ein mitgeschriebener Index wäre eine zweite Wahrheit neben den Ständen
 * selbst und driftete, sobald jemand den Speicher leert oder in einem zweiten
 * Tab spielt; die Sammlung zeigte dann einen Balken für ein leeres Rätsel.
 * Das Durchgehen kostet nichts, was sich messen ließe: es sind Schlüssel einer
 * Liste, keine Werte.
 *
 * Kennt den Speicher und keinen Bildschirm. `storage` ist ein Parameter, damit
 * Vitest das unter Node prüfen kann — dort gibt es kein localStorage.
 */

const PREFIX = 'logicals:play:';

/**
 * Zerlegt einen Schlüssel, oder gibt null zurück.
 *
 * Aufbau: logicals:play:<modus>:<raum>:<spieler>:<thema>:<seed>:<maße>:<hinweise>
 * Neun Teile. Alles andere ist kein Spielstand dieser App.
 *
 * @param {string} key
 * @returns {{ key: string, mode: string, room: string, playerId: number,
 *             themeId: string, seed: number,
 *             categoryCount: number, valuesPerCategory: number } | null}
 */
export function parseSavedKey(key) {
    if (!key?.startsWith(PREFIX)) return null;
    const parts = key.split(':');
    if (parts.length !== 9) return null;
    const [, , mode, room, player, themeId, seed, dimensions] = parts;
    const [categoryCount, valuesPerCategory] = dimensions.split('x').map(Number);
    const playerId = Number(player);
    if (!Number.isInteger(playerId) || !Number.isFinite(Number(seed))) return null;
    if (!Number.isInteger(categoryCount) || !Number.isInteger(valuesPerCategory)) return null;
    return {
        key, mode, room, playerId, themeId,
        seed: Number(seed), categoryCount, valuesPerCategory,
    };
}

/**
 * Alle Einzelspiel-Stände dieses Spielers — nur aus den Schlüsseln.
 *
 * Kein einziger JSON.parse: für „angefangen ja/nein" und die Zuordnung zu
 * einem Katalogeintrag reicht der Seed, und der steht im Schlüssel.
 *
 * @param {number} playerId
 * @param {Storage} [storage]
 */
export function listSavedGames(playerId, storage = localStorage) {
    const treffer = [];
    try {
        for (let index = 0; index < storage.length; index++) {
            const zerlegt = parseSavedKey(storage.key(index));
            if (!zerlegt) continue;
            if (zerlegt.mode !== 'solo' || zerlegt.room !== 'none') continue;
            if (zerlegt.playerId !== playerId) continue;
            const { key, themeId, seed, categoryCount, valuesPerCategory } = zerlegt;
            treffer.push({ key, themeId, seed, categoryCount, valuesPerCategory });
        }
    } catch {
        // Privater Modus oder gesperrter Speicher: dann eben ohne Auskunft.
        return [];
    }
    return treffer;
}
```

- [ ] **Schritt 4: Test bestätigen**

Ausführen: `cd logicals-site && rtk npx vitest run test/saved-games.test.ts`
Erwartet: PASS, 5 Tests.

- [ ] **Schritt 5: Festhalten**

```bash
cd logicals-site && rtk npx tsc --noEmit && rtk git add client/js/play/savedGames.js test/saved-games.test.ts && rtk git commit -m "feat(staende): schluessel der gespeicherten einzelspiele zerlegen"
```

---

### Aufgabe 2: Einen Stand lesen

**Dateien:**
- Ändern: `client/js/play/savedGames.js`
- Test: `test/saved-games.test.ts`

**Schnittstellen:**
- Verbraucht: `parseSavedKey(key)` aus Aufgabe 1.
- Liefert: `readSavedGame(key, storage)` → `{ sure, total, savedAt, solved, marks, options, fingerprint, title, elapsedMs } | null`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

An `test/saved-games.test.ts` anhängen (Import oben ergänzen: `readSavedGame`):

```ts
const KEY = 'logicals:play:solo:none:1:museum:1000003:3x4:a1b2';

function standMit(marks: Array<[string, string]>, extra: object = {}) {
    return JSON.stringify({
        marks, auto: [['0.1.2.2', ['0.1.0.0']]], usedClues: [1],
        elapsedMs: 61_000, solved: false, attemptKey: null,
        failedChecks: 0, resultQueued: false, ...extra,
    });
}

describe('ein gelesener Stand', () => {
    it('zaehlt nur sichere Zuordnungen', () => {
        /*
         * `no` und `maybe` sind Arbeit, aber keine Festlegung. Automatische
         * Kreuze liegen ohnehin in `auto` und nicht in `marks` - ein Anteil
         * an allen gesetzten Zellen erreichte deshalb nie 100 %.
         */
        const stand = readSavedGame(KEY, storageWith({
            [KEY]: standMit([['0.1.0.0', 'yes'], ['0.1.1.1', 'no'],
                             ['0.2.0.0', 'maybe'], ['1.2.3.3', 'yes']]),
        }));
        expect(stand?.sure).toBe(2);
        expect(stand?.marks).toBe(4);
    });

    it('rechnet die Bezugsgroesse aus den Maszen im Schluessel', () => {
        // 3 Kategorien, 4 Werte: 4 · C(3,2) = 12.
        const stand = readSavedGame(KEY, storageWith({ [KEY]: standMit([]) }));
        expect(stand?.total).toBe(12);

        const grosz = 'logicals:play:solo:none:1:museum:1000003:5x5:a1b2';
        // 5 Kategorien, 5 Werte: 5 · C(5,2) = 50.
        expect(readSavedGame(grosz, storageWith({ [grosz]: standMit([]) }))?.total).toBe(50);
    });

    it('reicht die Angaben durch, die ein Stand ueber sich selbst traegt', () => {
        const stand = readSavedGame(KEY, storageWith({
            [KEY]: standMit([['0.1.0.0', 'yes']], {
                options: { seed: 1_000_003, categoryCount: 3, valuesPerCategory: 4 },
                fingerprint: 'abc123', title: '3. Museum bei Nacht',
                savedAt: '2026-09-22T10:00:00.000Z', solved: true,
            }),
        }));
        expect(stand?.options).toEqual({ seed: 1_000_003, categoryCount: 3, valuesPerCategory: 4 });
        expect(stand?.fingerprint).toBe('abc123');
        expect(stand?.title).toBe('3. Museum bei Nacht');
        expect(stand?.savedAt).toBe('2026-09-22T10:00:00.000Z');
        expect(stand?.solved).toBe(true);
        expect(stand?.elapsedMs).toBe(61_000);
    });

    it('gibt null zurueck statt zu werfen', () => {
        // Ein Stand aus einer aelteren Fassung hat diese Felder nicht.
        const alt = readSavedGame(KEY, storageWith({ [KEY]: standMit([]) }));
        expect(alt?.options).toBeNull();
        expect(alt?.fingerprint).toBeNull();
        expect(alt?.savedAt).toBeNull();

        expect(readSavedGame(KEY, storageWith({ [KEY]: 'kein json' }))).toBeNull();
        expect(readSavedGame(KEY, storageWith({}))).toBeNull();
        expect(readSavedGame('logicals.prefs.v1', storageWith({ 'logicals.prefs.v1': '{}' }))).toBeNull();
    });
});
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

Ausführen: `cd logicals-site && rtk npx vitest run test/saved-games.test.ts`
Erwartet: FAIL, „readSavedGame is not a function".

- [ ] **Schritt 3: Minimal umsetzen**

An `client/js/play/savedGames.js` anhängen:

```js
/**
 * Wie viele sichere Zuordnungen ein Rätsel dieser Maße überhaupt hat.
 *
 * Je Kategorienpaar genau `Werte` Stück, und es gibt C(Kategorien, 2) Paare.
 * Ein 3×4 hat 12, ein 5×5 deren 50 — ein gelöstes Rätsel steht damit genau
 * auf 100 %.
 */
function sureTotal(categoryCount, valuesPerCategory) {
    return valuesPerCategory * categoryCount * (categoryCount - 1) / 2;
}

/**
 * Ein Stand, gelesen. Null, wenn der Schlüssel keiner ist oder der Wert fehlt.
 *
 * @param {string} key
 * @param {Storage} [storage]
 */
export function readSavedGame(key, storage = localStorage) {
    const zerlegt = parseSavedKey(key);
    if (!zerlegt) return null;
    let roh;
    try { roh = storage.getItem(key); } catch { return null; }
    if (!roh) return null;
    let wert;
    try { wert = JSON.parse(roh); } catch { return null; }
    const marks = Array.isArray(wert?.marks) ? wert.marks : [];
    return {
        sure: marks.filter(([, mark]) => mark === 'yes').length,
        total: sureTotal(zerlegt.categoryCount, zerlegt.valuesPerCategory),
        marks: marks.length,
        solved: Boolean(wert?.solved),
        elapsedMs: Number(wert?.elapsedMs) || 0,
        // Die vier Felder, mit denen ein Stand sich selbst trägt. Ältere
        // Stände haben sie nicht; das ist kein Fehler, nur eine Grenze.
        options: wert?.options ?? null,
        fingerprint: wert?.fingerprint ?? null,
        title: wert?.title ?? null,
        savedAt: wert?.savedAt ?? null,
    };
}
```

- [ ] **Schritt 4: Test bestätigen**

Ausführen: `cd logicals-site && rtk npx vitest run test/saved-games.test.ts`
Erwartet: PASS, 9 Tests.

- [ ] **Schritt 5: Festhalten**

```bash
cd logicals-site && rtk npx tsc --noEmit && rtk git add client/js/play/savedGames.js test/saved-games.test.ts && rtk git commit -m "feat(staende): einen stand lesen und sichere zuordnungen zaehlen"
```

---

### Aufgabe 3: Jüngster Stand und Obergrenze

**Dateien:**
- Ändern: `client/js/play/savedGames.js`
- Test: `test/saved-games.test.ts`

**Schnittstellen:**
- Verbraucht: `listSavedGames`, `readSavedGame`.
- Liefert: `newestSavedGame(playerId, storage)` → `{ key, seed, options, fingerprint, title, elapsedMs, marks } | null`; `pruneSavedGames(playerId, limit, storage)` → `number`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

An `test/saved-games.test.ts` anhängen (Import ergänzen: `newestSavedGame`, `pruneSavedGames`):

```ts
function standFuer(seed: number, savedAt: string | null, extra: object = {}) {
    return [
        `logicals:play:solo:none:1:museum:${seed}:3x4:h${seed}`,
        JSON.stringify({
            marks: [['0.1.0.0', 'yes']], auto: [], usedClues: [],
            elapsedMs: 1000, solved: false,
            options: { seed, categoryCount: 3, valuesPerCategory: 4 },
            fingerprint: `f${seed}`, title: `${seed}. Museum`,
            ...(savedAt ? { savedAt } : {}), ...extra,
        }),
    ] as const;
}

describe('der juengste Stand', () => {
    it('nimmt den mit der spaetesten Zeitmarke', () => {
        const [a, aw] = standFuer(1, '2026-09-20T10:00:00.000Z');
        const [b, bw] = standFuer(2, '2026-09-22T10:00:00.000Z');
        expect(newestSavedGame(1, storageWith({ [a]: aw, [b]: bw }))?.seed).toBe(2);
    });

    it('uebergeht geloeste und leere Staende', () => {
        /*
         * Beides ist nichts, wozu man zurueckkommt: ein geloestes Raetsel ist
         * fertig, ein leeres hat nichts zu zeigen.
         */
        const [a, aw] = standFuer(1, '2026-09-22T10:00:00.000Z', { solved: true });
        const [b, bw] = standFuer(2, '2026-09-21T10:00:00.000Z', { marks: [] });
        const [c, cw] = standFuer(3, '2026-09-20T10:00:00.000Z');
        expect(newestSavedGame(1, storageWith({ [a]: aw, [b]: bw, [c]: cw }))?.seed).toBe(3);
    });

    it('uebergeht Staende, die sich nicht wiederherstellen lassen', () => {
        // Ohne Einstellungen und Fingerabdruck fuehrt der Knopf ins Nichts -
        // schlimmer als kein Knopf.
        const [a, aw] = standFuer(1, '2026-09-22T10:00:00.000Z',
            { options: null, fingerprint: null });
        const [b, bw] = standFuer(2, '2026-09-21T10:00:00.000Z');
        expect(newestSavedGame(1, storageWith({ [a]: aw, [b]: bw }))?.seed).toBe(2);
    });

    it('gibt null zurueck, wenn nichts in Frage kommt', () => {
        expect(newestSavedGame(1, storageWith({}))).toBeNull();
    });
});

describe('die Obergrenze', () => {
    it('wirft den aeltesten weg und behaelt den juengsten', () => {
        const [a, aw] = standFuer(1, '2026-09-20T10:00:00.000Z');
        const [b, bw] = standFuer(2, '2026-09-21T10:00:00.000Z');
        const [c, cw] = standFuer(3, '2026-09-22T10:00:00.000Z');
        const speicher = storageWith({ [a]: aw, [b]: bw, [c]: cw });

        expect(pruneSavedGames(1, 2, speicher)).toBe(1);
        expect(listSavedGames(1, speicher).map(stand => stand.seed).sort()).toEqual([2, 3]);
    });

    it('haelt einen Stand ohne Zeitmarke fuer den aeltesten', () => {
        // Er stammt aus einer Fassung, die noch keine schrieb.
        const [a, aw] = standFuer(1, null);
        const [b, bw] = standFuer(2, '2026-09-20T10:00:00.000Z');
        const speicher = storageWith({ [a]: aw, [b]: bw });

        pruneSavedGames(1, 1, speicher);
        expect(listSavedGames(1, speicher).map(stand => stand.seed)).toEqual([2]);
    });

    it('raeumt nicht auf, solange Platz ist', () => {
        const [a, aw] = standFuer(1, '2026-09-20T10:00:00.000Z');
        const speicher = storageWith({ [a]: aw });
        expect(pruneSavedGames(1, 200, speicher)).toBe(0);
        expect(listSavedGames(1, speicher)).toHaveLength(1);
    });
});
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

Ausführen: `cd logicals-site && rtk npx vitest run test/saved-games.test.ts`
Erwartet: FAIL, „newestSavedGame is not a function".

- [ ] **Schritt 3: Minimal umsetzen**

An `client/js/play/savedGames.js` anhängen:

```js
/** Sortierschlüssel: ohne Zeitmarke gilt ein Stand als der älteste. */
function zeit(savedAt) {
    const wert = savedAt ? Date.parse(savedAt) : Number.NaN;
    return Number.isFinite(wert) ? wert : 0;
}

/**
 * Der jüngste Stand, zu dem zurückzukommen sich lohnt.
 *
 * Gelöst und leer fallen weg — beides ist nichts, wozu man zurückkommt. Und
 * ohne `options` und `fingerprint` lässt sich das Rätsel nicht identisch neu
 * erzeugen; ein Knopf, der ins Nichts führt, ist schlimmer als keiner.
 *
 * @param {number} playerId
 * @param {Storage} [storage]
 */
export function newestSavedGame(playerId, storage = localStorage) {
    let bester = null;
    for (const eintrag of listSavedGames(playerId, storage)) {
        const stand = readSavedGame(eintrag.key, storage);
        if (!stand || stand.solved || stand.marks === 0) continue;
        if (!stand.options || !stand.fingerprint) continue;
        if (bester && zeit(stand.savedAt) <= zeit(bester.savedAt)) continue;
        bester = {
            key: eintrag.key, seed: eintrag.seed, savedAt: stand.savedAt,
            options: stand.options, fingerprint: stand.fingerprint,
            title: stand.title, elapsedMs: stand.elapsedMs, marks: stand.marks,
        };
    }
    if (!bester) return null;
    const { savedAt, ...rest } = bester;
    return rest;
}

/**
 * Schneidet auf `limit` Stände zurück, ältester zuerst.
 *
 * Die Sammlung braucht höchstens 120 je Spieler, gedeckelt werden also nur
 * gewürfelte Einmal-Rätsel. Läuft beim Öffnen eines Spiels, nicht bei jedem
 * Speichern: beim Markieren ist Rechenzeit teuer, beim Öffnen nicht.
 *
 * @returns {number} wie viele entfernt wurden
 */
export function pruneSavedGames(playerId, limit = 200, storage = localStorage) {
    const alle = listSavedGames(playerId, storage)
        .map(eintrag => ({ key: eintrag.key, at: zeit(readSavedGame(eintrag.key, storage)?.savedAt) }))
        .sort((a, b) => a.at - b.at);
    const zuviel = alle.length - limit;
    if (zuviel <= 0) return 0;
    let entfernt = 0;
    for (const eintrag of alle.slice(0, zuviel)) {
        try { storage.removeItem(eintrag.key); entfernt++; } catch { /* dann eben nicht */ }
    }
    return entfernt;
}
```

- [ ] **Schritt 4: Test bestätigen**

Ausführen: `cd logicals-site && rtk npx vitest run test/saved-games.test.ts`
Erwartet: PASS, 16 Tests.

- [ ] **Schritt 5: Festhalten**

```bash
cd logicals-site && rtk npx tsc --noEmit && rtk git add client/js/play/savedGames.js test/saved-games.test.ts && rtk git commit -m "feat(staende): juengsten stand finden und obergrenze halten"
```

---

### Aufgabe 4: Jeder Stand trägt sich selbst

**Dateien:**
- Ändern: `client/js/play/playState.js` (Funktion `save`, ab Zeile 254)
- Ändern: `client/js/play/playController.js` (Funktion `persist`, ab Zeile 242)
- Test: `test/saved-games.test.ts`

**Schnittstellen:**
- Verbraucht: nichts aus den Vorgängern.
- Liefert: `save(state, elapsedMs, meta)` mit `meta = { fingerprint, title }`; der geschriebene Wert trägt `options`, `fingerprint`, `title`, `savedAt`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

An `test/saved-games.test.ts` anhängen (Import ergänzen: `import { save } from '../client/js/play/playState.js';`):

```ts
describe('was beim Speichern mitgeschrieben wird', () => {
    it('traegt Einstellungen, Fingerabdruck, Titel und Zeitmarke', () => {
        /*
         * Ohne diese vier Felder ist ein Stand nur wiederfindbar, solange der
         * eine Fortsetzungs-Platz auf ihn zeigt - und der wird vom naechsten
         * Raetsel ueberschrieben. Mit ihnen traegt er sich selbst.
         */
        const gespeichert: Record<string, string> = {};
        const speicher = {
            get length() { return Object.keys(gespeichert).length; },
            key: (index: number) => Object.keys(gespeichert)[index] ?? null,
            getItem: (key: string) => gespeichert[key] ?? null,
            setItem: (key: string, value: string) => { gespeichert[key] = value; },
            removeItem: (key: string) => { delete gespeichert[key]; },
        } as unknown as Storage;
        (globalThis as any).localStorage = speicher;

        const state = {
            storageKey: KEY,
            marks: new Map([['0.1.0.0', 'yes']]),
            auto: new Map(), usedClues: new Set<number>(),
            solved: false, attemptKey: null, failedChecks: 0, resultQueued: false,
            context: { options: { seed: 1_000_003, categoryCount: 3, valuesPerCategory: 4 } },
        };
        save(state as never, 61_000, { fingerprint: 'abc123', title: '3. Museum bei Nacht' });

        const stand = readSavedGame(KEY, speicher);
        expect(stand?.options).toEqual({ seed: 1_000_003, categoryCount: 3, valuesPerCategory: 4 });
        expect(stand?.fingerprint).toBe('abc123');
        expect(stand?.title).toBe('3. Museum bei Nacht');
        expect(stand?.savedAt).not.toBeNull();
        expect(stand?.sure).toBe(1);
    });

    it('kommt ohne meta aus', () => {
        // Der Fingerabdruck entsteht asynchron und fehlt beim ersten Speichern.
        const gespeichert: Record<string, string> = {};
        (globalThis as any).localStorage = {
            getItem: (key: string) => gespeichert[key] ?? null,
            setItem: (key: string, value: string) => { gespeichert[key] = value; },
            removeItem: () => {}, key: () => null, get length() { return 0; },
        } as unknown as Storage;

        const state = {
            storageKey: KEY, marks: new Map(), auto: new Map(), usedClues: new Set<number>(),
            solved: false, attemptKey: null, failedChecks: 0, resultQueued: false, context: {},
        };
        expect(() => save(state as never, 0)).not.toThrow();
    });
});
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

Ausführen: `cd logicals-site && rtk npx vitest run test/saved-games.test.ts`
Erwartet: FAIL, `stand?.options` ist `null`.

- [ ] **Schritt 3: `save` erweitern**

In `client/js/play/playState.js` die Funktion `save` ersetzen:

```js
/**
 * @param {object} state
 * @param {number} elapsedMs
 * @param {{ fingerprint?: string|null, title?: string|null }} [meta]
 *   Was der Stand über sich selbst weiß. Ohne diese Angaben ist er lesbar,
 *   aber nicht wiederherstellbar — der Fingerabdruck entsteht asynchron und
 *   fehlt beim allerersten Speichern, wird aber bei jedem weiteren
 *   nachgetragen.
 */
export function save(state, elapsedMs, meta = {}) {
    if (!state.storageKey) return;
    try {
        localStorage.setItem(state.storageKey, JSON.stringify({
            marks: [...state.marks],
            // Without provenance a reload would strand the derived crosses:
            // taking a confirmation back would no longer withdraw them.
            auto: [...state.auto].map(([key, sources]) => [key, [...sources]]),
            usedClues: [...state.usedClues],
            elapsedMs,
            solved: state.solved,
            attemptKey: state.attemptKey,
            failedChecks: state.failedChecks,
            resultQueued: state.resultQueued,
            /*
             * Damit ein Stand sich selbst trägt.
             *
             * Vorher lagen diese Angaben allein im globalen Datensatz
             * `logicals.resume.v1`, und der zeigte auf genau ein Rätsel.
             * Wer ein zweites anfing, verlor nicht seinen Stand, aber den
             * Weg dorthin.
             */
            options: state.context?.options ?? null,
            fingerprint: meta.fingerprint ?? null,
            title: meta.title ?? null,
            savedAt: new Date().toISOString(),
        }));
    } catch { /* private mode or storage full - playing still works */ }
}
```

- [ ] **Schritt 4: `persist` die Angaben mitgeben**

In `client/js/play/playController.js` die Funktion `persist` ersetzen:

```js
function persist() {
    const elapsedMs = timer ? timer.elapsedMs() : 0;
    save(state, elapsedMs, {
        fingerprint: puzzleFingerprint,
        title: state.puzzle ? `${state.puzzle.number}. ${state.puzzle.title}` : null,
    });
    rememberForResume(elapsedMs);
}
```

- [ ] **Schritt 5: Tests bestätigen**

Ausführen: `cd logicals-site && rtk npm test`
Erwartet: alle grün, `test/saved-games.test.ts` mit 18 Tests.

- [ ] **Schritt 6: Festhalten**

```bash
cd logicals-site && rtk npx tsc --noEmit && rtk git add client/js/play/playState.js client/js/play/playController.js test/saved-games.test.ts && rtk git commit -m "feat(staende): jeder spielstand traegt seine eigenen angaben"
```

---

### Aufgabe 5: „Weiterspielen" meint den jüngsten Stand

**Dateien:**
- Ändern: `client/js/main.js` (`refreshStartScreen` ab Zeile 214, `describeResume` ab Zeile 125, `resumeSavedGame` ab Zeile 247)
- Ändern: `client/js/play/playController.js` (`rememberForResume` ab Zeile 256, `#opponent-later`-Handler ab Zeile 391, `openPlay`)
- Löschen: `client/js/play/resumeStore.js`, `test/resume-store.test.ts`
- Test: `e2e/navigation.spec.ts`

**Schnittstellen:**
- Verbraucht: `newestSavedGame(playerId)`, `pruneSavedGames(playerId)`, `readSavedGame(key)`.
- Liefert: nichts, worauf spätere Aufgaben bauen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

An `e2e/navigation.spec.ts` anhängen:

```ts
/*
 * "Weiterspielen" meint das zuletzt begonnene Raetsel.
 *
 * Vorher lag dahinter ein einziger, globaler Platz: wer ein zweites Raetsel
 * anfing, ueberschrieb ihn. Der Stand des ersten lag weiter im Speicher, nur
 * fuehrte kein Weg mehr hin.
 */
test('Weiterspielen fuehrt auf das zuletzt begonnene Raetsel', async ({ page }) => {
  test.setTimeout(180_000);
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#collection-button')).toBeEnabled({ timeout: 30_000 });

  // Erstes Sammlungsraetsel anfangen.
  await page.locator('#collection-button').click();
  await page.locator('.chapter-row').first().click();
  await page.locator('.entry-row').first().click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });
  const ersterTitel = await page.locator('#play-title').textContent();
  await page.locator('.play-pager .cell').evaluateAll(cells => {
    (cells[0] as HTMLButtonElement).click();
  });
  await page.waitForTimeout(300);
  await page.locator('#play-back').click();

  // Zweites Sammlungsraetsel anfangen.
  await page.goto('/');
  await page.locator('#collection-button').click();
  await page.locator('.chapter-row').first().click();
  await page.locator('.entry-row').nth(1).click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });
  const zweiterTitel = await page.locator('#play-title').textContent();
  await page.locator('.play-pager .cell').evaluateAll(cells => {
    (cells[0] as HTMLButtonElement).click();
  });
  await page.waitForTimeout(300);
  await page.locator('#play-back').click();

  // Der Knopf meint jetzt das zweite - und das erste ist nicht verloren.
  await page.goto('/');
  await expect(page.locator('#resume-button')).toBeVisible();
  await expect(page.locator('#resume-detail')).toContainText(zweiterTitel!.trim());
  expect(ersterTitel).not.toBe(zweiterTitel);
});
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

Ausführen: `cd logicals-site && rtk npx playwright test e2e/navigation.spec.ts -g "zuletzt begonnene"`
Erwartet: FAIL — der Knopf nennt noch das zuletzt gespeicherte, aber über den alten Platz.

- [ ] **Schritt 3: Den Startbildschirm umstellen**

In `client/js/main.js`: den Import `import { clearResume, loadResume } from './play/resumeStore.js';` ersetzen durch

```js
import { newestSavedGame } from './play/savedGames.js';
```

`describeResume` ersetzen:

```js
/**
 * Die Zeile unter „Weiterspielen": Titel, Uhr, Markierungen.
 *
 * Markierungen statt Prozent — der Prozentsatz gehört in die Sammlung, und
 * zwei Maße für dieselbe Sache auf einem Weg wären genau die Unordnung, die
 * dieser Umbau vermeiden soll.
 */
function describeResume(stand) {
    const minutes = Math.floor(stand.elapsedMs / 60_000);
    const seconds = Math.floor((stand.elapsedMs % 60_000) / 1000);
    const clock = `${minutes}:${String(seconds).padStart(2, '0')}`;
    const marks = stand.marks === 1 ? '1 Markierung' : `${stand.marks} Markierungen`;
    return `${stand.title ?? 'Rätsel'} · ${clock} · ${marks}`;
}
```

In `refreshStartScreen` die drei Zeilen

```js
    const record = player ? loadResume(player.id) : null;
```

ersetzen durch

```js
    const record = player ? newestSavedGame(player.id) : null;
```

`resumeSavedGame` ersetzen:

```js
async function resumeSavedGame() {
    const player = getSelectedPlayer();
    const record = player ? newestSavedGame(player.id) : null;
    if (!record) { refreshStartScreen(); return; }

    setBusy('Gespeichertes Rätsel wird wiederhergestellt …');
    try {
        const generated = await fetchBooklet(record.options);
        const puzzle = generated.booklet.puzzles[0];
        if (!puzzle) throw new Error('Das gespeicherte Rätsel gibt es nicht mehr.');
        if (await fingerprintPuzzle(puzzle) !== record.fingerprint) {
            throw new Error('Das gespeicherte Rätsel lässt sich nicht mehr identisch erzeugen.');
        }
        setHint('start-hint', '');
        openPlay(puzzle, { mode: 'solo', player, options: record.options, puzzleIndex: 0 });
    } catch (error) {
        /*
         * Den Stand NICHT wegwerfen.
         *
         * Früher löschte dieser Zweig den Fortsetzungs-Datensatz. Jetzt ist der
         * Datensatz der Stand selbst — ihn zu löschen hiesse, die Markierungen
         * wegzuwerfen, weil der Generator sich geändert hat. Der Knopf bleibt
         * stehen und sagt, was los ist.
         */
        setHint('start-hint', error.message, true);
    } finally {
        clearBusy();
    }
}
```

- [ ] **Schritt 4: Den alten Platz abbauen**

In `client/js/play/playController.js`: `rememberForResume` samt ihrem Kommentarblock löschen, den Aufruf in `persist` entfernen, und den Import `import { clearResume, saveResume } from './resumeStore.js';` streichen.

Im `#opponent-later`-Handler den Block ab `saveResume({` bis zur schliessenden `});` ersetzen durch:

```js
        /*
         * Kein Fortsetzungs-Datensatz mehr: der kopierte Stand trägt seine
         * Angaben selbst, und der Startbildschirm findet ihn als den jüngsten.
         */
```

und im Kopiervorgang darüber die vier Felder mitschreiben:

```js
        try {
            const roh = localStorage.getItem(state.storageKey);
            if (roh) {
                localStorage.setItem(soloKey, JSON.stringify({
                    ...soloContinuation(JSON.parse(roh)),
                    options: state.context.options,
                    fingerprint: puzzleFingerprint,
                    title: `${state.puzzle.number}. ${state.puzzle.title}`,
                    savedAt: new Date().toISOString(),
                }));
            }
        } catch {
            // Privater Modus oder voller Speicher: dann faengt man eben neu
            // an. Besser als gar kein Weg zurueck.
        }
```

In `openPlay`, direkt nach `opponentAnnounced = false;`, die Obergrenze halten:

```js
    // Einmal je Spiel, nicht bei jedem Speichern: beim Markieren ist
    // Rechenzeit teuer, beim Oeffnen nicht.
    if (context.mode === 'solo' && context.player) pruneSavedGames(context.player.id);
```

und oben ergänzen: `import { pruneSavedGames } from './savedGames.js';`

- [ ] **Schritt 5: Den Umzug schreiben**

In `client/js/main.js`, direkt vor `initPlayerController(refreshStartScreen)`:

```js
/**
 * Einmaliger Umzug vom alten Fortsetzungs-Platz.
 *
 * `logicals.resume.v1` trug Einstellungen, Fingerabdruck und Titel für genau
 * ein Rätsel. Diese Angaben wandern in den Stand, auf den er zeigt; danach
 * wird er gelöscht. Stände, auf die er nie zeigte, bleiben lesbar und zeigen
 * ihren Balken — fortsetzbar werden sie, sobald man sie einmal anfasst.
 */
function migrateResumeRecord() {
    try {
        const roh = localStorage.getItem('logicals.resume.v1');
        if (!roh) return;
        const record = JSON.parse(roh);
        const stand = record?.storageKey ? localStorage.getItem(record.storageKey) : null;
        if (stand) {
            const wert = JSON.parse(stand);
            if (!wert.options) {
                localStorage.setItem(record.storageKey, JSON.stringify({
                    ...wert,
                    options: record.options ?? null,
                    fingerprint: record.fingerprint ?? null,
                    title: record.title ?? null,
                    savedAt: record.savedAt ?? new Date().toISOString(),
                }));
            }
        }
        localStorage.removeItem('logicals.resume.v1');
    } catch { /* kaputt oder gesperrt: dann bleibt es, wie es ist */ }
}

migrateResumeRecord();
```

- [ ] **Schritt 6: Den alten Baustein löschen**

```bash
cd logicals-site && rtk git rm client/js/play/resumeStore.js test/resume-store.test.ts
```

- [ ] **Schritt 7: Alles bestätigen**

Ausführen:
```bash
cd logicals-site && rtk npx tsc --noEmit; echo "tsc=$?"
cd logicals-site && rtk npm test 2>&1 | tail -4
cd logicals-site && rtk npx playwright test e2e/navigation.spec.ts e2e/play-sprint.spec.ts e2e/duel.spec.ts --reporter=line 2>&1 | tail -4
```
Erwartet: tsc=0, alle Vitest grün, alle drei e2e-Dateien grün.

- [ ] **Schritt 8: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "feat(start): weiterspielen meint den zuletzt begonnenen stand"
```

---

### Aufgabe 6: Die Sammlung zeigt es

**Dateien:**
- Ändern: `client/js/screens/collectionScreen.js` (`chapterRow` ab Zeile 65, `entryRow` ab Zeile 108, `drawChapter`, `drawCollection`, `openCollection`)
- Ändern: `client/styles/screens.css` (bei `.chapter-meter`, Zeile 494)
- Test: `e2e/collection.spec.ts`

**Schnittstellen:**
- Verbraucht: `listSavedGames(playerId)`, `readSavedGame(key)`.
- Liefert: nichts, worauf spätere Aufgaben bauen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

An `e2e/collection.spec.ts` anhängen:

```ts
/*
 * Ein angefangener Eintrag sieht anders aus als ein unberuehrter.
 *
 * Vorher war jeder Eintrag entweder "geloest" oder leer: ein Kapitel mit drei
 * angefangenen Raetseln sah aus wie ein unberuehrtes.
 */
test('die Sammlung zeigt angefangene Raetsel', async ({ page }) => {
  test.setTimeout(180_000);
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#collection-button')).toBeEnabled({ timeout: 30_000 });

  await page.locator('#collection-button').click();
  await page.locator('.chapter-row').first().click();
  // Unberuehrt: keine Statuszeile, kein Balken.
  await expect(page.locator('.entry-row').first().locator('.chapter-meter')).toHaveCount(0);

  await page.locator('.entry-row').first().click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });
  // Drei sichere Zuordnungen setzen.
  await page.locator('#overview-mark-yes').evaluate((b: HTMLButtonElement) => b.click());
  await page.locator('.play-pager .cell').evaluateAll(cells => {
    for (const cell of cells.slice(0, 3)) (cell as HTMLButtonElement).click();
  });
  await page.waitForTimeout(300);
  await page.locator('#play-back').click();

  // Jetzt traegt der Eintrag seine Zeile und seinen Balken.
  const ersteZeile = page.locator('.entry-row').first();
  await expect(ersteZeile).toContainText('3 von 12 sicher');
  await expect(ersteZeile.locator('.chapter-meter')).toHaveCount(1);
  // Und hoechstens EINE Statuszeile: der Neu-Hinweis tritt zurueck.
  await expect(ersteZeile.locator('.list-row__meta')).toHaveCount(0);

  // Die Kapiteluebersicht zaehlt es mit.
  await page.locator('#screen-chapter .btn--back').click();
  await expect(page.locator('.chapter-row').first()).toContainText('1 angefangen');
});
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

Ausführen: `cd logicals-site && rtk npx playwright test e2e/collection.spec.ts -g "angefangene"`
Erwartet: FAIL, „3 von 12 sicher" steht nicht da.

- [ ] **Schritt 3: Die Stände in den Bildschirm holen**

In `client/js/screens/collectionScreen.js` oben ergänzen:

```js
import { listSavedGames, readSavedGame } from '../play/savedGames.js';
```

und neben `let solved = new Set();`:

```js
/**
 * Was angefangen ist, je Seed: `{ sure, total }`.
 *
 * Gefüllt aus den Schlüsseln des lokalen Speichers. Gelöste Einträge stehen
 * hier nicht — ihr Haken sagt bereits alles, und 100 % zu zeichnen sagt
 * nichts darüber hinaus.
 */
let started = new Map();

/**
 * Liest die Stände dieses Spielers.
 *
 * Zwei Stufen, weil das Lesen der Werte das Teure ist: die Schlüssel allein
 * genügen für „angefangen ja/nein" und damit für die Zahl in der
 * Kapitelübersicht. `withProgress` parst zusätzlich die Werte — das lohnt in
 * der Kapitelansicht, wo es zwölf sind, nicht in der Übersicht, wo es 120
 * wären.
 */
function readStarted(playerId, withProgress) {
    const map = new Map();
    for (const eintrag of listSavedGames(playerId)) {
        if (solved.has(eintrag.seed)) continue;
        if (!withProgress) { map.set(eintrag.seed, null); continue; }
        const stand = readSavedGame(eintrag.key);
        if (!stand || stand.solved || stand.marks === 0) continue;
        map.set(eintrag.seed, { sure: stand.sure, total: stand.total });
    }
    return map;
}
```

- [ ] **Schritt 4: Die Kapitelansicht zeichnen**

In `entryRow` den Block ab `const fresh = newClueTypeAt(...)` bis zur `isSolved`-Zeile ersetzen:

```js
    /*
     * Höchstens EINE Statuszeile, Rangfolge gelöst → angefangen → Neu-Hinweis.
     *
     * Kein Eintrag soll um eine dritte Zeile wachsen. Wer angefangen hat,
     * kennt die neue Hinweisart bereits — die Zeile tritt zurück, statt sich
     * danebenzudrängen.
     */
    const stand = started.get(entry.seed) ?? null;
    if (isSolved) {
        row.append(make('p', { className: 'list-row__score', text: '✓ gelöst' }));
    } else if (stand) {
        row.append(make('p', {
            className: 'list-row__score',
            text: `${stand.sure} von ${stand.total} sicher`,
        }));
        // Dieselbe Sprache wie die Kapitelkarte eine Ebene höher.
        const meter = make('span', { className: 'chapter-meter', attrs: { 'aria-hidden': 'true' } });
        const fill = make('span', { className: 'chapter-meter__fill' });
        fill.style.width = `${Math.round((stand.sure / stand.total) * 100)}%`;
        meter.append(fill);
        row.append(meter);
    } else {
        const fresh = newClueTypeAt(chapter, index);
        if (fresh) row.append(make('p', { className: 'list-row__meta', text: `Neu: „${fresh}“` }));
    }
```

In `drawChapter`, vor der Schleife über die Einträge:

```js
    started = activePlayer ? readStarted(activePlayer.id, true) : new Map();
```

- [ ] **Schritt 5: Die Kapitelübersicht zählen lassen**

In `chapterRow`, in der Zeile mit `list-row__score`, den Text bilden aus:

```js
    const offen = chapter.entries.filter(entry => started.has(entry.seed)).length;
    const text = offen > 0
        ? `${part.solved} von ${part.total} · ${offen} angefangen`
        : `${part.solved} von ${part.total}`;
```

In `drawCollection`, vor der Schleife über die Kapitel:

```js
    // Nur die Schluessel: 120 Werte zu parsen waere hier verschwendet.
    started = activePlayer ? readStarted(activePlayer.id, false) : new Map();
```

- [ ] **Schritt 6: Der Balken darf in die Zeile**

In `client/styles/screens.css`, nach `.chapter-row.is-solved .chapter-meter__fill { … }`:

```css
/* Der Balken eines angefangenen Eintrags. Gleiche Sprache wie die
   Kapitelkarte, nur eine Ebene tiefer - deshalb dieselbe Klasse und nur der
   Abstand hier. */
.entry-row .chapter-meter { margin-top: var(--space-2); }
```

- [ ] **Schritt 7: Test bestätigen**

Ausführen: `cd logicals-site && rtk npx playwright test e2e/collection.spec.ts --reporter=line`
Erwartet: alle grün, auch die vorhandenen.

- [ ] **Schritt 8: Bei 320 px messen, nicht schätzen**

Ausführen:
```bash
cd logicals-site && rm -f shots/*.png && SHOTS=1 rtk npx playwright test screenshots --reporter=line
```
Dann `shots/320-hell-02-sammlung.png` und `shots/320-hell-03-kapitel.png` **ansehen**. Bricht „2 von 12 · 3 angefangen" bei 320 px um, wird daraus `${part.solved} von ${part.total} · ${offen} offen`. Gemessen wird, nicht geschätzt.

- [ ] **Schritt 9: Festhalten**

```bash
cd logicals-site && rtk npx tsc --noEmit && rtk git add -A && rtk git commit -m "feat(sammlung): angefangene raetsel mit balken und zahl zeigen"
```

---

### Aufgabe 7: Der ganze Weg und die Abnahme

**Dateien:**
- Erstellen: `e2e/started-puzzles.spec.ts`
- Test: dieselbe Datei

**Schnittstellen:**
- Verbraucht: alles aus den Aufgaben 1–6.
- Liefert: nichts.

- [ ] **Schritt 1: Den durchgehenden Ablauf schreiben**

`e2e/started-puzzles.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

/*
 * Der ganze Weg, nicht die Bausteine.
 *
 * Die Fehler dieses Vorhabens liegen ZWISCHEN den Bausteinen: der Stand wird
 * geschrieben, aber nicht gefunden; er wird gefunden, aber nicht gezeichnet;
 * er wird gezeichnet, aber der Knopf meint einen anderen. Jeder Baustein für
 * sich ist in den Vitest-Tests belegt - hier geht es um die Fugen.
 */

async function withPlayer(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('logicals.players.v1', JSON.stringify({
      players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
    }));
    localStorage.setItem('logicals.seenIntro.v1', '1');
  });
  await page.route('**/api/players/*/solved-seeds', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ seeds: [] }),
  }));
}

test('vom ersten Tipp bis zum Haken', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#collection-button')).toBeEnabled({ timeout: 30_000 });

  // 1. Anfangen.
  await page.locator('#collection-button').click();
  await page.locator('.chapter-row').first().click();
  await page.locator('.entry-row').first().click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });
  await page.locator('#overview-mark-yes').evaluate((b: HTMLButtonElement) => b.click());
  await page.locator('.play-pager .cell').evaluateAll(cells => {
    for (const cell of cells.slice(0, 3)) (cell as HTMLButtonElement).click();
  });
  await page.waitForTimeout(300);
  await page.locator('#play-back').click();

  // 2. Die Kapitelansicht zeigt es.
  await expect(page.locator('.entry-row').first()).toContainText('3 von 12 sicher');

  // 3. Die Kapiteluebersicht zaehlt es.
  await page.locator('#screen-chapter .btn--back').click();
  await expect(page.locator('.chapter-row').first()).toContainText('1 angefangen');

  // 4. Der Startbildschirm bietet es an.
  await page.goto('/');
  await expect(page.locator('#resume-button')).toBeVisible();
  await expect(page.locator('#resume-detail')).toContainText('3 Markierungen');

  // 5. Zurueck ueber den Knopf, zu Ende loesen.
  await page.locator('#resume-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });
  await page.locator('#play-solution-button').evaluate((b: HTMLButtonElement) => b.click());
  await page.locator('#confirm-ok').click();
  const labels = await page.locator('#play-solution-table').evaluate(container => {
    const headers = [...container.querySelectorAll('th')].map(cell => cell.textContent || '');
    return [...container.querySelectorAll('tbody tr')].flatMap(row => {
      const values = [...row.querySelectorAll('td')].map(cell => cell.textContent || '');
      return headers.flatMap((_, left) => headers.slice(left + 1).map((__, offset) =>
        `${values[left]} / ${values[left + offset + 1]}`));
    });
  });
  await page.locator('#overview-mark-yes').evaluate((b: HTMLButtonElement) => b.click());
  await page.locator('.play-pager .cell').evaluateAll((cells, wanted) => {
    for (const label of wanted as string[]) {
      const cell = cells.find(c => (c as HTMLElement).dataset.label === label) as HTMLButtonElement;
      cell?.click();
    }
  }, labels);
  await expect(page.locator('#solved-dialog')).toBeVisible({ timeout: 30_000 });

  // 6. Haken statt Balken, und der Knopf ist weg.
  await page.goto('/');
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('bei gesperrtem Speicher bleibt die Sammlung bedienbar', async ({ page }) => {
  test.setTimeout(120_000);
  await withPlayer(page);
  /*
   * Privater Modus: das Durchgehen wirft, und die Sammlung muss aussehen wie
   * vorher - nicht leer, nicht kaputt.
   */
  await page.addInitScript(() => {
    const echt = localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: new Proxy(echt, {
        get(ziel, name) {
          if (name === 'length') throw new DOMException('SecurityError');
          return Reflect.get(ziel, name);
        },
      }),
    });
  });
  await page.goto('/');
  await expect(page.locator('#collection-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#collection-button').click();
  await expect(page.locator('.chapter-row')).toHaveCount(10);
});
```

- [ ] **Schritt 2: Lauf bestätigen**

Ausführen: `cd logicals-site && rtk npx playwright test e2e/started-puzzles.spec.ts --reporter=line`
Erwartet: 2 Tests grün.

- [ ] **Schritt 3: Die volle Abnahme**

```bash
cd logicals-site && rtk npx tsc --noEmit; echo "tsc=$?"
cd logicals-site && rtk npm test 2>&1 | tail -4
cd logicals-site && for i in 1 2 3; do echo "=== Lauf $i ==="; rtk npx playwright test 2>&1 | tail -3; done
```

Erwartet: tsc=0, alle Vitest grün, **dreimal dasselbe Ergebnis**.

**Achtung:** Die Zusammenfassung von `rtk` hat schon einmal einen Fehlschlag verschluckt. Bei jedem Lauf gegenprüfen:

```bash
cd logicals-site && rtk proxy grep -c '"status": "failed"' $(ls -t ~/.local/share/rtk/tee/*playwright.log | head -1)
```
Erwartet: `0`.

- [ ] **Schritt 4: Aufnahmen und Prüfer**

```bash
cd logicals-site && rm -f shots/*.png && SHOTS=1 rtk npx playwright test screenshots duel-screenshots --reporter=line
```

Dann je einen dedizierten Prüfer auf `320-hell-02-sammlung.png` / `320-hell-03-kapitel.png` und auf `390-dunkel-02-sammlung.png` / `390-dunkel-03-kapitel.png` ansetzen. Auftrag: schlecht gelaunter, sehr kritischer UX/UI/User-Flow-Prüfer, der nur Fehlerfreies durchwinkt; **nur melden, was im Bild wirklich zu sehen ist**; falsche Silbentrennung ist ein bekanntes Chromium-Artefakt und nicht zu melden.

Befunde einsortieren in „echt", „Attrappe" und „erst messen". Was sich messen lässt, wird gemessen: die Reiterleiste wurde zuletzt als 33 px gemeldet und war 44, der Zurück-Knopf als 36 px und war 44.

**Die Aufnahmen selbst ansehen, nicht nur die Berichte lesen.**

- [ ] **Schritt 5: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "test(sammlung): der ganze weg vom ersten tipp bis zum haken"
```

---

## Selbstdurchgang

**Abdeckung der Spec:** Modul mit den vier Funktionen → Aufgaben 1–3. Speicherformat und `meta` → Aufgabe 4. Umzug, Wegfall von `resumeStore`, Duell-Aufgeben, Obergrenze beim Öffnen → Aufgabe 5. Kapitelansicht, Kapitelübersicht, Statuszeilen-Rangfolge, `.chapter-meter` → Aufgabe 6. Durchgehender Ablauf, Randfälle, Abnahme mit Prüfern → Aufgabe 7. Die Fehlerfall-Tabelle der Spec ist in den Aufgaben 1, 2 und 7 belegt.

**Namen, die über Aufgaben hinweg gelten:** `parseSavedKey`, `listSavedGames`, `readSavedGame`, `newestSavedGame`, `pruneSavedGames`, `save(state, elapsedMs, meta)`, `started` (Map je Seed), `readStarted(playerId, withProgress)`.

**Eine Grenze, die offen bleibt und offen bleiben soll:** Stände ohne `options` erscheinen mit Balken in der Sammlung, aber nicht unter „Weiterspielen". Das ist in der Spec so entschieden und in Aufgabe 3 als Test belegt.
