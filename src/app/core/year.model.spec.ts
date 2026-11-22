import { YEARS, YEAR_2026, YEAR_2027, cleanDateName, nearestMonday, placeOf, weekdayOf, yearFor, yearPlan } from './year.model';

describe('Year model', () => {
  it('finds the nearest Monday', () => {
    expect(nearestMonday('2026-12-21')).toBe('2026-12-21');   // a Monday
    expect(nearestMonday('2027-03-20')).toBe('2027-03-22');   // Saturday: forward
    expect(nearestMonday('2027-09-23')).toBe('2027-09-20');   // Thursday: back
    expect(nearestMonday('2027-12-21')).toBe('2027-12-20');   // Tuesday: back
    expect(nearestMonday('2027-01-01')).toBe('2027-01-04');   // Friday: forward
  });

  it('lays out 2027 as 4 quarters of 4 sprints of 3 weeks and a rest week', () => {
    const plan = yearPlan(YEAR_2027.seasons, YEAR_2027.next);
    expect(plan.map((q) => q.season)).toEqual(['winter', 'spring', 'summer', 'autumn']);
    expect(plan.map((q) => [q.start, q.end])).toEqual([
      ['2026-12-21', '2027-03-21'], ['2027-03-22', '2027-06-20'], ['2027-06-21', '2027-09-19'], ['2027-09-20', '2027-12-19'],
    ]);
    for (const q of plan) {
      expect(weekdayOf(q.start)).toBe(0);
      expect(q.sprints.map((s) => s.n)).toEqual([1, 2, 3, 4]);
      for (const s of q.sprints) { expect(s.weeks.length).toBe(3); for (const w of s.weeks) expect(w.length).toBe(7); }
      expect(q.rest.length).toBe(1);
      expect(q.rest[0][6]).toBe(q.end);
    }
    expect(plan[0].rest[0][0]).toBe('2027-03-15');
  });

  it('lays out 2026 the same way, ending the day before 2027 begins', () => {
    const plan = yearPlan(YEAR_2026.seasons, YEAR_2026.next);
    expect(plan.map((q) => [q.start, q.end])).toEqual([
      ['2025-12-22', '2026-03-22'], ['2026-03-23', '2026-06-21'], ['2026-06-22', '2026-09-20'], ['2026-09-21', '2026-12-20'],
    ]);
    for (const q of plan) {
      expect(q.sprints.map((s) => s.n)).toEqual([1, 2, 3, 4]);
      expect(q.rest.length).toBe(1);
    }
    expect(YEAR_2026.next).toBe(YEAR_2027.seasons[0].date);
    expect(yearPlan(YEAR_2027.seasons, YEAR_2027.next)[0].start).toBe('2026-12-21');
  });

  it('opens on the year today falls in', () => {
    expect(yearFor(YEARS, '2025-06-01').year).toBe(2026);   // before: the next to come
    expect(yearFor(YEARS, '2026-11-22').year).toBe(2026);
    expect(yearFor(YEARS, '2026-12-20').year).toBe(2026);
    expect(yearFor(YEARS, '2026-12-21').year).toBe(2027);
    expect(yearFor(YEARS, '2028-02-01').year).toBe(2027);   // after: the last one
  });

  it('places a day in its quarter, sprint and week', () => {
    const plan = yearPlan(YEAR_2027.seasons, YEAR_2027.next);
    expect(placeOf(plan, '2026-12-21')).toEqual({ quarter: 0, season: 'winter', sprint: 1, week: 1 });
    expect(placeOf(plan, '2027-01-11')).toEqual({ quarter: 0, season: 'winter', sprint: 2, week: 1 });
    expect(placeOf(plan, '2027-03-17')).toEqual({ quarter: 0, season: 'winter', sprint: null, week: 1 });
    expect(placeOf(plan, '2027-12-19')).toEqual({ quarter: 3, season: 'autumn', sprint: null, week: 1 });
    expect(placeOf(plan, '2026-12-20')).toBeNull();
    expect(placeOf(plan, '2027-12-20')).toBeNull();
  });

  it('cleans an important date name', () => {
    expect(cleanDateName('  Cumpleaños   de  Ana ')).toBe('Cumpleaños de Ana');
    expect(cleanDateName('   ')).toBeNull();
    expect(cleanDateName(3)).toBeNull();
    expect(cleanDateName('x'.repeat(100))!.length).toBe(80);
  });
});
