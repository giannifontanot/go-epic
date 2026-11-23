import { BAR_VEIL, DARK_THEMES, LIGHT_THEMES, THEMES, THEME_BAR, manifestFor, parseTheme, shadeBar } from './theme';

describe('themes', () => {
  it('reads a stored theme, anything unknown being the Epic look', () => {
    expect(parseTheme('office')).toBe('office');
    expect(parseTheme('epic')).toBe('epic');
    expect(parseTheme('neon')).toBe('epic');
    expect(parseTheme(null)).toBe('epic');
  });

  it('gives every theme a browser bar colour', () => {
    for (const theme of THEMES) expect(THEME_BAR[theme]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('links each theme to its own manifest, Epic keeping the original', () => {
    expect(manifestFor('epic')).toBe('manifest.webmanifest');
    expect(manifestFor('office')).toBe('manifest-office.webmanifest');
    expect(new Set(THEMES.map(manifestFor)).size).toBe(THEMES.length);
  });

  it('splits the themes into five light and five dark, each once', () => {
    expect(LIGHT_THEMES.length).toBe(5);
    expect(DARK_THEMES.length).toBe(5);
    expect([...LIGHT_THEMES, ...DARK_THEMES].sort()).toEqual([...THEMES].sort());
  });

  it('darkens the top bar as the spotlight veil darkens the page', () => {
    expect(shadeBar('#101b42', 0)).toBe('#101b42');
    expect(shadeBar('#ffffff', BAR_VEIL)).toBe('#cccccc');
    expect(shadeBar('#fbeaf3', 1)).toBe('#000000');
    expect(shadeBar('#808080', -1)).toBe('#808080');
    for (const theme of THEMES) expect(shadeBar(THEME_BAR[theme], BAR_VEIL)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
