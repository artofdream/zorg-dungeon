import { useLocale } from "./i18n/index.js";

/** Visually hidden until focused — keyboard / a11y skip into main landmark. */
export function SkipToContent() {
  const { t } = useLocale();
  return (
    <a className="skip-link" href="#main-content">
      {t("chrome.skipToContent")}
    </a>
  );
}
