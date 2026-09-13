export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  allMessageKeys,
  catalogFor,
  detectLocaleFromLocation,
  getLocale,
  isLocale,
  knowledgeGuideHref,
  knowledgeJourneysHref,
  knowledgeLearnHref,
  persistLocaleInUrl,
  setLocale,
  subscribeLocale,
  t,
  type Locale,
} from "./core.js";
export { LocaleProvider, LocaleSwitcher, useLocale } from "./LocaleProvider.js";
