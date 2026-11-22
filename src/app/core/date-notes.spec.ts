import { notesDoc, notesLabel, readNotes } from './date-notes';

describe('Date notes', () => {
  it('reads a day from before the lists as its single note, so nothing is lost', () => {
    expect(readNotes({ name: '  Cumpleaños  de Ana ', created: 7 })).toEqual([{ id: 'first', name: 'Cumpleaños de Ana', created: 7, calendar: null }]);
    expect(readNotes({ name: 'Viaje', created: 3, calendar: 'cal' })).toEqual([{ id: 'first', name: 'Viaje', created: 3, calendar: 'cal' }]);
    expect(readNotes({ name: '   ' })).toEqual([]);
    expect(readNotes(undefined)).toEqual([]);
  });

  it('reads the list, leaving out broken and repeated notes, and the list wins over the old name', () => {
    const notes = readNotes({
      name: 'Old',
      notes: [{ id: 'a', name: 'Cumpleaños', created: 2 }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }, { id: 'a', name: 'Twin' }, { name: 'No id' }, null, { id: 'c', name: ' ' }],
    });
    expect(notes).toEqual([{ id: 'a', name: 'Cumpleaños', created: 2, calendar: null }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }]);
  });

  it('writes the list with no undefined values, the joined name for older versions and the first created', () => {
    const doc = notesDoc([{ id: 'a', name: 'Cumpleaños', created: 9, calendar: null }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }]);
    expect(doc).toEqual({ notes: [{ id: 'a', name: 'Cumpleaños', created: 9 }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }], name: 'Cumpleaños · Primavera', created: 4 });
    expect(readNotes(doc)).toEqual([{ id: 'a', name: 'Cumpleaños', created: 9, calendar: null }, { id: 'b', name: 'Primavera', created: 4, calendar: 'cal' }]);
    expect(notesLabel(readNotes(doc))).toBe('Cumpleaños · Primavera');
    expect(notesLabel(undefined)).toBe('');
  });
});
