import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sites app shell', () => {
  it('keeps the existing Logicals iOS shell', () => {
    const html = readFileSync(resolve('client/index.html'), 'utf8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('id="screen-start"');
    expect(html).toContain('id="screen-play"');
    expect(html).toContain('./js/main.js');
  });
});
