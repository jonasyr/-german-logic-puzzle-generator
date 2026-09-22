import { fetchBooklet } from '../api.js';
import { el, setHint } from '../dom.js';
import { fingerprintPuzzle } from '../generation/canonicalPuzzle.ts';
import { getSelectedPlayer } from '../players/playerStore.js';
import { onLeave, showScreen } from '../router.js';
import { initDuelEntry, showDuelEntry } from '../screens/duelEntryScreen.js';
import { renderCountdown, renderDuelLobby } from '../screens/duelLobbyScreen.js';
import { openDuelResult } from './duelResultController.js';
import {
    createDuelRoom, getDuelRoom, joinDuelRoom, markDuelLoaded, markDuelReady,
} from './roomApi.js';
import {
    clearDuelSession, countdownSeconds, loadActiveDuelSession, loadDuelSession,
    saveDuelSession, serverClockOffset,
} from './duelStore.js';

let activeSession = null;
let pollController = null;
let pollTimer = null;
let countdownTimer = null;
/** Guards startGame, which several callers can reach for the same room. */
let gameStarted = false;
let openPlay = null;
let serverOffset = 0;

function stopLobby() {
    pollController?.abort();
    pollController = null;
    clearTimeout(pollTimer);
    clearInterval(countdownTimer);
    pollTimer = null;
    countdownTimer = null;
}

function startGame(room) {
    // Once only. Both the countdown tick and a polled snapshot can reach this,
    // and re-entering would tear down the play screen and build it again.
    if (!activeSession || gameStarted) return;
    gameStarted = true;
    stopLobby();
    openPlay(activeSession.puzzle, {
        mode: 'duel',
        player: activeSession.player,
        options: activeSession.options,
        room: { ...room, memberToken: activeSession.memberToken, serverOffset },
    });
}

function watchCountdown(room) {
    clearInterval(countdownTimer);
    const tick = () => {
        const seconds = countdownSeconds(room.startsAt, Date.now() + serverOffset);
        renderCountdown(seconds);
        if (seconds === 0) startGame(room);
    };
    tick();
    countdownTimer = setInterval(tick, 100);
}

function applySnapshot(room, sentAt, receivedAt) {
    if (!activeSession) return;
    serverOffset = serverClockOffset(room.serverNow, sentAt, receivedAt);
    activeSession.room = room;
    saveDuelSession(activeSession);
    if (room.state === 'expired') {
        stopLobby();
        clearDuelSession(activeSession.code, activeSession.player.id);
        el('duel-ready').disabled = true;
        setHint('duel-lobby-hint', 'Dieser Duellraum ist abgelaufen.', true);
        return;
    }
    if (room.state === 'complete') {
        stopLobby();
        openDuelResult({ room, player: activeSession.player });
        return;
    }
    if (room.state === 'active' && room.startsAt) {
        startGame(room);
        return;
    }
    renderDuelLobby(room, activeSession.player.id);
    if (room.startsAt) watchCountdown(room);
}

/**
 * Polls the room until the lobby ends.
 *
 * The reschedule is conditional, and that is the whole point: applySnapshot can
 * end the lobby - the game starts, or the room expires or completes - and
 * stopLobby clears the timer to say so. Rescheduling regardless brought the
 * loop straight back, so a second later the snapshot still read 'active' and
 * startGame ran again, rebuilding the entire play screen. The grid blinked out
 * and back, the clue sheet closed, any highlight was lost, and the progress
 * reporter was replaced before its first five-second tick could ever fire -
 * which is why the opponent's count never appeared either.
 *
 * Identity, not a boolean: stopLobby drops the controller, so a poll whose
 * controller is no longer the current one knows it has been superseded.
 */
async function poll() {
    if (!activeSession) return;
    const controller = new AbortController();
    pollController = controller;
    try {
        const response = await getDuelRoom(activeSession.code, controller.signal);
        applySnapshot(response.room, response.sentAt, response.receivedAt);
    } catch (error) {
        if (error.name === 'AbortError') return;
        setHint('duel-lobby-hint', 'Verbindung unterbrochen – erneuter Versuch …', true);
        if (pollController === controller) pollTimer = setTimeout(poll, 3000);
        return;
    }
    if (pollController === controller) pollTimer = setTimeout(poll, 1000);
}

async function enterLobby(session, room) {
    stopLobby();
    gameStarted = false;
    activeSession = session;
    saveDuelSession(session);
    el('duel-share-link').value = `${location.origin}${location.pathname}?room=${room.code}`;
    el('duel-countdown').hidden = true;
    renderDuelLobby(room, session.player.id);
    showScreen('screen-duel-lobby');
    await markDuelLoaded(room.code, { playerId: session.player.id, memberToken: session.memberToken });
    poll();
}

export async function createDuelForPuzzle({ player, options, puzzle, puzzleIndex }) {
    const puzzleFingerprint = await fingerprintPuzzle(puzzle);
    const response = await createDuelRoom({
        playerId: player.id,
        configuration: options,
        bookletSeed: options.seed,
        puzzleIndex,
        puzzleFingerprint,
        puzzleTitle: puzzle.title,
        puzzleThemeId: puzzle.id,
        effectivePuzzleSeed: puzzle.seed,
    });
    await enterLobby({
        code: response.room.code, memberToken: response.memberToken,
        player, puzzle, options, room: response.room,
    }, response.room);
}

export async function joinDuel(code) {
    const player = getSelectedPlayer();
    if (!player) throw new Error('Bitte zuerst einen Spieler auswählen.');
    const stored = loadDuelSession(code, player.id);
    if (stored) {
        await resumeDuelSession(stored);
        return;
    }
    const publicResponse = await getDuelRoom(code);
    const room = publicResponse.room;
    const generated = await fetchBooklet(room.configuration);
    const puzzle = generated.booklet.puzzles[room.puzzleIndex];
    if (!puzzle) throw new Error('Das Rätsel des Raums konnte nicht erzeugt werden.');
    const fingerprint = await fingerprintPuzzle(puzzle);
    if (fingerprint !== room.puzzleFingerprint) {
        throw new Error('Das lokal erzeugte Rätsel stimmt nicht mit dem Raum überein.');
    }
    const response = await joinDuelRoom(code, { playerId: player.id, puzzleFingerprint: fingerprint });
    await enterLobby({
        code: response.room.code, memberToken: response.memberToken,
        player, puzzle, options: room.configuration, room: response.room,
    }, response.room);
}

/**
 * @param {{ explicit: boolean }} options `explicit` means the player arrived on a
 *   room link and therefore asked for this room. Without one, a stale session is
 *   just clutter: it gets cleared and the app stays where it was, rather than
 *   dragging every reload onto the duel screens.
 */
async function resumeDuelSession(session, { explicit } = { explicit: true }) {
    const sentAt = Date.now();
    const response = await getDuelRoom(session.code);
    const room = response.room;
    if (!room.members.some(member => member.playerId === session.player.id)) {
        clearDuelSession(session.code, session.player.id);
        throw new Error('Dein gespeicherter Platz gehört nicht mehr zu diesem Raum.');
    }
    if (await fingerprintPuzzle(session.puzzle) !== room.puzzleFingerprint) {
        clearDuelSession(session.code, session.player.id);
        throw new Error('Das gespeicherte Rätsel stimmt nicht mehr mit dem Raum überein.');
    }
    activeSession = { ...session, room };
    gameStarted = false;
    serverOffset = serverClockOffset(room.serverNow, response.sentAt ?? sentAt, response.receivedAt ?? Date.now());
    if (room.state === 'expired') {
        clearDuelSession(session.code, session.player.id);
        if (!explicit) return;
        showDuelEntry(session.code);
        setHint('duel-entry-hint', 'Dieser Duellraum ist abgelaufen.', true);
        return;
    }
    if (room.state === 'complete') {
        // A finished duel is history, and it is in the results list. Only a
        // deliberate room link reopens the comparison.
        clearDuelSession(session.code, session.player.id);
        if (!explicit) return;
        openDuelResult({ room, player: session.player });
        return;
    }
    if (room.state === 'active' && room.startsAt) {
        startGame(room);
        return;
    }
    await enterLobby(activeSession, room);
}

/**
 * @param {{ onOpenPlay: Function, onCreateDuel: (options: object) => Promise<void>,
 *           onCustomDuel: () => void, onFromCollection: () => void }} handlers
 */
export function initDuelController({
    onOpenPlay, onCreateDuel, onCustomDuel, onFromCollection,
}) {
    openPlay = onOpenPlay;
    /*
     * Erzeugen und Beitreten kommen beide von hier, gehen aber verschiedene
     * Wege: Beitreten braucht nur den Code, Erzeugen braucht den Generator -
     * und der haengt an main.js, nicht an der Lobby.
     */
    initDuelEntry({
        onJoin: joinDuel,
        onCreate: onCreateDuel,
        onCustom: onCustomDuel,
        onFromCollection,
    });
    el('duel-ready').addEventListener('click', async () => {
        if (!activeSession) return;
        el('duel-ready').disabled = true;
        try {
            const sentAt = Date.now();
            const response = await markDuelReady(activeSession.code, {
                playerId: activeSession.player.id,
                memberToken: activeSession.memberToken,
            });
            applySnapshot(response.room, sentAt, Date.now());
        } catch (error) { setHint('duel-lobby-hint', error.message, true); }
    });
    el('duel-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(el('duel-share-link').value);
            setHint('duel-lobby-hint', 'Link kopiert.');
        } catch { setHint('duel-lobby-hint', 'Link konnte nicht kopiert werden.', true); }
    });
    onLeave(from => {
        if (from !== 'screen-duel-lobby') return;
        stopLobby();
        /*
         * Verlassen heißt verlassen.
         *
         * Die gespeicherte Sitzung überlebte den Zurück-Knopf: jedes
         * Neuladen zog einen wieder in denselben Warteraum, und weil auch
         * der nächste Versuch dort endete, gab es keinen Weg hinaus. Am
         * Gerät gemeldet, mit einem frischen Raum, in dem niemand
         * beigetreten war.
         *
         * Nur wenn das Spiel noch nicht läuft: `startGame` setzt
         * `gameStarted`, bevor es den Spielbildschirm zeigt, und dieser
         * Wechsel darf die Sitzung nicht wegräumen - mitten im Duell muss
         * ein Neuladen zurück ins Spiel führen.
         */
        if (gameStarted || !activeSession) return;
        clearDuelSession(activeSession.code, activeSession.player.id);
        activeSession = null;
    });
}

/**
 * Verbraucht den Raumlink aus der Adresse.
 *
 * Ein Einladungslink ist eine einmalige Anweisung, kein Dauerzustand. Blieb
 * `?room=` stehen, führte jedes spätere Neuladen desselben Tabs wieder in den
 * Duell-Ablauf - und iOS lädt Tabs von sich aus neu, sobald es Speicher
 * braucht. Für den Spieler sah das aus, als lande er grundlos im
 * Beitreten-Bildschirm.
 *
 * replaceState statt pushState: der Link soll aus dem Verlauf verschwinden,
 * nicht einen weiteren Eintrag anlegen, durch den man zurückstolpert.
 */
function consumeRoomParam() {
    const url = new URL(location.href);
    const code = url.searchParams.get('room');
    if (!code) return null;
    url.searchParams.delete('room');
    try { history.replaceState(history.state, '', url.pathname + url.search + url.hash); }
    catch { /* ohne History-Zugriff bleibt der Link stehen; das Duell geht trotzdem */ }
    return code;
}

export async function openRoomFromUrl() {
    const player = getSelectedPlayer();
    if (!player) return;
    const code = consumeRoomParam();
    const session = code
        ? loadDuelSession(code.toUpperCase(), player.id)
        : loadActiveDuelSession(player.id);
    if (session) {
        const explicit = Boolean(code);
        try { await resumeDuelSession(session, { explicit }); }
        catch (error) {
            // Without a room link nobody asked to be here, so a stale or
            // unreachable session must not hijack the start screen.
            clearDuelSession(session.code, session.player.id);
            if (!explicit) return;
            showDuelEntry(code.toUpperCase());
            setHint('duel-entry-hint', error.message, true);
        }
        return;
    }
    if (code) showDuelEntry(code.toUpperCase());
}
