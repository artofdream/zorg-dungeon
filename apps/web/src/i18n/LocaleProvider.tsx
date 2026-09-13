import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  detectLocaleFromLocation,
  getLocale,
  persistLocaleInUrl,
  setLocale as setLocaleCore,
  subscribeLocale,
  t as tCore,
  type Locale,
} from "./core.js";
import type { MessageKey } from "../locales/en.js";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = detectLocaleFromLocation();
    setLocaleCore(initial);
    return initial;
  });

  useEffect(() => subscribeLocale(setLocaleState), []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleCore(next);
    persistLocaleInUrl(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => {
      void locale;
      return tCore(key, params);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback for tests / non-provider callers — sync with module locale.
    return {
      locale: getLocale(),
      setLocale: (next) => {
        setLocaleCore(next);
        persistLocaleInUrl(next);
      },
      t: tCore,
    };
  }
  return ctx;
}

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className={`locale-switcher ${className}`.trim()} role="group" aria-label={t("chrome.langSwitcher")}>
      <button
        type="button"
        className={locale === "en" ? "selected" : ""}
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        {t("chrome.langEn")}
      </button>
      <button
        type="button"
        className={locale === "fr" ? "selected" : ""}
        aria-pressed={locale === "fr"}
        onClick={() => setLocale("fr")}
      >
        {t("chrome.langFr")}
      </button>
    </div>
  );
}
