import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import 'dayjs/locale/fr';
import 'dayjs/locale/de';
import 'dayjs/locale/es';
import 'dayjs/locale/it';
import 'dayjs/locale/ru';
import 'dayjs/locale/nl';
import en from './locales/en.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import es from './locales/es.json';
import it from './locales/it.json';
import ru from './locales/ru.json';
import nl from './locales/nl.json';


i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
    es: { translation: es },
    it: { translation: it },
    ru: { translation: ru },
    nl: { translation: nl },
  },
  lng: 'en',
  fallbackLng: 'en',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

export default i18n;
