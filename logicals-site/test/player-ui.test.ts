import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('player UI', () => {
  it('puts player selection before starting and includes personal history', () => {
    const html = readFileSync('client/index.html', 'utf8');
    expect(html.indexOf('id="player-button"')).toBeLessThan(html.indexOf('id="start-button"'));
    expect(html).toContain('id="player-dialog"');
    expect(html).toContain('id="screen-history"');
    expect(html).toContain('id="history-list"');
  });

  it('does not advertise the deferred PDF export', () => {
    const html = readFileSync('client/index.html', 'utf8');
    expect(html).not.toContain('id="pdf-button"');
    expect(html).not.toContain('druckfertiges PDF');
  });
});
