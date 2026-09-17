import type { Player, PlayerRepository } from '../repositories/players';
import { normalizePlayerName } from '../validation';

export interface PublicPlayer {
  id: number;
  displayName: string;
  createdAt: string;
}

export function publicPlayer(player: Player): PublicPlayer {
  return { id: player.id, displayName: player.displayName, createdAt: player.createdAt };
}

export async function resolvePlayer(
  repository: PlayerRepository,
  input: unknown,
  now = () => new Date().toISOString(),
): Promise<{ player: PublicPlayer; created: boolean }> {
  const { displayName, normalizedName } = normalizePlayerName(input);
  const existing = await repository.findByNormalizedName(normalizedName);
  if (existing) return { player: publicPlayer(existing), created: false };

  const created = await repository.create(displayName, normalizedName, now());
  const player = await repository.findByNormalizedName(normalizedName);
  if (!player) throw new Error('Player insert did not create or resolve a row.');
  return { player: publicPlayer(player), created };
}
