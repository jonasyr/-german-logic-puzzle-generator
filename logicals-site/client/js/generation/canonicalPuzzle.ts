type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface FingerprintPuzzle {
  categories: unknown;
  clues: unknown;
  targetQuestion: unknown;
  solutionRows: unknown;
}

function sortKeys(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
    return value as null | boolean | number | string;
  }
  throw new TypeError('Puzzle data must be JSON serializable.');
}

export function canonicalPuzzle(puzzle: FingerprintPuzzle): string {
  return JSON.stringify(sortKeys({
    categories: puzzle.categories,
    clues: puzzle.clues,
    targetQuestion: puzzle.targetQuestion,
    solutionRows: puzzle.solutionRows,
  }));
}

export async function fingerprintPuzzle(puzzle: FingerprintPuzzle): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPuzzle(puzzle));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
