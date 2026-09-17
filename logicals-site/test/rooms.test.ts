import { describe, expect, it } from 'vitest';
import type {
  NewRoom,
  NewRoomMember,
  RoomAggregate,
  RoomRepository,
} from '../worker/repositories/rooms';
import {
  advanceRoom,
  createRoom,
  joinRoom,
  markRoomReady,
  validateJoin,
} from '../worker/services/rooms';

class MemoryRooms implements RoomRepository {
  aggregate: RoomAggregate | null = null;

  async create(room: NewRoom, host: NewRoomMember) {
    if (this.aggregate?.room.code === room.code) return false;
    this.aggregate = {
      room: { id: 1, ...room },
      members: [{ roomId: 1, displayName: `P${host.playerId}`, ...host }],
    };
    return true;
  }

  async findByCode(code: string) {
    return this.aggregate?.room.code === code ? structuredClone(this.aggregate) : null;
  }

  async findById(id: number) {
    return this.aggregate?.room.id === id ? structuredClone(this.aggregate) : null;
  }

  async tryJoin(code: string, member: NewRoomMember, fingerprint: string, now: string) {
    if (!this.aggregate || this.aggregate.room.code !== code
      || this.aggregate.room.puzzleFingerprint !== fingerprint
      || this.aggregate.members.some(existing => existing.role === 'guest')) return false;
    this.aggregate.members.push({ roomId: 1, displayName: `P${member.playerId}`, ...member });
    return true;
  }

  async markLoaded(code: string, playerId: number, tokenHash: string, now: string) {
    const member = this.member(code, playerId, tokenHash);
    if (!member) return false;
    member.loadedAt ||= now;
    return true;
  }

  async markReady(code: string, playerId: number, tokenHash: string, now: string) {
    const member = this.member(code, playerId, tokenHash);
    if (!member?.loadedAt) return false;
    member.readyAt ||= now;
    return true;
  }

  async tryStart(code: string, startsAt: string) {
    if (!this.aggregate || this.aggregate.room.code !== code || this.aggregate.room.startsAt) return false;
    if (this.aggregate.members.filter(member => member.loadedAt && member.readyAt).length !== 2) return false;
    this.aggregate.room.state = 'countdown';
    this.aggregate.room.startsAt = startsAt;
    return true;
  }

  async markActive(code: string) {
    if (this.aggregate?.room.code === code) this.aggregate.room.state = 'active';
  }

  async markExpired(code: string) {
    if (this.aggregate?.room.code === code) this.aggregate.room.state = 'expired';
  }

  async markComplete(roomId: number) {
    if (this.aggregate?.room.id === roomId) this.aggregate.room.state = 'complete';
  }

  private member(code: string, playerId: number, tokenHash: string) {
    if (this.aggregate?.room.code !== code) return null;
    return this.aggregate.members.find(member => member.playerId === playerId
      && member.memberTokenHash === tokenHash) ?? null;
  }
}

const waitingRoom = {
  state: 'waiting',
  startsAt: null,
  expiresAt: 100_000,
  hostPlayerId: 1,
  puzzleFingerprint: 'a'.repeat(64),
};

describe('duel room transitions', () => {
  it('starts once when both distinct players are loaded and ready', () => {
    const members = [
      { playerId: 1, loadedAt: 1, readyAt: 1 },
      { playerId: 2, loadedAt: 1, readyAt: 1 },
    ];
    expect(advanceRoom({ state: 'waiting', startsAt: null }, members, 10_000))
      .toEqual({ state: 'countdown', startsAt: 14_000 });
    expect(advanceRoom({ state: 'countdown', startsAt: 14_000 }, members, 11_000))
      .toEqual({ state: 'countdown', startsAt: 14_000 });
  });

  it('waits until exactly two different players are loaded and ready', () => {
    expect(advanceRoom({ state: 'waiting', startsAt: null }, [
      { playerId: 1, loadedAt: 1, readyAt: 1 },
    ], 10_000)).toEqual({ state: 'waiting', startsAt: null });
    expect(advanceRoom({ state: 'waiting', startsAt: null }, [
      { playerId: 1, loadedAt: 1, readyAt: 1 },
      { playerId: 1, loadedAt: 1, readyAt: 1 },
    ], 10_000)).toEqual({ state: 'waiting', startsAt: null });
  });
});

describe('duel joins', () => {
  it.each([
    [{ ...waitingRoom, expiresAt: 5_000 }, [], 2, 'a'.repeat(64), 'ROOM_EXPIRED'],
    [waitingRoom, [{ playerId: 2, role: 'guest' }], 3, 'a'.repeat(64), 'ROOM_FULL'],
    [waitingRoom, [], 1, 'a'.repeat(64), 'PLAYER_DUPLICATE'],
    [waitingRoom, [], 2, 'b'.repeat(64), 'PUZZLE_MISMATCH'],
  ])('rejects invalid joins with a stable error code', (room, members, playerId, fingerprint, code) => {
    expect(() => validateJoin(room, members, { playerId, puzzleFingerprint: fingerprint }, 10_000))
      .toThrow(expect.objectContaining({ code }));
  });

  it('keeps member tokens private and assigns one immutable shared start', async () => {
    const repository = new MemoryRooms();
    const host = await createRoom(repository, {
      playerId: 1,
      configuration: { difficulty: 'mittel', seed: 41 },
      bookletSeed: 41,
      puzzleIndex: 0,
      puzzleFingerprint: 'a'.repeat(64),
      puzzleTitle: 'Museum',
      puzzleThemeId: 'museum',
      effectivePuzzleSeed: 41,
    }, { now: () => 10_000, code: () => 'ABC234', token: () => 'host-secret' });
    const guest = await joinRoom(repository, 'ABC234', {
      playerId: 2,
      puzzleFingerprint: 'a'.repeat(64),
    }, { now: () => 11_000, token: () => 'guest-secret' });

    await markRoomReady(repository, 'ABC234', { playerId: 1, memberToken: host.memberToken }, 12_000);
    const started = await markRoomReady(
      repository, 'ABC234', { playerId: 2, memberToken: guest.memberToken }, 13_000,
    );
    const repeated = await markRoomReady(
      repository, 'ABC234', { playerId: 2, memberToken: guest.memberToken }, 14_000,
    );

    expect(started.startsAt).toBe(17_000);
    expect(repeated.startsAt).toBe(17_000);
    expect(started.members).toEqual([
      expect.not.objectContaining({ memberTokenHash: expect.anything() }),
      expect.not.objectContaining({ memberTokenHash: expect.anything() }),
    ]);
  });
});
