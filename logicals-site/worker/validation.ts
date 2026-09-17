import { HttpError } from './http';

export function normalizePlayerName(input: unknown): {
  displayName: string;
  normalizedName: string;
} {
  if (typeof input !== 'string') {
    throw new HttpError(400, 'Bitte einen Spielernamen eingeben.');
  }
  const displayName = input.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const length = [...displayName].length;
  if (length < 1) throw new HttpError(400, 'Bitte einen Spielernamen eingeben.');
  if (length > 40) throw new HttpError(400, 'Der Spielername darf höchstens 40 Zeichen lang sein.');
  return {
    displayName,
    normalizedName: displayName.toLocaleLowerCase('de-DE'),
  };
}

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Die Anfrage ist unvollständig.');
  }
  return value as Record<string, unknown>;
}
