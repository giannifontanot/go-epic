import { TestBed } from '@angular/core/testing';
import { I18n, LABEL_KEYS, labelFor } from './i18n';

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
});
