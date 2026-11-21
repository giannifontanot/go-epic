import { COLOR_CHOICES } from './week.model';
import { THEMES } from './theme';
import { PALETTES, SLOTS, defaultPalette, edgeFor, paletteById, paletteFor, paletteLook, parseEdgeChoices, parsePaletteChoices, slotColors } from './palette.model';

describe('palettes', () => {
  it('gives every theme its own palette as the default', () => {
    for (const theme of THEMES) expect(paletteById(defaultPalette(theme))).toBeTruthy();
    expect(paletteFor('epic', {}).colors).toEqual(COLOR_CHOICES.map((c) => c.color));
  });

  it('has unique ids and #rrggbb colours', () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    for (const p of PALETTES) for (const c of p.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('fills the 8 slots, a 7-colour palette going round', () => {
    const neon = paletteById('neon')!;
    const slots = slotColors(neon);
    expect(slots.length).toBe(SLOTS);
    expect(slots[7]).toBe(neon.colors[0]);
    expect(slotColors(paletteById('pinkpop')!)).toEqual(paletteById('pinkpop')!.colors);
  });

  it('changes nothing until a palette is picked', () => {
    expect(paletteLook('petalpunk', {}, {})).toEqual({ slots: null, edge: false, autoInk: false });
    expect(paletteLook('goepiclight', {}, {})).toEqual({ slots: null, edge: true, autoInk: false });
  });

  it('sets the picked colours and works out the ink of filled cards', () => {
    const look = paletteLook('petalpunk', { petalpunk: 'sunrise' }, {});
    expect(look.slots?.[0]).toBe('#ea580c');
    expect(look.autoInk).toBe(true);
    expect(paletteLook('petalpunk', { petalpunk: 'sunrise' }, { petalpunk: true })).toMatchObject({ edge: true, autoInk: false });
    expect(paletteLook('goepicdark', {}, { goepicdark: false })).toEqual({ slots: null, edge: false, autoInk: true });
  });

  it('reads stored choices, dropping anything unknown', () => {
    expect(parsePaletteChoices({ epic: 'neon', office: 'nope', moon: 'neon' })).toEqual({ epic: 'neon' });
    expect(parsePaletteChoices('x')).toEqual({});
    expect(parseEdgeChoices({ epic: true, office: 'yes' })).toEqual({ epic: true });
    expect(edgeFor('goepicdark', {})).toBe(true);
    expect(edgeFor('epic', {})).toBe(false);
  });
});

describe('palette names', () => {
  it('names every palette in both languages', async () => {
    const { LABEL_KEYS } = await import('./i18n');
    for (const p of PALETTES) expect(LABEL_KEYS).toContain(`palette.${p.id}`);
  });
});
