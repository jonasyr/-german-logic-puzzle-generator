import { describe, expect, it, vi } from 'vitest';
import { flushItems, mergeAfterFlush } from '../client/js/results/outbox';

describe('result outbox', () => {
  it('removes successful items and keeps transient failures with the same key', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'));
    const items = [{ attemptKey: 'a' }, { attemptKey: 'b' }];

    expect(await flushItems(items, send)).toEqual([{ attemptKey: 'b' }]);
    expect(items[1].attemptKey).toBe('b');
  });

  it('does not mutate the original queued objects', async () => {
    const item = Object.freeze({ attemptKey: 'a', elapsedMs: 10 });
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await flushItems([item], send)).toEqual([item]);
  });

  it('preserves items queued while a flush is running', () => {
    const processed = [{ attemptKey: 'a' }];
    const failed: Array<{ attemptKey: string }> = [];
    const current = [{ attemptKey: 'a' }, { attemptKey: 'b' }];
    expect(mergeAfterFlush(processed, failed, current)).toEqual([{ attemptKey: 'b' }]);
  });
});
