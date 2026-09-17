import { submitResult } from './resultApi.js';

const STORAGE_KEY = 'logicals.result-outbox.v1';
let activeFlush = null;

function loadItems() {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(value) ? value : [];
    } catch { return []; }
}

function storeItems(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch { /* The current game remains playable if storage is unavailable. */ }
}

export async function flushItems(items, send) {
    const failed = [];
    for (const item of items) {
        try { await send(item); }
        catch { failed.push(item); }
    }
    return failed;
}

export function mergeAfterFlush(processed, failed, current) {
    const processedKeys = new Set(processed.map(item => item.attemptKey));
    const queuedDuringFlush = current.filter(item => !processedKeys.has(item.attemptKey));
    return [...failed, ...queuedDuringFlush];
}

export function queueResult(submission) {
    const items = loadItems();
    if (!items.some(item => item.attemptKey === submission.attemptKey)) {
        items.push(JSON.parse(JSON.stringify(submission)));
        storeItems(items);
    }
}

export function flushOutbox(send = submitResult) {
    if (activeFlush) return activeFlush;
    activeFlush = (async () => {
        const processed = loadItems();
        const failed = await flushItems(processed, send);
        const remaining = mergeAfterFlush(processed, failed, loadItems());
        storeItems(remaining);
        return remaining;
    })().finally(() => { activeFlush = null; });
    return activeFlush;
}

export function initResultOutbox() {
    flushOutbox();
    window.addEventListener('online', () => flushOutbox());
}
