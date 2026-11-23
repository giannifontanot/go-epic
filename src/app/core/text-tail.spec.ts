import { splitTail } from './text-tail';

describe('splitTail', () => {
  it('keeps the last word for the pencil', () => {
    expect(splitTail('Correr en el parque')).toEqual({ head: 'Correr en el ', tail: 'parque' });
  });
  it('a single word is all tail', () => {
    expect(splitTail('Salud')).toEqual({ head: '', tail: 'Salud' });
  });
  it('ignores trailing spaces and empty names', () => {
    expect(splitTail('Leer más  ')).toEqual({ head: 'Leer ', tail: 'más' });
    expect(splitTail('')).toEqual({ head: '', tail: '' });
  });
  it('does not hold a very long last word', () => {
    const long = 'a'.repeat(30);
    expect(splitTail('Uno ' + long)).toEqual({ head: 'Uno ' + long, tail: '' });
  });
});
