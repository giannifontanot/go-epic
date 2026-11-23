import { Look, glideEase, lookBetween, PX_PER_MIN_DEFAULT, PX_PER_MIN_STEPS, TEXT_DEFAULT_SIZE, TEXT_SIZES, TEXT_SPACINGS, appSpacing, clampPxPerMin, stepValue, textScale } from './text-settings';

describe('text settings', () => {
  it('grows the other labels gently with the activities\' text', () => {
    expect(textScale(TEXT_DEFAULT_SIZE)).toBe(1);
    expect(textScale(18)).toBeCloseTo(1.12, 3);                            // activities ×1.2 → labels ×1.12
    expect(8 * textScale(18)).toBeCloseTo(9, 0);                           // an 8px label becomes about 9px
    expect(textScale(12)).toBeCloseTo(0.9, 3);
    expect(textScale(26)).toBe(1.44);
    expect(textScale(99)).toBe(1.44);                                      // clamped to the slider's range
    expect(textScale(NaN)).toBe(1);
  });

  it('gives the rest of the app half the letter spacing, at most 0.06em', () => {
    expect(appSpacing(0)).toBe(0);
    expect(appSpacing(0.04)).toBe(0.02);
    expect(appSpacing(0.15)).toBe(0.06);
    expect(appSpacing(-0.02)).toBe(-0.01);                                // a tighter text is allowed too
    expect(appSpacing(-1)).toBe(-0.01);
  });

  it('steps the Aa and AV steppers to the next value, never past the ends', () => {
    expect(stepValue(TEXT_SIZES, 15, 1)).toBe(17);
    expect(stepValue(TEXT_SIZES, 15, -1)).toBe(13);
    expect(stepValue(TEXT_SIZES, 22.5, 1)).toBe(22.5);
    expect(stepValue(TEXT_SIZES, 16, 1)).toBe(17);                          // off the steps: the nearest step (a tie keeps the lower), then the next
    expect(stepValue(TEXT_SPACINGS, 0, 1)).toBe(0.03);
    expect(stepValue(TEXT_SPACINGS, -0.02, -1)).toBe(-0.02);
  });
});

describe('px per minute', () => {
  it('steps through 0.3, 0.5, 0.7, 1 and 1.4 px a minute', () => {
    expect(stepValue(PX_PER_MIN_STEPS, 0.5, 1)).toBe(0.7);
    expect(stepValue(PX_PER_MIN_STEPS, 0.5, -1)).toBe(0.3);
    expect(stepValue(PX_PER_MIN_STEPS, 1, 1)).toBe(1.4);
    expect(stepValue(PX_PER_MIN_STEPS, 1.4, 1)).toBe(1.4);
    expect(stepValue(PX_PER_MIN_STEPS, 0.3, -1)).toBe(0.3);
  });
  it('keeps a saved scale inside the range, 0.5 (the default) when it is not a number', () => {
    expect(clampPxPerMin(0.7)).toBe(0.7);
    expect(clampPxPerMin(3)).toBe(1.4);
    expect(clampPxPerMin(0)).toBe(0.3);
    expect(clampPxPerMin('x')).toBe(PX_PER_MIN_DEFAULT);
    expect(clampPxPerMin(Number.NaN)).toBe(PX_PER_MIN_DEFAULT);
    expect(PX_PER_MIN_DEFAULT).toBe(0.5);
  });

  it('glides a step softly: slow at both ends, never past the chosen value', () => {
    expect(glideEase(0)).toBe(0);
    expect(glideEase(1)).toBe(1);
    expect(glideEase(0.5)).toBeCloseTo(0.5, 5);
    expect(glideEase(0.1)).toBeLessThan(0.1);                              // starts softly
    expect(glideEase(0.9)).toBeGreaterThan(0.9);                           // ends softly
    expect(glideEase(-1)).toBe(0);
    expect(glideEase(2)).toBe(1);
    expect(glideEase(NaN)).toBe(1);
  });

  it('draws a look part of the way between the old one and the chosen one, both ways', () => {
    const small: Look = { size: 15, spacing: 0, px: 0.5 };
    const big: Look = { size: 17, spacing: 0.03, px: 0.7 };
    expect(lookBetween(small, big, 0)).toEqual(small);
    expect(lookBetween(small, big, 1)).toEqual(big);
    const half = lookBetween(small, big, 0.5);
    expect(half.size).toBeCloseTo(16, 5);
    expect(half.spacing).toBeCloseTo(0.015, 5);
    expect(half.px).toBeCloseTo(0.6, 5);
    expect(lookBetween(big, small, 0.5).px).toBeCloseTo(0.6, 5);          // shrinking passes the same way back
  });
});
