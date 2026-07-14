import { getLocales } from 'expo-localization';

export const LANGUAGES = [
  { code: 'en', label: 'English', region: 'GB' },
  { code: 'fr', label: 'Français', region: 'FR' },
  { code: 'de', label: 'Deutsch', region: 'DE' },
  { code: 'es', label: 'Español', region: 'ES' },
  { code: 'ru', label: 'Русский', region: 'RU' },
  { code: 'it', label: 'Italiano', region: 'IT' },
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
