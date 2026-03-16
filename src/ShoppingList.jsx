import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { loadCachedItems, saveCachedItems } from "./offlineQueue";
import { useI18n } from "./i18n";
import { pickTranslation } from "./localize";

const normalizeTag = (value) => (value || "").trim().toLowerCase();

const getLowStockForTags = (tags, tagRuleMap, fallbackThreshold) => {
  const values = (tags || [])
    .map((tag) => tagRuleMap.get(normalizeTag(tag))?.low_stock_threshold)
    .filter((value) => typeof value === "number");
  if (!values.length) return fallbackThreshold;
  return Math.max(...values);
};

export default function ShoppingList({ householdId, settings, tagRules = [] }) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const currentLang = lang || "en";

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      setError("");

      if (!navigator.onLine) {
        setItems(loadCachedItems(householdId));
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setError(t("shopping.failed"));
      } else {
        setItems(data || []);
        saveCachedItems(householdId, data || []);
      }

      setLoading(false);
    };

    if (householdId) {
      fetchItems();
    }
  }, [householdId, t]);

  const threshold = settings?.low_stock_threshold ?? 1;
  const tagRuleMap = new Map(
    tagRules
      .filter((rule) => rule?.tag)
      .map((rule) => [normalizeTag(rule.tag), rule])
  );
  const listItems = items.filter((item) => {
    const isEmpty = item.state === "none left";
    const itemThreshold = getLowStockForTags(item.tags, tagRuleMap, threshold);
    const isLow = typeof item.quantity === "number" && item.quantity <= itemThreshold;
    return isEmpty || isLow;
  });

  const handleCopy = () => {
    const lines = listItems.map((item) => {
      const name = pickTranslation(item.name_translations, item.name, currentLang) || t("shopping.unnamed");
      return `- ${name}`;
    });
    navigator.clipboard?.writeText(lines.join("\n"));
  };

  if (loading) return <p>{t("shopping.loading")}</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>{t("shopping.title")}</h2>
        <button className="pill-btn" onClick={handleCopy}>{t("shopping.copy")}</button>
      </div>
      <p style={{ marginTop: "0.25rem" }}>
        {t("shopping.below_threshold", { count: listItems.length })}
        {offline ? ` (${t("common.offline")})` : ""}
      </p>
      {listItems.length === 0 ? (
        <p>{t("shopping.none")}</p>
      ) : (
        <ul>
          {listItems.map((item) => (
            <li key={item.id}>
              {pickTranslation(item.name_translations, item.name, currentLang) || t("shopping.unnamed")} — {item.quantity ?? "?"} ({item.section || t("inventory.unassigned")})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
