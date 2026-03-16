// src/InventoryView.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { DEFAULT_SECTIONS } from "./householdService";
import TagPicker from "./TagPicker";
import { useI18n } from "./i18n";
import { pickTranslation } from "./localize";
import {
  applyLocalMutation,
  enqueueAction,
  flushQueue,
  loadCachedItems,
  saveCachedItems,
} from "./offlineQueue";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const normalizeTag = (value) => (value || "").trim().toLowerCase();

const getAlertDaysForTags = (tags, tagRuleMap, fallbackDays) => {
  const values = (tags || [])
    .map((tag) => tagRuleMap.get(normalizeTag(tag))?.alert_days)
    .filter((value) => typeof value === "number");
  if (!values.length) return fallbackDays;
  return Math.min(...values);
};

const getLowStockForTags = (tags, tagRuleMap, fallbackThreshold) => {
  const values = (tags || [])
    .map((tag) => tagRuleMap.get(normalizeTag(tag))?.low_stock_threshold)
    .filter((value) => typeof value === "number");
  if (!values.length) return fallbackThreshold;
  return Math.max(...values);
};

export default function InventoryView({
  user,
  householdId,
  sections = [],
  settings,
  tagRules = [],
  onManageTags,
  uiPrefs,
}) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [batchSection, setBatchSection] = useState("");
  const defaultAlertDays = settings?.alert_days ?? 7;
  const defaultLowStock = settings?.low_stock_threshold ?? 1;
  const showImages = uiPrefs?.showImages !== false;
  const compactMode = Boolean(uiPrefs?.compactMode);
  const currentLang = uiPrefs?.language || lang || "en";

  const sectionOptions = sections.length
    ? sections.map((s) => s.name)
    : DEFAULT_SECTIONS;

  useEffect(() => {
    const handleOnline = async () => {
      setOffline(false);
      await flushQueue(supabase);
      fetchItems();
    };
    const handleOffline = () => setOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [householdId]);

  const fetchItems = async () => {
    if (!householdId) return;
    setLoading(true);
    setError("");

    if (!navigator.onLine) {
      const cached = loadCachedItems(householdId);
      setItems(cached);
      setLoading(false);
      return;
    }

    await flushQueue(supabase);

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError(t("inventory.failed"));
    } else {
      setItems(data || []);
      saveCachedItems(householdId, data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, [householdId]);

  const today = startOfToday();
  const tagRuleMap = useMemo(() => {
    const map = new Map();
    tagRules.forEach((rule) => {
      if (rule?.tag) {
        map.set(normalizeTag(rule.tag), rule);
      }
    });
    return map;
  }, [tagRules]);

  const itemsWithDates = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        expiryDate: parseLocalDate(item.expiry_date),
        alertDays: getAlertDaysForTags(item.tags, tagRuleMap, defaultAlertDays),
        lowStockThreshold: getLowStockForTags(item.tags, tagRuleMap, defaultLowStock),
      })),
    [items, tagRuleMap, defaultAlertDays, defaultLowStock]
  );

  const expiredCount = itemsWithDates.filter(
    (item) => item.expiryDate && item.expiryDate < today
  ).length;

  const expiringSoonCount = itemsWithDates.filter((item) => {
    if (!item.expiryDate) return false;
    const diffDays = Math.ceil((item.expiryDate - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= item.alertDays;
  }).length;

  const tagsList = Array.from(
    new Set([
      ...items.flatMap((item) => item.tags || []).filter(Boolean),
      ...tagRules.map((rule) => rule.tag).filter(Boolean),
    ])
  ).sort();

  const filteredItems = itemsWithDates.filter((item) => {
    const text = `${item.name || ""} ${item.brand || ""} ${item.barcode || ""}`
      .toLowerCase();
    const matchesQuery = !query || text.includes(query.toLowerCase());
    const matchesSection = sectionFilter === "all" || item.section === sectionFilter;
    const matchesState = stateFilter === "all" || item.state === stateFilter;
    const matchesTag =
      tagFilter === "all" || (item.tags || []).includes(tagFilter);

    let matchesExpiry = true;
    if (expiryFilter === "expired") {
      matchesExpiry = item.expiryDate && item.expiryDate < today;
    }
    if (expiryFilter === "expiring") {
      if (!item.expiryDate) {
        matchesExpiry = false;
      } else {
        const diffDays = Math.ceil((item.expiryDate - today) / (1000 * 60 * 60 * 24));
        matchesExpiry = diffDays >= 0 && diffDays <= item.alertDays;
      }
    }

    return matchesQuery && matchesSection && matchesState && matchesTag && matchesExpiry;
  });

  const toggleSelect = (id, pending) => {
    if (pending) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const selectable = filteredItems.filter((item) => !item.pending);
    if (selectedIds.length === selectable.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectable.map((item) => item.id));
    }
  };

  const clearSelection = () => setSelectedIds([]);

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValues({
      name: item.name || "",
      brand: item.brand || "",
      quantity: item.quantity ?? 1,
      expiry_date: item.expiry_date || "",
      section: item.section || sectionOptions[0] || "",
      state: item.state || "unopened",
      tags: item.tags || [],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const applyUpdate = async (id, updates) => {
    const updated = { ...updates, updated_at: new Date().toISOString() };

    if (!navigator.onLine) {
      enqueueAction({ type: "update_item", payload: { id, updates: updated, household_id: householdId } });
      setItems((prev) => {
        const next = applyLocalMutation(prev, {
          type: "update_item",
          payload: { id, updates: updated },
        });
        saveCachedItems(householdId, next);
        return next;
      });
      return;
    }

    const { error } = await supabase.from("items").update(updated).eq("id", id);
    if (error) {
      console.error(error);
      setError(t("inventory.update_failed"));
      return;
    }

    setItems((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...updated } : item));
      saveCachedItems(householdId, next);
      return next;
    });
  };

  const saveEdit = async (item) => {
    const trimmedName = editValues.name.trim();
    if (!trimmedName) {
      setError(t("scanner.name_required"));
      return;
    }
    const existingTranslations =
      item.name_translations && typeof item.name_translations === "object"
        ? item.name_translations
        : {};
    const nextTranslations = {
      ...existingTranslations,
      [currentLang]: trimmedName,
      original: existingTranslations.original || trimmedName,
    };
    const updates = {
      name: trimmedName,
      name_translations: nextTranslations,
      brand: editValues.brand.trim(),
      quantity: Number(editValues.quantity) || 1,
      expiry_date: editValues.expiry_date || null,
      section: editValues.section,
      state: editValues.state,
      tags: (editValues.tags || []).map(normalizeTag).filter(Boolean),
    };

    await applyUpdate(item.id, updates);

    if (item.barcode && navigator.onLine) {
      const { error } = await supabase
        .from("product_defaults")
        .upsert([
          {
            household_id: householdId,
            user_id: user.id,
            barcode: item.barcode,
            default_section: updates.section,
            default_tags: updates.tags,
            last_updated: new Date(),
          },
        ]);

      if (error) {
        console.error("Failed to update product_defaults:", error);
      }
    }
    cancelEdit();
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;

    if (!navigator.onLine) {
      enqueueAction({ type: "delete_items", payload: { ids: selectedIds, household_id: householdId } });
      setItems((prev) => {
        const next = applyLocalMutation(prev, {
          type: "delete_items",
          payload: { ids: selectedIds },
        });
        saveCachedItems(householdId, next);
        return next;
      });
      clearSelection();
      return;
    }

    const { error } = await supabase.from("items").delete().in("id", selectedIds);
    if (error) {
      console.error(error);
      setError(t("inventory.delete_failed"));
      return;
    }

    setItems((prev) => {
      const next = prev.filter((item) => !selectedIds.includes(item.id));
      saveCachedItems(householdId, next);
      return next;
    });
    clearSelection();
  };

  const handleBatchState = async (newState) => {
    if (!selectedIds.length) return;

    for (const id of selectedIds) {
      await applyUpdate(id, { state: newState });
    }
    clearSelection();
  };

  const handleBatchSection = async () => {
    if (!selectedIds.length || !batchSection) return;

    for (const id of selectedIds) {
      await applyUpdate(id, { section: batchSection });
    }
    setBatchSection("");
    clearSelection();
  };

  const exportCsv = () => {
    const headers = [
      "name",
      "brand",
      "barcode",
      "quantity",
      "expiry_date",
      "section",
      "state",
      "tags",
    ];
    const rows = items.map((item) => [
      item.name || "",
      item.brand || "",
      item.barcode || "",
      item.quantity ?? "",
      item.expiry_date || "",
      item.section || "",
      item.state || "",
      (item.tags || []).join("|"),
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file) => {
    if (!file || !navigator.onLine) {
      setError(t("inventory.import_requires_online"));
      return;
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return;

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => line.split(","));

    const mapped = rows.map((row) => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = row[index]?.trim();
      });
      return {
        household_id: householdId,
        user_id: user.id,
        name: entry.name,
        brand: entry.brand,
        barcode: entry.barcode || null,
        quantity: Number(entry.quantity) || 1,
        expiry_date: entry.expiry_date || null,
        section: entry.section || sectionOptions[0] || "",
        state: entry.state || "unopened",
        tags: entry.tags
          ? entry.tags.split("|").map((t) => normalizeTag(t)).filter(Boolean)
          : [],
      };
    });

    const { data, error } = await supabase.from("items").insert(mapped).select("*");
    if (error) {
      console.error(error);
      setError(t("inventory.import_failed"));
      return;
    }

    setItems((prev) => {
      const next = [...(data || []), ...prev];
      saveCachedItems(householdId, next);
      return next;
    });
  };

  if (loading) return <p>{t("inventory.loading")}</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <h2>{t("inventory.title")}</h2>
        <p>
          {t("inventory.expired_count", { count: expiredCount })},{" "}
          {t("inventory.expiring_count", { count: expiringSoonCount })}
          {offline ? ` — ${t("common.offline")}` : ""}
        </p>
        <div className="filters-toggle-row">
          <button className="pill-btn" onClick={() => setFiltersOpen((prev) => !prev)}>
            {filtersOpen ? t("inventory.hide_filters") : t("inventory.filters")}
          </button>
        </div>

        <div className={`filters-panel ${filtersOpen ? "open" : ""}`}>
          <div className="toolbar-row">
            <button
              className={`pill-btn ${expiryFilter === "all" ? "active" : ""}`}
              onClick={() => setExpiryFilter("all")}
            >
              {t("common.all")}
            </button>
            <button
              className={`pill-btn ${expiryFilter === "expiring" ? "active" : ""}`}
              onClick={() => setExpiryFilter("expiring")}
            >
              {t("inventory.expiring_soon")}
            </button>
            <button
              className={`pill-btn ${expiryFilter === "expired" ? "active" : ""}`}
              onClick={() => setExpiryFilter("expired")}
            >
              {t("inventory.expired")}
            </button>
            <button className="pill-btn" onClick={exportCsv}>{t("inventory.export_csv")}</button>
            <label className="pill-btn file-pill">
              {t("inventory.import_csv")}
              <input
                type="file"
                accept=".csv"
                onChange={(e) => importCsv(e.target.files?.[0])}
              />
            </label>
          </div>

          <div className="toolbar-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("inventory.search_placeholder")}
            />
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
              <option value="all">{t("inventory.all_sections")}</option>
              {sectionOptions.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="all">{t("inventory.all_states")}</option>
              <option value="unopened">{t("state.unopened")}</option>
              <option value="opened">{t("state.opened")}</option>
              <option value="nearing expiry">{t("state.nearing_expiry")}</option>
              <option value="soon consumed">{t("state.soon_consumed")}</option>
              <option value="none left">{t("state.none_left")}</option>
            </select>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="all">{t("inventory.all_tags")}</option>
              {tagsList.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="toolbar-row" style={{ marginTop: "1rem" }}>
          <span>{t("inventory.selected", { count: selectedIds.length })}</span>
          <button className="pill-btn" onClick={clearSelection}>{t("common.clear")}</button>
          <button className="pill-btn" onClick={() => handleBatchState("none left")}>
            {t("inventory.mark_consumed")}
          </button>
          <select value={batchSection} onChange={(e) => setBatchSection(e.target.value)}>
            <option value="">{t("inventory.move_section")}</option>
            {sectionOptions.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
          <button className="pill-btn" onClick={handleBatchSection}>{t("common.apply")}</button>
          <button className="pill-btn danger" onClick={handleBatchDelete}>{t("common.delete")}</button>
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <input
            type="checkbox"
            checked={
              filteredItems.filter((item) => !item.pending).length > 0 &&
              selectedIds.length === filteredItems.filter((item) => !item.pending).length
            }
            onChange={toggleSelectAll}
          />
          {t("inventory.select_all")}
        </label>

        {filteredItems.length === 0 ? (
          <p>{t("inventory.no_match")}</p>
        ) : (
          <div
            className={`inventory-grid${compactMode ? " compact" : ""}`}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: compactMode ? "0.7rem" : "1rem",
              marginTop: "1rem",
            }}
          >
            {filteredItems.map((item) => {
              const isExpired = item.expiryDate && item.expiryDate < today;
              const displayName =
                pickTranslation(item.name_translations, item.name, currentLang) ||
                t("shopping.unnamed");
              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: compactMode ? "0.75rem" : "1rem",
                    backgroundColor: isExpired ? "var(--danger-bg)" : "var(--surface-2)",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelect(item.id, item.pending)}
                      disabled={item.pending}
                    />
                    {t("inventory.select")}
                  </label>

                  {editingId === item.id ? (
                    <>
                      <input
                        value={editValues.name}
                        onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                        placeholder={t("scanner.name")}
                      />
                      <input
                        value={editValues.brand}
                        onChange={(e) => setEditValues({ ...editValues, brand: e.target.value })}
                        placeholder={t("scanner.brand")}
                      />
                      <input
                        type="number"
                        value={editValues.quantity}
                        min={1}
                        onChange={(e) => setEditValues({ ...editValues, quantity: e.target.value })}
                      />
                      <input
                        type="date"
                        value={editValues.expiry_date}
                        onChange={(e) => setEditValues({ ...editValues, expiry_date: e.target.value })}
                      />
                      <select
                        value={editValues.section}
                        onChange={(e) => setEditValues({ ...editValues, section: e.target.value })}
                      >
                        {sectionOptions.map((section) => (
                          <option key={section} value={section}>
                            {section}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editValues.state}
                        onChange={(e) => setEditValues({ ...editValues, state: e.target.value })}
                      >
                        <option value="unopened">{t("state.unopened")}</option>
                        <option value="opened">{t("state.opened")}</option>
                        <option value="nearing expiry">{t("state.nearing_expiry")}</option>
                        <option value="soon consumed">{t("state.soon_consumed")}</option>
                        <option value="none left">{t("state.none_left")}</option>
                      </select>
                      <TagPicker
                        availableTags={tagsList}
                        selectedTags={editValues.tags || []}
                        onChange={(next) => setEditValues({ ...editValues, tags: next })}
                        onManageTags={onManageTags}
                      />
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button className="pill-btn accent" onClick={() => saveEdit(item)}>
                          {t("common.save")}
                        </button>
                        <button className="pill-btn" onClick={cancelEdit}>
                          {t("common.cancel")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {showImages && (
                        item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={displayName || t("inventory.no_image")}
                            style={{
                              width: "100%",
                              aspectRatio: "4 / 3",
                              objectFit: "contain",
                              objectPosition: "center",
                              borderRadius: "12px",
                              backgroundColor: "var(--surface-2)",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              aspectRatio: "4 / 3",
                              borderRadius: "12px",
                              backgroundColor: "var(--surface-2)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--muted)",
                              fontWeight: 600,
                            }}
                          >
                            {t("inventory.no_image")}
                          </div>
                        )
                      )}
                      <h3 style={{ marginTop: showImages ? "0.5rem" : "0" }}>
                        {displayName}
                      </h3>
                      <p><strong>{t("scanner.brand")}:</strong> {item.brand || t("inventory.unknown")}</p>
                      <p><strong>{t("scanner.nutriscore")}:</strong> {item.nutriscore?.toUpperCase() || "N/A"}</p>
                      <p><strong>{t("scanner.expiry")}:</strong> {item.expiry_date || "-"}</p>
                      <p><strong>{t("scanner.section")}:</strong> {item.section || t("inventory.unassigned")}</p>
                      <p>
                        <strong>{t("scanner.state")}:</strong>{" "}
                        {item.state ? (
                          item.state === "unopened" ? t("state.unopened")
                          : item.state === "opened" ? t("state.opened")
                          : item.state === "nearing expiry" ? t("state.nearing_expiry")
                          : item.state === "soon consumed" ? t("state.soon_consumed")
                          : item.state === "none left" ? t("state.none_left")
                          : item.state
                        ) : t("inventory.unknown")}
                      </p>
                      <p><strong>{t("scanner.tags")}:</strong> {(item.tags || []).join(", ") || "-"}</p>
                      {item.pending && <p style={{ color: "var(--accent)" }}>{t("inventory.pending")}</p>}
                      <button className="pill-btn" onClick={() => startEdit(item)} disabled={item.pending}>
                        {t("inventory.quick_edit")}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
