import { errorResponse, HttpError, json, readJson } from './http';
import {
  createPlayersRepository,
  type PlayerRepository,
} from './repositories/players';
import {
  createResultsRepository,
  type ResultRepository,
} from './repositories/results';
import {
  createRoomsRepository,
  type RoomRepository,
} from './repositories/rooms';
import { publicPlayer, resolvePlayer } from './services/players';
import { publicDuelResults, publicResult, submitResult } from './services/results';
import {
  createRoom,
  getRoomSnapshot,
  joinRoom,
  markRoomLoaded,
  markRoomReady,
  resolveDuelResultContext,
} from './services/rooms';
import type { Env } from './types';
import { objectBody } from './validation';

interface AppOverrides {
  playerRepository?: PlayerRepository;
  resultRepository?: ResultRepository;
  now?: () => string;
  roomRepository?: RoomRepository;
  nowMs?: () => number;
  roomCode?: () => string;
  memberToken?: () => string;
}

function roomsFor(env: Env, overrides: AppOverrides): RoomRepository {
  if (overrides.roomRepository) return overrides.roomRepository;
  if (!env.DB) throw new HttpError(503, 'Die Raumdatenbank ist noch nicht verfügbar.');
  return createRoomsRepository(env.DB);
}

function playersFor(env: Env, overrides: AppOverrides): PlayerRepository {
  if (overrides.playerRepository) return overrides.playerRepository;
  if (!env.DB) throw new HttpError(503, 'Die Spielerdatenbank ist noch nicht verfügbar.');
  return createPlayersRepository(env.DB);
}

function resultsFor(env: Env, overrides: AppOverrides): ResultRepository {
  if (overrides.resultRepository) return overrides.resultRepository;
  if (!env.DB) throw new HttpError(503, 'Die Ergebnisdatenbank ist noch nicht verfügbar.');
  return createResultsRepository(env.DB);
}

export function createApp(overrides: AppOverrides = {}) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      try {
        if (url.pathname === '/api/players' && request.method === 'GET') {
          const players = await playersFor(env, overrides).list();
          return json({ players: players.map(publicPlayer) });
        }

        if (url.pathname === '/api/players' && request.method === 'POST') {
          const body = objectBody(await readJson(request));
          const result = await resolvePlayer(playersFor(env, overrides), body.displayName);
          return json({ player: result.player }, result.created ? 201 : 200);
        }

        const historyMatch = url.pathname.match(/^\/api\/players\/(\d+)\/results$/);
        if (historyMatch && request.method === 'GET') {
          const playerId = Number(historyMatch[1]);
          const rawLimit = url.searchParams.get('limit');
          const limit = rawLimit === null ? 50 : Number(rawLimit);
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new HttpError(400, 'Das Ergebnislimit ist ungültig.');
          }
          const results = await resultsFor(env, overrides).listByPlayer(playerId, limit);
          return json({ results: results.map(publicResult) });
        }

        if (url.pathname === '/api/results' && request.method === 'POST') {
          const repository = resultsFor(env, overrides);
          const body = await readJson(request);
          const result = await submitResult(
            repository,
            body,
            {
              now: overrides.now,
              resolveDuelContext: input => resolveDuelResultContext(
                roomsFor(env, overrides), input, (overrides.nowMs ?? Date.now)(),
              ),
            },
          );
          if (result.result.roomId !== null) {
            const roomRepository = roomsFor(env, overrides);
            const roomResults = await repository.listByRoom(result.result.roomId);
            if (roomResults.length === 2) await roomRepository.markComplete(result.result.roomId);
          }
          return json({ result: publicResult(result.result) }, result.created ? 201 : 200);
        }

        if (url.pathname === '/api/rooms' && request.method === 'POST') {
          const result = await createRoom(roomsFor(env, overrides), await readJson(request), {
            now: overrides.nowMs,
            code: overrides.roomCode,
            token: overrides.memberToken,
          });
          return json(result, 201);
        }

        const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(join|loaded|ready))?$/);
        if (roomMatch && request.method === 'GET' && !roomMatch[2]) {
          const room = await getRoomSnapshot(
            roomsFor(env, overrides), roomMatch[1], (overrides.nowMs ?? Date.now)(),
          );
          const results = await resultsFor(env, overrides).listByRoom(room.id);
          return json({ room: {
            ...room,
            results: publicDuelResults(room.members, results),
          } });
        }
        if (roomMatch && request.method === 'POST') {
          const repository = roomsFor(env, overrides);
          const body = await readJson(request);
          if (roomMatch[2] === 'join') {
            return json(await joinRoom(repository, roomMatch[1], body, {
              now: overrides.nowMs,
              token: overrides.memberToken,
            }), 201);
          }
          const now = (overrides.nowMs ?? Date.now)();
          if (roomMatch[2] === 'loaded') {
            return json({ room: await markRoomLoaded(repository, roomMatch[1], body, now) });
          }
          if (roomMatch[2] === 'ready') {
            return json({ room: await markRoomReady(repository, roomMatch[1], body, now) });
          }
        }

        if (url.pathname.startsWith('/api/')) {
          return json({ error: 'Diese API-Route existiert nicht.' }, 404);
        }
      } catch (error) {
        return errorResponse(error);
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    },
  };
}

export default createApp();
