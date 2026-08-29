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
import 'dayjs/locale/oc-lnc';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import it from '@/locales/it.json';
import ru from '@/locales/ru.json';
import pt from '@/locales/pt.json';
import nl from '@/locales/nl.json';
import oc from '@/locales/oc.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', region: 'GB' },
  { code: 'fr', label: 'Français', region: 'FR' },
  { code: 'de', label: 'Deutsch', region: 'DE' },
  { code: 'es', label: 'Español', region: 'ES' },
  { code: 'ru', label: 'Русский', region: 'RU' },
  { code: 'it', label: 'Italiano', region: 'IT' },
  { code: 'pt', label: 'Português', region: 'PT' },
  { code: 'nl', label: 'Nederlands', region: 'NL' },
  { code: 'oc', label: 'Occitan', region: 'FR' },
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

const MONDAY_START_REGIONS = new Set([
  // Europe
  'AD', 'AL', 'AT', 'AX', 'BA', 'BE', 'BG', 'BO', 'BR', 'BY', 'CH', 'CL', 'CN', 'CO', 'CR', 'CZ', 'DE',
  'DK', 'EC', 'EE', 'EG', 'ES', 'FI', 'FO', 'FR', 'GB', 'GE', 'GG', 'GI', 'GR', 'GT', 'HK', 'HN', 'HR',
  'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IS', 'IT', 'JE', 'KG', 'KR', 'KZ', 'LB', 'LI', 'LT', 'LU', 'LV',
  'MA', 'MC', 'MD', 'ME', 'MK', 'MT', 'MX', 'MY', 'NG', 'NI', 'NL', 'NO', 'NZ', 'PA', 'PE', 'PH', 'PK',
  'PL', 'PT', 'PY', 'RO', 'RS', 'RU', 'SA', 'SE', 'SG', 'SI', 'SK', 'SM', 'SV', 'TH', 'TJ', 'TM', 'TR',
  'TW', 'UA', 'UY', 'UZ', 'VA', 'VE', 'VN', 'XK', 'ZA',
]);

const SUNDAY_START_REGIONS = new Set([
  'AE', 'AF', 'BH', 'DJ', 'DZ', 'IQ', 'IR', 'JO', 'KW', 'LY', 'OM', 'QA', 'SD', 'SS', 'SY', 'US', 'YE',
]);

function getFirstDayOfWeek(languageTag: string, regionCode?: string | null): number {
  if (regionCode) {
    const region = regionCode.toUpperCase();
    if (MONDAY_START_REGIONS.has(region)) return 1;
    if (SUNDAY_START_REGIONS.has(region)) return 0;
  }

  const lang = languageTag.split('-')[0].toLowerCase();
  const mondayLangs = new Set([
    'fr', 'de', 'it', 'es', 'ru', 'pt', 'nl', 'pl', 'cs', 'sk', 'sl', 'hr', 'sr', 'bg', 'ro', 'el',
    'da', 'sv', 'no', 'fi', 'is', 'hu', 'lt', 'lv', 'et', 'ca', 'eu', 'gl', 'oc', 'sq', 'mk', 'be',
    'uk', 'ka', 'hy', 'he', 'hi', 'bn', 'ta', 'te', 'ml', 'kn', 'mr', 'ur', 'pa', 'gu', 'or', 'as',
    'ne', 'si', 'km', 'lo', 'my', 'th', 'vi', 'id', 'ms', 'tl', 'sw', 'am', 'so', 'sn', 'st', 'zu',
    'af', 'sq', 'ar', 'fa',
  ]);
  return mondayLangs.has(lang) ? 1 : 0;
}

export function getInitialWeekStartsOn(): 0 | 1 {
  const locale = getLocales()[0];
  const firstDay = getFirstDayOfWeek(locale?.languageTag ?? 'en-US', locale?.regionCode);
  return firstDay === 0 ? 0 : 1;
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
    oc: { translation: oc },    
  },
  lng: 'en',
  fallbackLng: 'en',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

export default i18n;
