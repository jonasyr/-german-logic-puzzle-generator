import { describe, expect, it } from 'vitest';
import { createApp } from '../worker/index';
import type { Player, PlayerRepository } from '../worker/repositories/players';
import { normalizePlayerName } from '../worker/validation';

class MemoryPlayers implements PlayerRepository {
  private nextId = 1;
  readonly players: Player[] = [];

  async list(): Promise<Player[]> {
    return [...this.players];
  }

  async findByNormalizedName(normalizedName: string): Promise<Player | null> {
    return this.players.find(player => player.normalizedName === normalizedName) ?? null;
  }

  async create(displayName: string, normalizedName: string, createdAt: string): Promise<boolean> {
    if (await this.findByNormalizedName(normalizedName)) return false;
    this.players.push({ id: this.nextId++, displayName, normalizedName, createdAt });
    return true;
  }
}

describe('player names', () => {
  it('normalizes compatibility characters and German whitespace/case', () => {
    expect(normalizePlayerName('  ＪＯＮＡＳ\n  Müller  ')).toEqual({
      displayName: 'JONAS Müller',
      normalizedName: 'jonas müller',
    });
  });

  it('rejects empty and overlong names', () => {
    expect(() => normalizePlayerName('   ')).toThrow('Spielername');
    expect(() => normalizePlayerName('a'.repeat(41))).toThrow('40');
  });
});

describe('player API', () => {
  it('creates once and resolves a normalized duplicate', async () => {
    const repository = new MemoryPlayers();
    const app = createApp({ playerRepository: repository });

    const first = await app.fetch(new Request('https://example.test/api/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Franzi' }),
    }), {} as never);
    const duplicate = await app.fetch(new Request('https://example.test/api/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '  FRANZI ' }),
    }), {} as never);

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).player.displayName).toBe('Franzi');
    expect(repository.players).toHaveLength(1);
  });

  it('lists players and returns validation errors as JSON', async () => {
    const repository = new MemoryPlayers();
    await repository.create('Jonas', 'jonas', '2026-09-16T00:00:00.000Z');
    const app = createApp({ playerRepository: repository });

    const list = await app.fetch(new Request('https://example.test/api/players'), {} as never);
    const invalid = await app.fetch(new Request('https://example.test/api/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '' }),
    }), {} as never);

    expect((await list.json()).players).toHaveLength(1);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toContain('Spielername');
  });
});
