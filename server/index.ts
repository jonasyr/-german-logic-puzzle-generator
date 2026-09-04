/**
 * Minimal dependency-free HTTP server for the German logic-puzzle web app.
 *
 * It exposes the booklet generator over JSON and shells out to the ReportLab
 * renderer in tools/generate_german_pdf.py for the printable PDF.
 */
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { tmpdir } from 'os';
import { dirname, extname, join, normalize, resolve, sep } from 'path';
import { Worker } from 'worker_threads';

import {
    BOOKLET_LIMITS,
    generateGermanLogicBooklet,
    listGermanThemes,
    DEFAULT_BOOKLET_COLORS,
    STANDARD_THEME_ID,
    GermanBookletOptions,
    GermanLogicBooklet,
} from '../src';

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';
/** Walks up from this file so the server works both from dist/ and from ts-node. */
function findProjectRoot(): string {
    let directory = __dirname;
    for (let depth = 0; depth < 5; depth++) {
        if (existsSync(join(directory, 'webapp', 'index.html'))) return directory;
        directory = dirname(directory);
    }
    return resolve(__dirname, '..', '..');
}

const PROJECT_ROOT = findProjectRoot();
const WEBAPP_DIR = join(PROJECT_ROOT, 'webapp');
const PDF_SCRIPT = join(PROJECT_ROOT, 'tools', 'generate_german_pdf.py');
const PYTHON = process.env.PYTHON ?? 'python3';
const MAX_BODY_BYTES = 256 * 1024;
const CACHE_LIMIT = 24;

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

/** Booklets are cached by their option signature so the PDF route can reuse a preview. */
const bookletCache = new Map<string, GermanLogicBooklet>();

function cacheKey(options: GermanBookletOptions): string {
    return JSON.stringify(options ?? {});
}

function rememberBooklet(key: string, booklet: GermanLogicBooklet): void {
    bookletCache.set(key, booklet);
    while (bookletCache.size > CACHE_LIMIT) {
        const oldest = bookletCache.keys().next().value;
        if (oldest === undefined) break;
        bookletCache.delete(oldest);
    }
}

const WORKER_FILE = join(__dirname, 'bookletWorker.js');
const MAX_CONCURRENT_GENERATIONS = Math.max(1, Number(process.env.LOGICALS_MAX_CONCURRENCY ?? 2));
let activeGenerations = 0;
const waiting: (() => void)[] = [];

/** Limits how many puzzle generations run at once so a small host stays responsive. */
async function withGenerationSlot<T>(task: () => Promise<T>): Promise<T> {
    if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
        await new Promise<void>(release => waiting.push(release));
    }
    activeGenerations++;
    try {
        return await task();
    } finally {
        activeGenerations--;
        waiting.shift()?.();
    }
}

/**
 * Generation is CPU-bound and takes seconds for a full booklet, so it runs in a worker
 * thread. When the compiled worker is unavailable (ts-node, tests) it falls back to
 * generating inline.
 */
function generateBooklet(options: GermanBookletOptions): Promise<GermanLogicBooklet> {
    if (!existsSync(WORKER_FILE)) {
        return Promise.resolve(generateGermanLogicBooklet(options));
    }
    return new Promise((resolvePromise, reject) => {
        const worker = new Worker(WORKER_FILE, { workerData: options });
        let settled = false;
        worker.once('message', (booklet: GermanLogicBooklet) => {
            settled = true;
            resolvePromise(booklet);
        });
        worker.once('error', reject);
        worker.once('exit', code => {
            if (!settled) reject(new Error(`Generierung abgebrochen (Exit-Code ${code}).`));
        });
    });
}

async function bookletFor(options: GermanBookletOptions): Promise<GermanLogicBooklet> {
    const key = cacheKey(options);
    const cached = bookletCache.get(key);
    if (cached) return cached;
    // The library default is a pinned date for reproducibility; a live app wants the real one.
    const today = new Date().toISOString().slice(0, 10);
    const booklet = await withGenerationSlot(() => generateBooklet({ generatedAt: today, ...options }));
    rememberBooklet(key, booklet);
    return booklet;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolvePromise, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Anfrage zu groß.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

async function readOptions(req: IncomingMessage): Promise<GermanBookletOptions> {
    const raw = await readBody(req);
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Ungültige Konfiguration.');
    }
    return parsed as GermanBookletOptions;
}

function serveStatic(res: ServerResponse, urlPath: string): void {
    const relative = normalize(decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath)).replace(/^([/\\])+/, '');
    const filePath = resolve(WEBAPP_DIR, relative);
    if (filePath !== WEBAPP_DIR && !filePath.startsWith(WEBAPP_DIR + sep)) {
        sendJson(res, 403, { error: 'Zugriff verweigert.' });
        return;
    }
    try {
        if (!statSync(filePath).isFile()) throw new Error('not a file');
        const body = readFileSync(filePath);
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
            'Content-Length': body.length,
            'Cache-Control': 'no-cache',
        });
        res.end(body);
    } catch {
        sendJson(res, 404, { error: 'Nicht gefunden.' });
    }
}

function runPython(args: string[]): Promise<{ code: number; stderr: string }> {
    return new Promise(resolvePromise => {
        const child = spawn(PYTHON, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr += String(chunk); });
        child.on('error', error => resolvePromise({ code: -1, stderr: String(error) }));
        child.on('close', code => resolvePromise({ code: code ?? -1, stderr }));
    });
}

let pdfAvailability: Promise<boolean> | null = null;

/** Probed once per process: spawning python on every request would be wasteful. */
function pdfToolAvailable(): Promise<boolean> {
    if (!pdfAvailability) {
        pdfAvailability = runPython(['-c', 'import reportlab']).then(({ code }) => code === 0);
    }
    return pdfAvailability;
}

function fileNameFor(booklet: GermanLogicBooklet): string {
    const slug = booklet.title
        .toLowerCase()
        .replace(/[äöüß]/g, match => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[match] ?? match))
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${slug || 'logicals'}.pdf`;
}

async function renderPdf(booklet: GermanLogicBooklet): Promise<Buffer> {
    const workDir = mkdtempSync(join(tmpdir(), 'logicals-'));
    const inputPath = join(workDir, 'booklet.json');
    const outputPath = join(workDir, 'booklet.pdf');
    try {
        writeFileSync(inputPath, JSON.stringify(booklet), 'utf8');
        const { code, stderr } = await runPython([PDF_SCRIPT, inputPath, outputPath]);
        if (code !== 0) {
            const detail = stderr.trim().split('\n').pop() ?? `Exit-Code ${code}`;
            throw new Error(`PDF-Erzeugung fehlgeschlagen: ${detail}`);
        }
        return readFileSync(outputPath);
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
        sendJson(res, 200, { status: 'ok' });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/options') {
        sendJson(res, 200, {
            themes: [{ id: STANDARD_THEME_ID, title: 'Standard (alle Themen abwechselnd)' }, ...listGermanThemes()],
            limits: BOOKLET_LIMITS,
            difficulties: ['leicht', 'mittel', 'schwer'],
            defaultColors: DEFAULT_BOOKLET_COLORS,
            pdfAvailable: await pdfToolAvailable(),
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/booklet') {
        const options = await readOptions(req);
        const startedAt = Date.now();
        const booklet = await bookletFor(options);
        sendJson(res, 200, { booklet, durationMs: Date.now() - startedAt });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/pdf') {
        const options = await readOptions(req);
        const booklet = await bookletFor(options);
        const pdf = await renderPdf(booklet);
        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': pdf.length,
            'Content-Disposition': `attachment; filename="${fileNameFor(booklet)}"`,
        });
        res.end(pdf);
        return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(res, url.pathname);
        return;
    }

    sendJson(res, 405, { error: 'Methode nicht erlaubt.' });
}

export function createAppServer() {
    return createServer((req, res) => {
        handle(req, res).catch(error => {
            const message = error instanceof Error ? error.message : 'Unbekannter Fehler.';
            if (!res.headersSent) sendJson(res, 400, { error: message });
            else res.end();
        });
    });
}

if (require.main === module) {
    createAppServer().listen(PORT, HOST, () => {
        console.log(`Logicals-Webapp läuft auf http://${HOST}:${PORT}`);
    });
}
