// src/InventoryView.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { DEFAULT_SECTIONS } from "./householdService";
import TagPicker from "./TagPicker";
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

export default function InventoryView({ user, householdId, sections = [], settings, tagRules = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [batchSection, setBatchSection] = useState("");
  const defaultAlertDays = settings?.alert_days ?? 7;
  const defaultLowStock = settings?.low_stock_threshold ?? 1;

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
      setError("Failed to load inventory.");
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
      setError("Failed to update item.");
      return;
    }

    setItems((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...updated } : item));
      saveCachedItems(householdId, next);
      return next;
    });
  };

  const saveEdit = async (item) => {
    const updates = {
      name: editValues.name.trim(),
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
      setError("Failed to delete items.");
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
      setError("CSV import requires an online connection.");
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
      setError("Failed to import CSV.");
      return;
    }

    setItems((prev) => {
      const next = [...(data || []), ...prev];
      saveCachedItems(householdId, next);
      return next;
    });
  };

  if (loading) return <p>Loading inventory...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <h2>Inventory</h2>
        <p>
          {expiredCount} expired, {expiringSoonCount} expiring soon (tag rules applied)
          {offline ? " — offline" : ""}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button onClick={() => setExpiryFilter("all")}>All</button>
          <button onClick={() => setExpiryFilter("expiring")}>Expiring Soon</button>
          <button onClick={() => setExpiryFilter("expired")}>Expired</button>
          <button onClick={exportCsv}>Export CSV</button>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={(e) => importCsv(e.target.files?.[0])}
            />
          </label>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, brand, barcode"
          />
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
            <option value="all">All sections</option>
            {sectionOptions.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="all">All states</option>
            <option value="unopened">Unopened</option>
            <option value="opened">Opened</option>
            <option value="nearing expiry">Nearing expiry</option>
            <option value="soon consumed">Soon consumed</option>
            <option value="none left">None left</option>
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="all">All tags</option>
            {tagsList.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <span>{selectedIds.length} selected</span>
          <button onClick={clearSelection}>Clear</button>
          <button onClick={() => handleBatchState("none left")}>Mark consumed</button>
          <select value={batchSection} onChange={(e) => setBatchSection(e.target.value)}>
            <option value="">Move to section</option>
            {sectionOptions.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
          <button onClick={handleBatchSection}>Apply</button>
          <button onClick={handleBatchDelete}>Delete</button>
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
          Select all
        </label>

        {filteredItems.length === 0 ? (
          <p>No items match your filters.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            {filteredItems.map((item) => {
              const isExpired = item.expiryDate && item.expiryDate < today;
              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    padding: "1rem",
                    backgroundColor: isExpired ? "#ffe6e6" : "#f9f9f9",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelect(item.id, item.pending)}
                      disabled={item.pending}
                    />
                    Select
                  </label>

                  {editingId === item.id ? (
                    <>
                      <input
                        value={editValues.name}
                        onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                        placeholder="Name"
                      />
                      <input
                        value={editValues.brand}
                        onChange={(e) => setEditValues({ ...editValues, brand: e.target.value })}
                        placeholder="Brand"
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
                        <option value="unopened">Unopened</option>
                        <option value="opened">Opened</option>
                        <option value="nearing expiry">Nearing expiry</option>
                        <option value="soon consumed">Soon consumed</option>
                        <option value="none left">None left</option>
                      </select>
                      <TagPicker
                        availableTags={tagsList}
                        selectedTags={editValues.tags || []}
                        onChange={(next) => setEditValues({ ...editValues, tags: next })}
                      />
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button onClick={() => saveEdit(item)}>Save</button>
                        <button onClick={cancelEdit}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name || "Item image"}
                          style={{
                            width: "100%",
                            aspectRatio: "4 / 3",
                            objectFit: "cover",
                            objectPosition: "center",
                            borderRadius: "12px",
                            backgroundColor: "#f3f4f6",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "4 / 3",
                            borderRadius: "12px",
                            backgroundColor: "#f3f4f6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#9ca3af",
                            fontWeight: 600,
                          }}
                        >
                          No image
                        </div>
                      )}
                      <h3 style={{ marginTop: "0.5rem" }}>{item.name}</h3>
                      <p><strong>Brand:</strong> {item.brand || "Unknown"}</p>
                      <p><strong>Nutri-Score:</strong> {item.nutriscore?.toUpperCase() || "N/A"}</p>
                      <p><strong>Expiry:</strong> {item.expiry_date || "-"}</p>
                      <p><strong>Section:</strong> {item.section || "Unassigned"}</p>
                      <p><strong>State:</strong> {item.state || "Unknown"}</p>
                      <p><strong>Tags:</strong> {(item.tags || []).join(", ") || "-"}</p>
                      {item.pending && <p style={{ color: "#cc8a2a" }}>Pending sync</p>}
                      <button onClick={() => startEdit(item)} disabled={item.pending}>
                        Quick edit
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
