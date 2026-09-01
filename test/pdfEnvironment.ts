import { spawnSync } from 'child_process';

/** The PDF renderer needs python3 + reportlab, which are optional in CI/dev setups. */
export function pdfRendererAvailable(): boolean {
    const probe = spawnSync('python3', ['-c', 'import reportlab'], { encoding: 'utf8' });
    return probe.status === 0;
}

/** The stricter PDF assertions additionally need poppler-utils and pdfplumber. */
export function pdfInspectionAvailable(): boolean {
    const plumber = spawnSync('python3', ['-c', 'import pdfplumber'], { encoding: 'utf8' });
    const info = spawnSync('pdfinfo', ['-v'], { encoding: 'utf8' });
    const text = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
    return plumber.status === 0 && info.error === undefined && text.error === undefined;
}
