import { normalizeLang } from "./i18n";

export const pickTranslation = (translations, fallback, lang) => {
  if (!translations || typeof translations !== "object") {
    return fallback || "";
  }
  const code = normalizeLang(lang);
  return (
    translations[code] || translations.en || translations.original || fallback || ""
  );
};

export const buildNameTranslations = (product) => {
  if (!product) return null;
  const map = {};
  if (product.product_name) map.original = product.product_name;
  if (product.product_name_en) map.en = product.product_name_en;
  if (product.product_name_es) map.es = product.product_name_es;
  if (product.product_name_de) map.de = product.product_name_de;
  if (product.product_name_hu) map.hu = product.product_name_hu;
  if (!map.en && product.product_name) map.en = product.product_name;
  return Object.keys(map).length ? map : null;
};
