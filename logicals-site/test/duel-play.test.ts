import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthoritativeTimer } from '../client/js/play/playTimer';

afterEach(() => vi.useRealTimers());

describe('duel timer', () => {
  it('continues while the local grid is covered', () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const timer = createAuthoritativeTimer(10_000, () => undefined);
    timer.cover();
    vi.setSystemTime(25_000);
    expect(timer.elapsedMs()).toBe(15_000);
  });

  it('freezes the score exactly once at completion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const timer = createAuthoritativeTimer(10_000, () => undefined);
    timer.stop();
    vi.setSystemTime(30_000);
    expect(timer.elapsedMs()).toBe(10_000);
  });
});
