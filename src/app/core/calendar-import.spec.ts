import { DateNote } from './date-notes';
import { eventDates, importPlan } from './calendar-import';

const note = (id: string, name: string, calendar: string | null = null): DateNote => ({ id, name, created: 1, calendar });

describe('Calendar import', () => {
  it('puts each event on its day inside the range', () => {
    const found = eventDates([
      { summary: 'Cumpleaños de Ana', start: { date: '2027-02-10' }, end: { date: '2027-02-11' } },
      { summary: 'Viaje', start: { date: '2027-04-01' }, end: { date: '2027-04-04' } },
      { summary: 'Muy largo', start: { date: '2027-06-01' }, end: { date: '2027-07-15' } },
      { summary: 'Cita', start: { dateTime: '2027-02-10T15:00:00' } },
      { summary: 'Cita', start: { dateTime: '2027-02-10T18:00:00' } },
      { summary: 'Cancelada', status: 'cancelled', start: { date: '2027-03-01' } },
      { summary: '   ', start: { date: '2027-03-02' } },
      { summary: 'Fuera', start: { date: '2026-12-01' } },
    ], '2026-12-21', '2027-12-19');
    expect(found.get('2027-02-10')).toEqual(['Cumpleaños de Ana', 'Cita']);
    expect([...found.keys()].filter((k) => k.startsWith('2027-04'))).toEqual(['2027-04-01', '2027-04-02', '2027-04-03']);
    expect(found.get('2027-06-01')).toEqual(['Muy largo']);
    expect(found.has('2027-06-02')).toBe(false);
    expect(found.has('2027-03-01')).toBe(false);
    expect(found.has('2027-03-02')).toBe(false);
    expect(found.has('2026-12-01')).toBe(false);
  });

  it('adds each event as a note beside the notes by hand, keeps what is still there and drops what left the calendar', () => {
    const kept = new Map<string, DateNote[]>([
      ['2027-01-05', [note('a', 'Mío')]],
      ['2027-01-06', [note('b', 'Viejo', 'cal')]],
      ['2027-01-07', [note('c', 'Igual', 'cal')]],
      ['2027-01-08', [note('d', 'Otro calendario', 'other')]],
      ['2027-01-10', [note('e', 'Mío', null), note('f', 'Se va', 'cal')]],
      ['2028-01-01', [note('g', 'Fuera', 'cal')]],
    ]);
    const found = new Map([['2027-01-05', ['Evento', 'mío']], ['2027-01-07', ['Igual']], ['2027-01-09', ['Nuevo']]]);
    let n = 0;
    const plan = importPlan(kept, found, 'cal', '2026-12-21', '2027-12-19', () => `new${++n}`, 5);
    expect([...plan.write.keys()]).toEqual(['2027-01-05', '2027-01-09', '2027-01-10']);
    expect(plan.write.get('2027-01-05')).toEqual([note('a', 'Mío'), { id: 'new1', name: 'Evento', created: 5, calendar: 'cal' }]);
    expect(plan.write.get('2027-01-10')).toEqual([note('e', 'Mío')]);
    expect(plan.remove).toEqual(['2027-01-06']);
    expect(plan.added).toBe(2);
    expect(plan.dropped).toBe(2);
    expect(plan.skipped).toBe(1);
  });
});
