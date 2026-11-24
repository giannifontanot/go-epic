import { TestBed } from '@angular/core/testing';
import { I18n, LABEL_KEYS, LANGS, LANG_CODES, inLang, isLang, labelFor, langFromBrowser, langInfo, nextLang, translate } from './i18n';

describe('I18n', () => {
  it('has every label in English and Spanish', () => {
    for (const key of LABEL_KEYS) {
      expect(labelFor(key, 'en'), key).toBeTruthy();
      expect(labelFor(key, 'es'), key).toBeTruthy();
    }
  });

  it('fills in parameters and switches language', () => {
    localStorage.removeItem('go-epic-lang');
    const i18n = TestBed.inject(I18n);
    i18n.lang.set('en');
    expect(i18n.t('week.free', { n: 15 })).toBe('15 min free');
    i18n.toggle();
    expect(i18n.lang()).toBe('es');
    expect(i18n.t('week.free', { n: 15 })).toBe('15 min libres');
    expect(localStorage.getItem('go-epic-lang')).toBe('es');
    localStorage.removeItem('go-epic-lang');
  });

  it('shows the key itself for an unknown label', () => {
    expect(TestBed.inject(I18n).t('nope.missing')).toBe('nope.missing');
  });

  it('lists each language once, named in its own words, with a locale', () => {
    expect(new Set(LANG_CODES).size).toBe(LANGS.length);
    expect(LANG_CODES).toContain('en');
    expect(LANG_CODES).toContain('es');
    for (const l of LANGS) {
      expect(l.name.trim(), l.code).not.toBe('');
      expect(() => new Intl.DateTimeFormat(l.locale), l.code).not.toThrow();
      expect(langInfo(l.code)).toBe(l);
    }
  });

  it('falls back to English, then Spanish, when a language has no translation yet', () => {
    expect(inLang({ en: 'one', es: 'uno' }, 'es')).toBe('uno');
    expect(inLang({ en: 'one' }, 'es')).toBe('one');
    expect(inLang({ es: 'uno' }, 'en')).toBe('uno');
    expect(inLang({}, 'en')).toBeUndefined();
    expect(translate('week.free', 'es')).toBe('{n} min libres');
    expect(translate('nope.missing', 'es')).toBe('nope.missing');
  });

  it('picks the browser language by its main code, English when the app does not have it', () => {
    expect(langFromBrowser(['es-MX'])).toBe('es');
    expect(langFromBrowser(['EN-gb'])).toBe('en');
    expect(langFromBrowser(['xx', 'es'])).toBe('es');
    expect(langFromBrowser(['xx'])).toBe('en');
    expect(langFromBrowser([])).toBe('en');
    expect(isLang('es')).toBe(true);
    expect(isLang('xx')).toBe(false);
    expect(isLang(null)).toBe(false);
  });

  it('steps through every language and back to the first', () => {
    let lang = LANG_CODES[0];
    const seen = [lang];
    for (let i = 1; i < LANG_CODES.length; i++) seen.push((lang = nextLang(lang)));
    expect(seen).toEqual([...LANG_CODES]);
    expect(nextLang(lang)).toBe(LANG_CODES[0]);
  });

  it('ignores an unknown language and keeps the saved one', () => {
    localStorage.removeItem('go-epic-lang');
    const i18n = TestBed.inject(I18n);
    i18n.setLang('es');
    i18n.setLang('xx' as never);
    expect(i18n.lang()).toBe('es');
    expect(i18n.locale()).toBe('es');
    localStorage.removeItem('go-epic-lang');
  });
});
