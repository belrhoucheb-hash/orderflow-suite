import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import nl from "./locales/nl.json";
import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";

const savedLanguage = typeof window !== "undefined"
  ? localStorage.getItem("language") || "nl"
  : "nl";

i18n.use(initReactI18next).init({
  resources: {
    nl: { translation: nl },
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
  },
  lng: savedLanguage,
  fallbackLng: "nl",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
