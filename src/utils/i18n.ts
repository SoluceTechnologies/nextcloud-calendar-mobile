import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import 'dayjs/locale/fr';
import 'dayjs/locale/de';
import 'dayjs/locale/es';
import 'dayjs/locale/it';
import 'dayjs/locale/ru';
import 'dayjs/locale/pt';
import 'dayjs/locale/nl';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import it from '@/locales/it.json';
import ru from '@/locales/ru.json';
import pt from '@/locales/pt.json';
import nl from '@/locales/nl.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', region: 'GB' },
  { code: 'fr', label: 'Français', region: 'FR' },
  { code: 'de', label: 'Deutsch', region: 'DE' },
  { code: 'es', label: 'Español', region: 'ES' },
  { code: 'ru', label: 'Русский', region: 'RU' },
  { code: 'it', label: 'Italiano', region: 'IT' },
  { code: 'pt', label: 'Português', region: 'PT' },
  { code: 'nl', label: 'Nederlands', region: 'NL' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['code'];

export const SUPPORTED: AppLanguage[] = LANGUAGES.map((l) => l.code);

export function isSupported(code: string | null | undefined): code is AppLanguage {
  return !!code && (SUPPORTED as string[]).includes(code);
}

export function getInitialLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode ?? undefined;
  return isSupported(code) ? code : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
    es: { translation: es },
    it: { translation: it },
    ru: { translation: ru },
    pt: { translation: pt },
    nl: { translation: nl },
  },
  lng: 'en',
  fallbackLng: 'en',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

export default i18n;
