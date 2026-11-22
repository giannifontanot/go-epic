import { notesDoc, notesLabel, readNotes } from './date-notes';

describe('Date notes', () => {
  it('reads a day from before the lists as its single note, so nothing is lost', () => {
    expect(readNotes({ name: '  Cumpleaños  de Ana ', created: 7 }, '2027-02-10')).toEqual([{ id: 'first-2027-02-10', name: 'Cumpleaños de Ana', created: 7, calendar: null }]);
    expect(readNotes({ name: 'Viaje', created: 3, calendar: 'cal' }, '2027-04-01')).toEqual([{ id: 'first-2027-04-01', name: 'Viaje', created: 3, calendar: 'cal' }]);
    expect(readNotes({ name: '   ' }, '2027-01-01')).toEqual([]);
    expect(readNotes(undefined, '2027-01-01')).toEqual([]);
  });

  it('reads the list, leaving out broken and repeated notes, and the list wins over the old name', () => {
    const notes = readNotes({
      name: 'Old',
      notes: [{ id: 'a', name: 'Cumpleaños', created: 2 }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }, { id: 'a', name: 'Twin' }, { name: 'No id' }, null, { id: 'c', name: ' ' }],
    }, '2027-01-01');
    expect(notes).toEqual([{ id: 'a', name: 'Cumpleaños', created: 2, calendar: null }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }]);
  });

  it('writes the list with no undefined values, the joined name for older versions and the first created', () => {
    const doc = notesDoc([{ id: 'a', name: 'Cumpleaños', created: 9, calendar: null }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }]);
    expect(doc).toEqual({ notes: [{ id: 'a', name: 'Cumpleaños', created: 9 }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }], name: 'Cumpleaños · Primavera', created: 4 });
    expect(readNotes(doc, '2027-01-01')).toEqual([{ id: 'a', name: 'Cumpleaños', created: 9, calendar: null }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }]);
    expect(notesLabel(readNotes(doc, '2027-01-01'))).toBe('Cumpleaños · Primavera');
    expect(notesLabel(undefined)).toBe('');
  });
});
