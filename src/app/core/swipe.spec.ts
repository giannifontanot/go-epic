import { stepDay, swipeDirection } from './swipe';

describe('swipe', () => {
  it('counts only a quick, mostly sideways stroke', () => {
    expect(swipeDirection(-80, 10, 300)).toBe(1);    // finger to the left: the next day
    expect(swipeDirection(90, -20, 300)).toBe(-1);   // to the right: the previous one
    expect(swipeDirection(-40, 0, 300)).toBe(0);     // too short
    expect(swipeDirection(-80, 70, 300)).toBe(0);    // too slanted: a scroll
    expect(swipeDirection(-200, 0, 1200)).toBe(0);   // too slow: a drag
  });

  it('steps a day, stopping at either end', () => {
    const days = ['MONDAY', 'TUESDAY', 'SUNDAY'];
    expect(stepDay(days, 'MONDAY', 1)).toBe('TUESDAY');
    expect(stepDay(days, 'MONDAY', -1)).toBeNull();
    expect(stepDay(days, 'SUNDAY', 1)).toBeNull();
  });
});
