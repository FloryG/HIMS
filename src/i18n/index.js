import { createContext, useContext, useMemo, createElement } from "react";
import { translations } from "./translations";

const I18nContext = createContext({
  lang: "en",
  t: (key) => key,
});

const normalizeLang = (value) => (value || "en").split("-")[0].toLowerCase();

const format = (template, vars) =>
  template.replace(/\{(\w+)\}/g, (_match, key) =>
    Object.prototype.hasOwnProperty.call(vars || {}, key) ? vars[key] : ""
  );

export const getTranslator = (lang) => {
  const normalized = normalizeLang(lang);
  const table = translations[normalized] || translations.en;
  return (key, vars) => {
    const template = table[key] || translations.en[key] || key;
    return format(template, vars);
  };
};

export function I18nProvider({ lang = "en", children }) {
  const t = useMemo(() => getTranslator(lang), [lang]);
  return createElement(
    I18nContext.Provider,
    { value: { lang: normalizeLang(lang), t } },
    children
  );
}

export const useI18n = () => useContext(I18nContext);
export { normalizeLang };
