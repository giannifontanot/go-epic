import { mirrored } from './dialog';

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
