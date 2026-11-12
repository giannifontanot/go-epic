import { THEMES, THEME_BAR, manifestFor, parseTheme } from './theme';

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
});
