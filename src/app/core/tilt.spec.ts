import { TILT_MAX_DEG, TILT_PILE, pileShift, tiltOf } from './tilt';
import { leanSwing } from './tilt';

describe('tiltOf', () => {
  it('stands straight when the phone is upright or there is no reading', () => {
    expect(tiltOf(0)).toEqual({ deg: 0, k: 0 });
    expect(tiltOf(3)).toEqual({ deg: 0, k: 0 });
    expect(tiltOf(-3.9)).toEqual({ deg: 0, k: 0 });
    expect(tiltOf(null)).toEqual({ deg: 0, k: 0 });
    expect(tiltOf(NaN)).toEqual({ deg: 0, k: 0 });
  });

  it('leans towards the lower side, more with more tilt, up to the limit', () => {
    const right = tiltOf(30);
    expect(right.deg).toBeLessThan(0);                 // counter-clockwise: the foot swings right (the low side)
    expect(right.k).toBeGreaterThan(0);
    const left = tiltOf(-30);
    expect(left).toEqual({ deg: -right.deg, k: -right.k });
    expect(Math.abs(tiltOf(45).deg)).toBeGreaterThan(Math.abs(right.deg));
    expect(tiltOf(80)).toEqual({ deg: -TILT_MAX_DEG, k: 1 });
    expect(tiltOf(-200)).toEqual({ deg: TILT_MAX_DEG, k: -1 });
  });

  it('does nothing in landscape', () => {
    expect(tiltOf(30, 90)).toEqual({ deg: 0, k: 0 });
    expect(tiltOf(30, 270)).toEqual({ deg: 0, k: 0 });
    expect(tiltOf(30, 360).deg).toBeLessThan(0);
  });
});

describe('pileShift', () => {
  it('stays in place when upright', () => {
    expect(pileShift(0, 50, 300)).toBe(0);
    expect(pileShift(0, 300, 50)).toBe(0);
  });

  it('slides towards the lower edge, the farther buttons more, never past the edge, so they pile up', () => {
    const far = pileShift(1, 20, 300);                 // right side down: a button far from the right edge travels the most
    const near = pileShift(1, 300, 20);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeCloseTo(300 * TILT_PILE);
    expect(far).toBeLessThan(300);                     // it never leaves the screen
    expect(pileShift(1, 300, 0)).toBe(0);              // already at the edge
    expect(pileShift(-1, 300, 20)).toBeCloseTo(-300 * TILT_PILE);   // left side down: towards the left
    expect(pileShift(-0.5, 0, 200)).toBeCloseTo(0);
    // two 80px buttons side by side with a 10px gap end up overlapping
    const a = { left: 20, right: 390 - 100 }, b = { left: 110, right: 390 - 190 };
    const aEnd = 100 + pileShift(1, a.left, a.right), bStart = 110 + pileShift(1, b.left, b.right);
    expect(aEnd).toBeGreaterThan(bStart);
  });

  it('measures how far a leaning box swings past its sides (tall cards swing more)', () => {
    expect(leanSwing(300, 40, 0)).toBe(0);
    expect(leanSwing(300, 600, 1.5)).toBeCloseTo(150 * Math.cos(Math.PI / 120) + 300 * Math.sin(Math.PI / 120) - 150, 6);
    expect(leanSwing(300, 600, 1.5)).toBeGreaterThan(leanSwing(300, 60, 1.5));
  });
});
