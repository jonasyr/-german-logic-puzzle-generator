/**
 * Erfahrung: gerechnet, nicht gespeichert.
 *
 * Jedes Ergebnis traegt bereits alles Noetige - `difficulty`, `failed_checks`
 * und in `configuration_json` die Gitterform. Daraus wird die Erfahrung
 * abgeleitet, statt sie als eigene Spalte zu fuehren. Damit kann sie nicht mit
 * der Wirklichkeit auseinanderlaufen, und es braucht keine Migration.
 *
 * Gerechnet wird hier im Worker, weil die Ergebnisliste der Schnittstelle bei
 * 100 gedeckelt ist, die Erfahrung aber ueber ALLE zaehlen soll. Eine Zahl,
 * die man sich erarbeitet hat, darf nicht wieder sinken, nur weil ein altes
 * Raetsel aus dem Fenster faellt.
 */

/** Was von einem Ergebnis gebraucht wird - nicht mehr. */
export type ExperienceInput = {
  difficulty: string;
  failedChecks: number;
  configurationJson: string;
};

/*
 * Warum an der Arbeit und nicht an der Zeit: Hinge die Erfahrung an der Dauer,
 * waere Troedeln die beste Strategie. Hinge sie an der Anzahl, waeren viele
 * winzige Raetsel das beste Verhaeltnis. Die Zellenzahl misst, wie viel
 * tatsaechlich zu entscheiden war - dieselbe Zahl, mit der auch
 * findContradictions arbeitet.
 */
const WEIGHT: Record<string, number> = { leicht: 1.0, mittel: 1.4, schwer: 1.8 };
/** Unbekannte Schwierigkeiten zaehlen wie die mittlere, statt auf 0 zu fallen. */
const WEIGHT_FALLBACK = 1.4;
/*
 * Ein Bonus, nie ein Abzug. Ohne Fehlpruefung zu loesen ist die sauberere
 * Leistung und wird erkannt - aber wer prueft, verliert nichts. Ein Abzug waere
 * Druck, und Druck ist das, wogegen "Uhr ausblenden" gebaut wurde.
 */
const CLEAN_BONUS = 1.25;

/** Zellen eines Gitters mit c Kategorien und v Werten: C(c,2) · v². */
function cellCount(categoryCount: number, valuesPerCategory: number): number {
  if (!Number.isFinite(categoryCount) || !Number.isFinite(valuesPerCategory)) return 0;
  if (categoryCount < 2 || valuesPerCategory < 1) return 0;
  return (categoryCount * (categoryCount - 1)) / 2 * valuesPerCategory * valuesPerCategory;
}

/**
 * Erfahrung fuer ein einzelnes Ergebnis.
 *
 * Unbrauchbare Angaben ergeben 0, nicht NaN. Eine Zahl, die niemand erklaeren
 * kann, ist schlimmer als eine vorsichtige - und `configuration_json` stammt
 * aus einer Zeit, in der noch nicht jede Zeile sie vollstaendig fuehrte.
 */
export function experienceFor(result: ExperienceInput): number {
  let configuration: { categoryCount?: number; valuesPerCategory?: number };
  try {
    configuration = JSON.parse(result.configurationJson ?? '{}') ?? {};
  } catch {
    return 0;
  }

  const cells = cellCount(
    Number(configuration.categoryCount),
    Number(configuration.valuesPerCategory),
  );
  if (cells === 0) return 0;

  const weight = WEIGHT[result.difficulty] ?? WEIGHT_FALLBACK;
  const clean = result.failedChecks === 0 ? CLEAN_BONUS : 1;
  return Math.round(cells * weight * clean / 10);
}

/** Summe ueber alle Ergebnisse, mit ihrer Anzahl. */
export function sumExperience(results: readonly ExperienceInput[]): { xp: number; solved: number } {
  let xp = 0;
  for (const result of results) xp += experienceFor(result);
  return { xp, solved: results.length };
}
