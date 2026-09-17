import { describe, expect, it } from 'vitest';
import { countdownSeconds, serverClockOffset } from '../client/js/duel/duelStore';

describe('duel countdown', () => {
  it('uses the authoritative start timestamp', () => {
    expect(countdownSeconds(14_000, 10_001)).toBe(4);
    expect(countdownSeconds(14_000, 13_999)).toBe(1);
    expect(countdownSeconds(14_000, 14_000)).toBe(0);
  });

  it('estimates the server clock at the request midpoint', () => {
    expect(serverClockOffset(10_100, 10_000, 10_040)).toBe(80);
  });
});
