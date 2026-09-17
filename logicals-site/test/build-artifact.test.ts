import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Sites build artifact', () => {
  it('keeps the classic play rules script alongside the bundled client', () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
    expect(existsSync('dist/client/playLogic.js')).toBe(true);
  });

  it('bundles generation into a dedicated browser worker', () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
    const assets = readdirSync('dist/client/assets');
    expect(assets.some(file => file.startsWith('booklet.worker-'))).toBe(true);
    expect(readFileSync('client/js/api.js', 'utf8')).not.toContain('/api/booklet');
  });
});
