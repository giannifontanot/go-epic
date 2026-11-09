import { newNote, removeNote, sanitizeNotes, sortNotes, updateNote } from './capture.model';

describe('capture notes', () => {
  it('creates trimmed notes and refuses empty ones', () => {
    expect(newNote('  idea ', 5)).toEqual(expect.objectContaining({ text: 'idea', done: false, star: false, at: 5 }));
    expect(newNote('   ', 5)).toBeNull();
  });

  it('shows starred first, then open ones (newest first), then done ones', () => {
    const notes = [
      { id: 'old', text: 'old', done: false, star: false, at: 1 },
      { id: 'done', text: 'done', done: true, star: true, at: 9 },
      { id: 'new', text: 'new', done: false, star: false, at: 5 },
      { id: 'star', text: 'star', done: false, star: true, at: 0 },
    ];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['star', 'new', 'old', 'done']);
  });

  it('edits (a blank text keeps the old one), removes and repairs bad data', () => {
    const notes = [{ id: 'a', text: 'a', done: false, star: false, at: 1 }];
    expect(updateNote(notes, 'a', { text: '  ', star: true })[0]).toEqual(expect.objectContaining({ text: 'a', star: true }));
    expect(updateNote(notes, 'a', { text: ' b ' })[0].text).toBe('b');
    expect(removeNote(notes, 'a')).toEqual([]);
    expect(sanitizeNotes({ items: [{ id: 'x', text: ' t ', done: 'yes' }, { id: 1, text: 'bad' }, { id: 'e', text: '' }] }))
      .toEqual([{ id: 'x', text: 't', done: false, star: false, at: 0 }]);
    expect(sanitizeNotes(undefined)).toEqual([]);
  });
});
