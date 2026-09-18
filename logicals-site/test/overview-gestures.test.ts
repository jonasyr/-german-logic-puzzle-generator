import { describe, expect, it } from 'vitest';
import { createGestureState, reduce, MOVE_SLOP } from '../client/js/play/overview/gestures';

type Ev = { type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number };

function run(events: Ev[]) {
  let state: any = createGestureState();
  const actions: any[] = [];
  for (const event of events) {
    const next = reduce(state, event);
    state = next.state;
    if (next.action) actions.push(next.action);
  }
  return { state, actions };
}

describe('overview gesture arbitration', () => {
  it('treats a still press and release as a tap', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'up', id: 1, x: 102, y: 101 },
    ]);
    expect(actions).toEqual([{ type: 'tap', x: 102, y: 101 }]);
  });

  it('turns a drag past the slop into a pan and suppresses the tap', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'move', id: 1, x: 100 + MOVE_SLOP + 5, y: 100 },
      { type: 'up', id: 1, x: 100 + MOVE_SLOP + 5, y: 100 },
    ]);
    expect(actions.some(a => a.type === 'pan')).toBe(true);
    expect(actions.some(a => a.type === 'tap')).toBe(false);
  });

  it('reports pan deltas relative to the previous position', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'move', id: 1, x: 130, y: 90 },
      { type: 'move', id: 1, x: 140, y: 95 },
    ]);
    const pans = actions.filter(a => a.type === 'pan');
    expect(pans[0]).toEqual({ type: 'pan', dx: 30, dy: -10 });
    expect(pans[1]).toEqual({ type: 'pan', dx: 10, dy: 5 });
  });

  it('switches to pinch on a second pointer and never emits a tap afterwards', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },
      { type: 'move', id: 2, x: 300, y: 200 },
      { type: 'up', id: 2, x: 300, y: 200 },
      { type: 'up', id: 1, x: 100, y: 200 },
    ]);
    const pinches = actions.filter(a => a.type === 'pinch');
    expect(pinches).toHaveLength(1);
    expect(pinches[0].scaleFromStart).toBeCloseTo(2, 5);
    expect(actions.some(a => a.type === 'pinchstart')).toBe(true);
    expect(actions.some(a => a.type === 'tap')).toBe(false);
  });

  it('measures the pinch against the gesture start, not the previous frame', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },   // start distance 100
      { type: 'move', id: 2, x: 300, y: 200 },   // 200 -> 2.0
      { type: 'move', id: 2, x: 400, y: 200 },   // 300 -> 3.0, not 1.5
      { type: 'move', id: 2, x: 250, y: 200 },   // 150 -> 1.5
    ]);
    const ratios = actions.filter(a => a.type === 'pinch').map(a => a.scaleFromStart);
    expect(ratios[0]).toBeCloseTo(2, 5);
    expect(ratios[1]).toBeCloseTo(3, 5);
    expect(ratios[2]).toBeCloseTo(1.5, 5);
  });

  it('floors the pinch distance so touching fingers cannot explode the ratio', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 100, y: 200 },   // identical points
      { type: 'move', id: 2, x: 150, y: 200 },
    ]);
    const pinch = actions.filter(a => a.type === 'pinch').pop();
    expect(Number.isFinite(pinch.scaleFromStart)).toBe(true);
    expect(pinch.scaleFromStart).toBeCloseTo(50, 5);
  });

  it('reports the midpoint translation as part of the pinch', () => {
    // Pointers move one event at a time, so the translation arrives split
    // across the two moves; what must hold is that it sums to the real shift
    // and that the spread is unchanged.
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'down', id: 2, x: 200, y: 100 },
      { type: 'move', id: 1, x: 110, y: 120 },
      { type: 'move', id: 2, x: 210, y: 120 },
    ]);
    const pinches = actions.filter(a => a.type === 'pinch');
    expect(pinches.at(-1).scaleFromStart).toBeCloseTo(1, 5);
    expect(pinches.reduce((sum, p) => sum + p.dx, 0)).toBeCloseTo(10, 5);
    expect(pinches.reduce((sum, p) => sum + p.dy, 0)).toBeCloseTo(20, 5);
  });

  it('re-seeds from the surviving finger when one of two lifts', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },
      { type: 'up', id: 2, x: 200, y: 200 },
      { type: 'move', id: 1, x: 130, y: 210 },
    ]);
    const pan = actions.filter(a => a.type === 'pan').pop();
    expect(pan).toEqual({ type: 'pan', dx: 30, dy: 10 });
  });

  it('ignores a third finger instead of letting it hijack the pinch', () => {
    // A palm or a resting thumb turns two pointers into three. The pair is
    // pinned to the two that started the gesture, so the newcomer neither moves
    // the grid nor changes what the baseline means. Previously the baseline
    // stayed while the measured pair silently became a different one, and the
    // ratio then had no relation to any real gesture.
    const { actions, state } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },   // baseline 100
      { type: 'move', id: 2, x: 300, y: 200 },   // ratio 2
      { type: 'down', id: 3, x: 600, y: 200 },   // third finger
      { type: 'move', id: 3, x: 900, y: 200 },   // and it wanders a long way
    ]);
    expect(state.pinch.a).toBe(1);
    expect(state.pinch.b).toBe(2);
    expect(actions.filter(a => a.type === 'pinchstart')).toHaveLength(1);

    const ratios = actions.filter(a => a.type === 'pinch').map(a => a.scaleFromStart);
    expect(ratios).toEqual([2]);   // the stray finger produced nothing at all
  });

  it('hands the pinch to the remaining pair when one of three lifts', () => {
    const { actions, state } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },
      { type: 'down', id: 3, x: 800, y: 200 },
      { type: 'up', id: 1, x: 100, y: 200 },     // pair becomes (2,3)
      { type: 'move', id: 3, x: 810, y: 200 },
    ]);
    expect(state.pinch.a).toBe(2);
    expect(state.pinch.b).toBe(3);
    // Re-seeded on the handover, so the ratio stays near 1 rather than jumping
    // to the 6x that the old baseline would have implied.
    const last = actions.filter(a => a.type === 'pinch').pop();
    expect(last.scaleFromStart).toBeGreaterThan(0.9);
    expect(last.scaleFromStart).toBeLessThan(1.1);
  });

  it('re-seeds when one of the two pinching fingers is replaced', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },   // baseline 100
      { type: 'up', id: 1, x: 100, y: 200 },
      { type: 'down', id: 3, x: 900, y: 200 },   // pair is now (2,3), distance 700
      { type: 'move', id: 3, x: 910, y: 200 },
    ]);
    const last = actions.filter(a => a.type === 'pinch').pop();
    // Without re-seeding this would read as 7x and hurl the grid across the world.
    expect(last.scaleFromStart).toBeGreaterThan(0.5);
    expect(last.scaleFromStart).toBeLessThan(2);
  });

  it('measures the pair it seeded, not whichever two happen to be first', () => {
    const { state } = run([
      { type: 'down', id: 7, x: 100, y: 100 },
      { type: 'down', id: 9, x: 200, y: 100 },
    ]);
    expect(state.pinch.a).toBe(7);
    expect(state.pinch.b).toBe(9);
    expect(state.pinch.startDistance).toBeCloseTo(100, 5);
  });

  it('forgets the pinch once fewer than two fingers remain', () => {
    const { state } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },
      { type: 'up', id: 2, x: 200, y: 200 },
    ]);
    expect(state.pinch).toBeNull();
  });

  it('drops the whole gesture on cancel', () => {
    const { actions, state } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'cancel', id: 1, x: 100, y: 100 },
    ]);
    expect(actions).toEqual([]);
    expect(state.pointers.size).toBe(0);
  });

  it('does not emit a tap for the second finger lifting after a pinch', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },
      { type: 'up', id: 1, x: 100, y: 200 },
      { type: 'up', id: 2, x: 200, y: 200 },
    ]);
    expect(actions.some(a => a.type === 'tap')).toBe(false);
  });
});
