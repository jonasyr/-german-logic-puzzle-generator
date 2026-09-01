import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('German PDF booklet CLI', () => {
    test('exposes a usable command-line interface', () => {
        const script = path.join(process.cwd(), 'tools', 'generate_german_pdf.py');

        const result = spawnSync('python3', [script, '--help'], { encoding: 'utf8' });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Eingabe-JSON');
        expect(result.stdout).toContain('Ausgabe-PDF');
    });

    test('creates a four-page printable booklet for one puzzle', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'german-logical-'));
        const inputPath = path.join(tempDir, 'booklet.json');
        const outputPath = path.join(tempDir, 'booklet.pdf');
        const script = path.join(process.cwd(), 'tools', 'generate_german_pdf.py');
        const categories = ['Person', 'Gericht', 'Getränk', 'Stand', 'Ankunft'].map((label, index) => ({
            id: `c${index}`,
            label,
            ordinal: index === 4,
            values: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
        }));
        const puzzle = {
            id: 'fixture', number: 1, seed: 123, title: 'Testlogical',
            story: 'Fünf Personen müssen anhand anspruchsvoller Hinweise eindeutig zugeordnet werden.',
            instructions: 'Ordne jeder Person genau einen Wert aus jeder Kategorie zu.',
            categories,
            clues: Array.from({ length: 12 }, (_, index) => `Hinweis ${index + 1}: Diese Aussage ist lang genug, um den automatischen Zeilenumbruch realistisch zu prüfen.`),
            targetQuestion: 'Welches Gericht gehört zu Echo?',
            solutionRows: Array.from({ length: 5 }, (_, row) => Object.fromEntries(categories.map(category => [category.label, category.values[row]]))),
            verification: { fullGridSolved: true, clueCount: 12, distinctClueTypes: 4 },
        };
        fs.writeFileSync(inputPath, JSON.stringify({
            title: 'Logik unter Hochdruck', subtitle: 'Testausgabe', generatedAt: '2026-09-01', puzzles: [puzzle],
        }));

        try {
            const generated = spawnSync('python3', [script, inputPath, outputPath], { encoding: 'utf8' });
            const info = spawnSync('pdfinfo', [outputPath], { encoding: 'utf8' });
            const extracted = spawnSync('pdftotext', [outputPath, '-'], { encoding: 'utf8' });
            const gridGeometry = spawnSync('python3', [
                '-c',
                'import pdfplumber,sys; p=pdfplumber.open(sys.argv[1]); page=p.pages[2]; print(len(page.lines) + len(page.rects)); p.close()',
                outputPath,
            ], { encoding: 'utf8' });

            expect(generated.status).toBe(0);
            expect(fs.statSync(outputPath).size).toBeGreaterThan(20_000);
            expect(info.stdout).toMatch(/Pages:\s+4/);
            expect(extracted.stdout).toContain('Testlogical');
            expect(extracted.stdout).toContain('Lösung');
            expect(Number(gridGeometry.stdout.trim())).toBeGreaterThanOrEqual(90);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }, 30_000);
});
