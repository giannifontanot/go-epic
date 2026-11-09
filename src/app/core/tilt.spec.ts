import { TILT_MAX_DEG, TILT_MAX_PX, tiltOf } from './tilt';

describe('tiltOf', () => {
  it('stands straight when the phone is upright or there is no reading', () => {
    expect(tiltOf(0)).toEqual({ deg: 0, px: 0 });
    expect(tiltOf(3)).toEqual({ deg: 0, px: 0 });
    expect(tiltOf(-3.9)).toEqual({ deg: 0, px: 0 });
    expect(tiltOf(null)).toEqual({ deg: 0, px: 0 });
    expect(tiltOf(NaN)).toEqual({ deg: 0, px: 0 });
  });

  it('leans towards the lower side, more with more tilt, up to the limit', () => {
    const right = tiltOf(30);
    expect(right.deg).toBeLessThan(0);                 // counter-clockwise: the foot swings right (the low side)
    expect(right.px).toBeGreaterThan(0);
    const left = tiltOf(-30);
    expect(left).toEqual({ deg: -right.deg, px: -right.px });
    expect(Math.abs(tiltOf(45).deg)).toBeGreaterThan(Math.abs(right.deg));
    expect(tiltOf(80)).toEqual({ deg: -TILT_MAX_DEG, px: TILT_MAX_PX });
    expect(tiltOf(-200)).toEqual({ deg: TILT_MAX_DEG, px: -TILT_MAX_PX });
  });

  it('does nothing in landscape', () => {
    expect(tiltOf(30, 90)).toEqual({ deg: 0, px: 0 });
    expect(tiltOf(30, 270)).toEqual({ deg: 0, px: 0 });
    expect(tiltOf(30, 360).deg).toBeLessThan(0);
  });
});
