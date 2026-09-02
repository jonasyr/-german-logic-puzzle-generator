import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { generateGermanLogicBooklet } from '../src';
import { pdfRendererAvailable } from './pdfEnvironment';

const script = path.join(process.cwd(), 'tools', 'generate_german_pdf.py');
const maybeDescribe = pdfRendererAvailable() ? describe : describe.skip;

function renderBooklet(booklet: unknown, directory: string, name: string): string {
    const inputPath = path.join(directory, `${name}.json`);
    const outputPath = path.join(directory, `${name}.pdf`);
    fs.writeFileSync(inputPath, JSON.stringify(booklet), 'utf8');
    const result = spawnSync('python3', [script, inputPath, outputPath], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    return outputPath;
}

function pageCount(pdfPath: string): number {
    const bytes = fs.readFileSync(pdfPath).toString('latin1');
    return (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

maybeDescribe('PDF layout for configurable booklets', () => {
    let workDir: string;

    beforeAll(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logicals-layout-'));
    });

    afterAll(() => {
        fs.rmSync(workDir, { recursive: true, force: true });
    });

    test('renders cover, clue page, grid page and solution page per puzzle', () => {
        const booklet = generateGermanLogicBooklet({ puzzleCount: 2, categoryCount: 3, valuesPerCategory: 4, difficulty: 'leicht' });

        const pdfPath = renderBooklet(booklet, workDir, 'small');

        // 1 cover + 2 pages per puzzle + 1 solution page per puzzle
        expect(pageCount(pdfPath)).toBe(1 + 2 * 2 + 2);
        expect(fs.statSync(pdfPath).size).toBeGreaterThan(10_000);
    }, 90_000);

    test('renders non-5x5 grids that the previous fixed layout rejected', () => {
        const booklet = generateGermanLogicBooklet({ puzzleCount: 1, categoryCount: 4, valuesPerCategory: 5, difficulty: 'mittel' });

        const pdfPath = renderBooklet(booklet, workDir, 'medium');

        expect(pageCount(pdfPath)).toBe(4);
    }, 90_000);

    test('applies a custom palette to the generated PDF', () => {
        const plain = generateGermanLogicBooklet({ puzzleCount: 1, categoryCount: 3, valuesPerCategory: 4, difficulty: 'leicht' });
        const colored = { ...plain, colors: { ...plain.colors, accent: '#7C3AED' } };

        const plainPath = renderBooklet(plain, workDir, 'plain');
        const coloredPath = renderBooklet(colored, workDir, 'colored');

        expect(fs.readFileSync(plainPath).equals(fs.readFileSync(coloredPath))).toBe(false);
    }, 90_000);

    test('rejects grids with fewer than three categories', () => {
        const booklet = generateGermanLogicBooklet({ puzzleCount: 1, categoryCount: 3, valuesPerCategory: 4, difficulty: 'leicht' });
        booklet.puzzles[0].categories = booklet.puzzles[0].categories.slice(0, 2);
        const inputPath = path.join(workDir, 'broken.json');
        fs.writeFileSync(inputPath, JSON.stringify(booklet), 'utf8');

        const result = spawnSync('python3', [script, inputPath, path.join(workDir, 'broken.pdf')], { encoding: 'utf8' });

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('mindestens drei Kategorien');
    }, 60_000);
});
