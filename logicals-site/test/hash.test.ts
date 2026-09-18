// logicals-site/test/hash.test.ts
import { describe, expect, it } from 'vitest';
import { fnv1a, fnv1a36 } from '../client/js/util/hash';

describe('fnv1a', () => {
  it('is deterministic', () => {
    expect(fnv1a('2026-09-18')).toBe(fnv1a('2026-09-18'));
  });

  it('separates neighbouring days', () => {
    expect(fnv1a('2026-09-18')).not.toBe(fnv1a('2026-09-19'));
  });

  it('stays an unsigned 32-bit integer', () => {
    for (const text of ['', 'a', '2026-09-18', 'x'.repeat(500)]) {
      const value = fnv1a(text);
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });

  it('reproduces the exact values storage keys already contain', () => {
    // These are byte-for-byte what the inline hash in playState produced. If
    // this test ever needs updating, every saved game has just been orphaned.
    expect(fnv1a36('')).toBe((0x811c9dc5 >>> 0).toString(36));
    expect(fnv1a36('a')).toBe((Math.imul(0x811c9dc5 ^ 97, 0x01000193) >>> 0).toString(36));
  });

  it('agrees with itself across the two forms', () => {
    expect(fnv1a36('2026-09-18')).toBe(fnv1a('2026-09-18').toString(36));
  });
});
