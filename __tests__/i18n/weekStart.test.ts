import { getInitialWeekStartsOn } from '@/utils/i18n';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(),
}));

const { getLocales } = jest.requireMock('expo-localization');

describe('getInitialWeekStartsOn', () => {
  it('returns Monday (1) for fr-FR', () => {
    getLocales.mockReturnValue([{ languageTag: 'fr-FR', regionCode: 'FR' }]);
    expect(getInitialWeekStartsOn()).toBe(1);
  });

  it('returns Sunday (0) for en-US', () => {
    getLocales.mockReturnValue([{ languageTag: 'en-US', regionCode: 'US' }]);
    expect(getInitialWeekStartsOn()).toBe(0);
  });

  it('returns Monday (1) for de-DE', () => {
    getLocales.mockReturnValue([{ languageTag: 'de-DE', regionCode: 'DE' }]);
    expect(getInitialWeekStartsOn()).toBe(1);
  });

  it('defaults to Sunday (0) for an unknown region', () => {
    getLocales.mockReturnValue([{ languageTag: 'en-XX' }]);
    expect(getInitialWeekStartsOn()).toBe(0);
  });
});
