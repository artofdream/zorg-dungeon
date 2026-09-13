/** Tiny i18n core — catalogs + t() (ADR-0007). No React Router. */
import { en, type MessageKey, type Messages } from "../locales/en.js";
import { fr } from "../locales/fr.js";

export type Locale = "en" | "fr";

export const LOCALES: readonly Locale[] = ["en", "fr"] as const;
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "zorg-locale";

const catalogs: Record<Locale, Messages> = { en, fr };

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (current === locale) return;
  current = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore quota / private mode */
    }
  }
  for (const fn of listeners) fn(locale);
}

export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "fr";
}

/**
 * Canonical URL strategy (no router): `?lang=fr` | `?lang=en`.
 * Also accepts legacy `localStorage` and optional path prefix `/fr` if present.
 */
export function detectLocaleFromLocation(
  search = typeof window !== "undefined" ? window.location.search : "",
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  stored: string | null = typeof localStorage !== "undefined"
    ? (() => {
        try {
          return localStorage.getItem(LOCALE_STORAGE_KEY);
        } catch {
          return null;
        }
      })()
    : null,
): Locale {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const fromQuery = params.get("lang");
  if (isLocale(fromQuery)) return fromQuery;
  if (pathname === "/fr" || pathname.startsWith("/fr/") || pathname.startsWith("/fr?")) {
    return "fr";
  }
  if (isLocale(stored)) return stored;
  return DEFAULT_LOCALE;
}

/** Write `?lang=` into the current URL without a full navigation (history.replaceState). */
export function persistLocaleInUrl(locale: Locale): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  if (locale === DEFAULT_LOCALE) {
    url.searchParams.delete("lang");
  } else {
    url.searchParams.set("lang", locale);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const catalog = catalogs[current] ?? en;
  let text: string = catalog[key] ?? en[key] ?? String(key);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{{${name}}}`).join(String(value));
    }
  }
  return text;
}

export function catalogFor(locale: Locale): Messages {
  return catalogs[locale];
}

export function allMessageKeys(): MessageKey[] {
  return Object.keys(en) as MessageKey[];
}

/** Kid knowledge learn URL for the active locale. */
export function knowledgeLearnHref(locale: Locale = current): string {
  if (locale === "fr") return "https://knowledge.zorg.artof.link/fr/learn.html";
  return "https://knowledge.zorg.artof.link/learn.html";
}

export function knowledgeGuideHref(locale: Locale = current): string {
  if (locale === "fr") return "https://knowledge.zorg.artof.link/fr/guide.html";
  return "https://knowledge.zorg.artof.link/guide.html";
}

export function knowledgeJourneysHref(locale: Locale = current): string {
  if (locale === "fr") return "https://knowledge.zorg.artof.link/fr/journeys.html";
  return "https://knowledge.zorg.artof.link/journeys.html";
}
