import { describe, expect, it } from 'vitest';
import * as overviewView from '../client/js/play/overviewView';

const overview = overviewView as typeof overviewView & {
  clampZoom?: (scale: number) => number;
  fitZoom?: (geometry: Record<string, number>) => number;
  fitZoomForLayout?: (geometry: Record<string, number | boolean>) => number;
  zoomedScrollPosition?: (geometry: Record<string, number>) => { left: number; top: number };
};

describe('mobile overview zoom geometry', () => {
  it('fits the complete grid into both available dimensions', () => {
    expect(overview.fitZoom?.({
      viewportWidth: 320,
      viewportHeight: 500,
      contentWidth: 800,
      contentHeight: 1000,
    })).toBe(0.4);
    expect(overview.fitZoom?.({
      viewportWidth: 200,
      viewportHeight: 200,
      contentWidth: 1000,
      contentHeight: 1000,
    })).toBe(0.2);
  });

  it('never auto-shrinks an interactive fine-pointer desktop grid', () => {
    expect(overview.fitZoomForLayout?.({
      touchLayout: false,
      viewportWidth: 540,
      viewportHeight: 540,
      contentWidth: 860,
      contentHeight: 860,
    })).toBe(1);
    expect(overview.fitZoomForLayout?.({
      touchLayout: true,
      viewportWidth: 540,
      viewportHeight: 540,
      contentWidth: 860,
      contentHeight: 860,
    })).toBeCloseTo(0.628, 3);
  });

  it('keeps pinch zoom inside the readable interaction range', () => {
    expect(overview.clampZoom?.(0.01)).toBe(0.1);
    expect(overview.clampZoom?.(0.8)).toBe(0.8);
    expect(overview.clampZoom?.(3)).toBe(1.5);
  });

  it('keeps the content under the pinch midpoint stationary', () => {
    expect(overview.zoomedScrollPosition?.({
      scrollLeft: 40,
      scrollTop: 60,
      anchorX: 100,
      anchorY: 200,
      previousScale: 0.5,
      nextScale: 1,
    })).toEqual({ left: 180, top: 320 });
  });
});
