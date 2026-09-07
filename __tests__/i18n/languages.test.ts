import {LANGUAGES, SUPPORTED, isSupported, getInitialLanguage} from '../../src/utils/i18n';

const mockGetLocales = jest.fn();
jest.mock('expo-localization', () => ({
    getLocales: () => mockGetLocales(),
}));

describe('languages catalog', () => {
    it('exposes the eight supported codes', () => {
        expect(SUPPORTED).toEqual(['en', 'fr', 'de', 'es', 'ru', 'it', 'pt', 'nl', 'oc']);
        expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'fr', 'de', 'es', 'ru', 'it', 'pt', 'nl', 'oc']);
    });

    it('every language has a non-empty native label', () => {
        for (const l of LANGUAGES) expect(l.label.length).toBeGreaterThan(0);
    });

    it('isSupported guards unknown and empty codes', () => {
        expect(isSupported('fr')).toBe(true);
        expect(isSupported('pt')).toBe(true);
        expect(isSupported('zz')).toBe(false);
        expect(isSupported(null)).toBe(false);
        expect(isSupported(undefined)).toBe(false);
    });

    it('getInitialLanguage returns the device locale when supported', () => {
        mockGetLocales.mockReturnValue([{languageCode: 'de'}]);
        expect(getInitialLanguage()).toBe('de');
    });

    it('getInitialLanguage falls back to en for unsupported locales', () => {
        mockGetLocales.mockReturnValue([{languageCode: 'zz'}]);
        expect(getInitialLanguage()).toBe('en');
    });

    it('getInitialLanguage falls back to en when no locale is reported', () => {
        mockGetLocales.mockReturnValue([]);
        expect(getInitialLanguage()).toBe('en');
    });
});
