import i18n from '../../src/utils/i18n';

describe('i18n instance', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('initializes with English and resolves a known key', () => {
    expect(i18n.t('setup.connect')).toBe('Connect');
  });

  it('switches to French when changeLanguage is called', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('setup.connect')).toBe('Se connecter');
  });

  it('interpolates variables', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('setup.errors.connect', { msg: 'timeout' })).toBe('Could not connect: timeout');
  });

  it('falls back to English for a missing key in another language', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('settings.about.name')).toBe('Nextcloud Calendar');
  });
});
