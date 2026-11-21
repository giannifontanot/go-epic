import { KeptDate, eventDates, importPlan } from './calendar-import';

describe('Calendar import', () => {
  it('puts each event on its day inside the range', () => {
    const found = eventDates([
      { summary: 'Cumpleaños de Ana', start: { date: '2027-02-10' }, end: { date: '2027-02-11' } },
      { summary: 'Viaje', start: { date: '2027-04-01' }, end: { date: '2027-04-04' } },
      { summary: 'Muy largo', start: { date: '2027-06-01' }, end: { date: '2027-07-15' } },
      { summary: 'Cita', start: { dateTime: '2027-02-10T15:00:00' } },
      { summary: 'Cancelada', status: 'cancelled', start: { date: '2027-03-01' } },
      { summary: '   ', start: { date: '2027-03-02' } },
      { summary: 'Fuera', start: { date: '2026-12-01' } },
    ], '2026-12-21', '2027-12-19');
    expect(found.get('2027-02-10')).toBe('Cumpleaños de Ana · Cita');
    expect([...found.keys()].filter((k) => k.startsWith('2027-04'))).toEqual(['2027-04-01', '2027-04-02', '2027-04-03']);
    expect(found.get('2027-06-01')).toBe('Muy largo');
    expect(found.has('2027-06-02')).toBe(false);
    expect(found.has('2027-03-01')).toBe(false);
    expect(found.has('2027-03-02')).toBe(false);
    expect(found.has('2026-12-01')).toBe(false);
  });

  it('never overwrites a date named by hand and removes what left the calendar', () => {
    const kept = new Map<string, KeptDate>([
      ['2027-01-05', { name: 'Mío', calendar: null }],
      ['2027-01-06', { name: 'Viejo', calendar: 'cal' }],
      ['2027-01-07', { name: 'Igual', calendar: 'cal' }],
      ['2027-01-08', { name: 'Otro calendario', calendar: 'other' }],
      ['2028-01-01', { name: 'Fuera', calendar: 'cal' }],
    ]);
    const found = new Map([['2027-01-05', 'Evento'], ['2027-01-07', 'Igual'], ['2027-01-09', 'Nuevo']]);
    const plan = importPlan(kept, found, 'cal', '2026-12-21', '2027-12-19');
    expect([...plan.write]).toEqual([['2027-01-09', 'Nuevo']]);
    expect(plan.remove).toEqual(['2027-01-06']);
    expect(plan.skipped).toBe(1);
  });
});
