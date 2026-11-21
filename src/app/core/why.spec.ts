import { WHY, WHY_SCREENS } from './why';

describe('Why texts', () => {
  it('has every screen in English and Spanish, with a lead and the same sections in both', () => {
    for (const screen of WHY_SCREENS) {
      for (const lang of ['en', 'es'] as const) {
        const text = WHY[screen][lang];
        expect(text.title, `${screen} ${lang}`).toBeTruthy();
        expect(text.orders, `${screen} ${lang}`).toBeTruthy();
        expect(text.lead.length, `${screen} ${lang}`).toBeGreaterThan(80);
        expect(text.sections.length, `${screen} ${lang}`).toBeGreaterThanOrEqual(3);
        for (const section of text.sections) {
          expect(section.heading, `${screen} ${lang}`).toBeTruthy();
          expect(section.body.length, `${screen} ${lang} ${section.heading}`).toBeGreaterThan(0);
          for (const p of section.body) expect(p.trim(), `${screen} ${lang} ${section.heading}`).toBeTruthy();
        }
      }
      expect(WHY[screen].en.sections.length, screen).toBe(WHY[screen].es.sections.length);
    }
  });
});
