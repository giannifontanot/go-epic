import { PERIOD_DAYS, TRACK_START, addDays, daysBetween, periodDay, periodEnd, periodGrid } from './period.model';

describe('tracking period', () => {
  it('starts on the first day of autumn 2026 and lasts 126 days', () => {
    expect(TRACK_START).toBe('2026-09-22');
    expect(PERIOD_DAYS).toBe(126);
    expect(periodEnd(TRACK_START)).toBe('2027-01-25');
  });

  it('is 6 rows of 3 weeks of 7 days, in order and without gaps', () => {
    const grid = periodGrid(TRACK_START);
    expect(grid.length).toBe(6);
    expect(grid.every((row) => row.length === 3 && row.every((week) => week.length === 7))).toBe(true);
    const flat = grid.flat(2);
    expect(flat.length).toBe(126);
    expect(flat[0]).toBe('2026-09-22');
    expect(flat[7]).toBe('2026-09-29');
    expect(flat[125]).toBe('2027-01-25');
    for (let i = 1; i < flat.length; i++) expect(daysBetween(flat[i - 1], flat[i])).toBe(1);
  });

  it('counts days across month, year and summer time changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
    expect(daysBetween('2026-09-22', '2026-11-21')).toBe(60);
  });

  it('says which day of the period today is', () => {
    expect(periodDay(TRACK_START, '2026-09-21')).toBe(0);
    expect(periodDay(TRACK_START, '2026-09-22')).toBe(1);
    expect(periodDay(TRACK_START, '2026-11-21')).toBe(61);
    expect(periodDay(TRACK_START, '2027-01-25')).toBe(126);
    expect(periodDay(TRACK_START, '2027-01-26')).toBe(127);
  });
});
