import { TEXT_DEFAULT_SIZE, TEXT_SIZES, TEXT_SPACINGS, appSpacing, stepValue, textScale } from './text-settings';

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
