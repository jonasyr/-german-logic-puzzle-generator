import { AddressInfo } from 'net';
import { Server } from 'http';

import { createAppServer } from '../server/index';

async function request(server: Server, path: string, body?: unknown) {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, body === undefined ? undefined : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
}

describe('Logicals web server', () => {
    let server: Server;

    beforeAll(async () => {
        server = createAppServer();
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    });

    afterAll(async () => {
        await new Promise<void>(resolve => { server.close(() => resolve()); });
    });

    test('serves the app shell', async () => {
        const { port } = server.address() as AddressInfo;
        const response = await fetch(`http://127.0.0.1:${port}/`);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/html');
        expect(await response.text()).toContain('LOGICALS');
    });

    test('answers the health check without doing any work', async () => {
        const { status, json } = await request(server, '/healthz');

        expect(status).toBe(200);
        expect(json).toEqual({ status: 'ok' });
    });

    test('exposes themes, limits and renderer availability', async () => {
        const { status, json } = await request(server, '/api/options');

        expect(status).toBe(200);
        expect(json.themes[0].id).toBe('standard');
        expect(json.themes).toHaveLength(11);
        expect(json.limits.categoryCount).toEqual({ min: 3, max: 5 });
        expect(typeof json.pdfAvailable).toBe('boolean');
    });

    test('generates a booklet from posted options', async () => {
        const { status, json } = await request(server, '/api/booklet', {
            puzzleCount: 1, categoryCount: 3, valuesPerCategory: 4, difficulty: 'leicht', seed: 11, title: 'Mini',
        });

        expect(status).toBe(200);
        expect(json.booklet.title).toBe('Mini');
        expect(json.booklet.puzzles).toHaveLength(1);
        expect(json.booklet.puzzles[0].verification.fullGridSolved).toBe(true);
    }, 60_000);

    test('rejects malformed payloads and unknown paths', async () => {
        const invalid = await request(server, '/api/booklet', ['not', 'an', 'object']);
        expect(invalid.status).toBe(400);

        const missing = await request(server, '/does-not-exist.js');
        expect(missing.status).toBe(404);
    });

    test('does not serve files outside the webapp directory', async () => {
        const { port } = server.address() as AddressInfo;
        const response = await fetch(`http://127.0.0.1:${port}/../package.json`, { redirect: 'manual' });

        expect(response.status).toBeGreaterThanOrEqual(400);
    });
});
