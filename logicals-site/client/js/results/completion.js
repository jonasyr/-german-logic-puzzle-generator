import { fingerprintPuzzle } from '../generation/canonicalPuzzle.ts';

export async function createCompletionSubmission({
    player,
    puzzle,
    options,
    elapsedMs,
    failedChecks,
    attemptKey,
    room,
}) {
    return {
        playerId: player.id,
        ...(room ? { roomId: room.id, memberToken: room.memberToken } : {}),
        attemptKey,
        puzzleFingerprint: await fingerprintPuzzle(puzzle),
        puzzleTitle: puzzle.title,
        themeId: puzzle.id,
        difficulty: options.difficulty,
        seed: puzzle.seed,
        configuration: options,
        elapsedMs: Math.max(0, Math.round(elapsedMs)),
        failedChecks,
    };
}
