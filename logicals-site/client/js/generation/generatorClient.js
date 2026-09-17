let nextId = 1;
let worker;
const pending = new Map();

function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./booklet.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', event => {
        const request = pending.get(event.data.id);
        if (!request) return;
        pending.delete(event.data.id);
        if (event.data.ok) request.resolve(event.data.data);
        else request.reject(new Error(event.data.error || 'Erzeugung fehlgeschlagen.'));
    });
    worker.addEventListener('error', event => {
        const error = new Error(event.message || 'Der Rätselgenerator wurde unerwartet beendet.');
        for (const request of pending.values()) request.reject(error);
        pending.clear();
        worker.terminate();
        worker = undefined;
    });
    return worker;
}

function request(type, payload = {}) {
    return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        getWorker().postMessage({ id, type, ...payload });
    });
}

export function fetchGeneratorOptions() {
    return request('options');
}

export function generateBooklet(options) {
    return request('generate', { options });
}
