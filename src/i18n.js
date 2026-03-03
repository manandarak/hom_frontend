import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// 1. Define your translations here
const resources = {
  en: {
    translation: {
      "Dashboard": "Dashboard",
      "Core Infrastructure": "Core Infrastructure",
      "Geo Master": "Geo Master",
      "Product Vault": "Product Vault",
      "Enterprise Gateway": "Enterprise Gateway"
      // Add more English text here...
    }
  },
  hi: {
    translation: {
      "Dashboard": "डैशबोर्ड",
      "Core Infrastructure": "मूल अवसंरचना",
      "Geo Master": "भू-मास्टर",
      "Product Vault": "उत्पाद वॉल्ट",
      "Enterprise Gateway": "एंटरप्राइज़ गेटवे"
      // Add more Hindi text here...
    }
  }
};

// 2. Read the saved language from local storage, default to 'en'
const savedLanguage = localStorage.getItem('app-language') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage, // use saved language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // react already protects from xss
    }
  });

export default i18n;