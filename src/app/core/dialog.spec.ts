import { isTypingControl, mirrored, returnPoint } from './dialog';

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

describe('closing back into its opener', () => {
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  it('goes back to the same spot on the opener where it is now, not where it was', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    el.getBoundingClientRect = () => rect(40, 300, 100, 40);                  // the page moved up by 200 px meanwhile
    expect(returnPoint({ point: { x: 60, y: 520 }, el, dx: 20, dy: 20 })).toEqual({ x: 60, y: 320 });
    el.remove();
  });
  it('falls back to the first point when the opener is gone or hidden', () => {
    const el = document.createElement('button');
    expect(returnPoint({ point: { x: 5, y: 6 }, el, dx: 1, dy: 1 })).toEqual({ x: 5, y: 6 });
    document.body.appendChild(el);
    el.getBoundingClientRect = () => rect(0, 0, 0, 0);
    expect(returnPoint({ point: { x: 5, y: 6 }, el, dx: 1, dy: 1 })).toEqual({ x: 5, y: 6 });
    el.remove();
    expect(returnPoint({ point: { x: 7, y: 8 }, el: null, dx: 0, dy: 0 })).toEqual({ x: 7, y: 8 });
  });
});
