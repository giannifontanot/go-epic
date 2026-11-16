import { isTypingControl, mirrored } from './dialog';

describe('dialog motion', () => {
  it('mirrors frames in time: reversed, with explicit offsets turned to 1 − t', () => {
    const close = [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.18)', opacity: 1, offset: 0.82 }, { transform: 'scale(.05)', opacity: 0 }];
    expect(mirrored(close)).toEqual([
      { transform: 'scale(.05)', opacity: 0 },
      { transform: 'scale(.18)', opacity: 1, offset: expect.closeTo(0.18, 10) },
      { transform: 'scale(1)', opacity: 1 },
    ]);
  });
});

describe('no cursor on opening', () => {
  it('knows which controls bring up the keyboard', () => {
    const input = (type: string) => Object.assign(document.createElement('input'), { type });
    expect(isTypingControl(input('text'))).toBe(true);
    expect(isTypingControl(input('search'))).toBe(true);
    expect(isTypingControl(input('number'))).toBe(true);
    expect(isTypingControl(document.createElement('textarea'))).toBe(true);
    expect(isTypingControl(input('radio'))).toBe(false);
    expect(isTypingControl(input('checkbox'))).toBe(false);
    expect(isTypingControl(document.createElement('button'))).toBe(false);
    expect(isTypingControl(document.createElement('select'))).toBe(false);
    expect(isTypingControl(null)).toBe(false);
  });
});
