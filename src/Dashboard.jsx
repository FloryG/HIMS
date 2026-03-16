import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { loadCachedItems, saveCachedItems } from "./offlineQueue";

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

const DEFAULT_WIDGETS = [
  "total_items",
  "expiring_soon",
  "expired",
  "low_stock",
  "top_tags",
  "recent_items",
];

export default function Dashboard({ householdId, settings, tagRules = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleWidgets, setVisibleWidgets] = useState(() => {
    try {
      const stored = localStorage.getItem("dashboard_widgets_v1");
      return stored ? JSON.parse(stored) : DEFAULT_WIDGETS;
    } catch {
      return DEFAULT_WIDGETS;
    }
  });

  useEffect(() => {
    const fetchItems = async () => {
      if (!householdId) return;
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
        setError("Failed to load dashboard.");
      } else {
        setItems(data || []);
        saveCachedItems(householdId, data || []);
      }

      setLoading(false);
    };

    fetchItems();
  }, [householdId]);

  useEffect(() => {
    localStorage.setItem("dashboard_widgets_v1", JSON.stringify(visibleWidgets));
  }, [visibleWidgets]);

  const tagRuleMap = useMemo(() => {
    const map = new Map();
    tagRules.forEach((rule) => {
      if (rule?.tag) {
        map.set(normalizeTag(rule.tag), rule);
      }
    });
    return map;
  }, [tagRules]);

  const today = startOfToday();
  const defaultAlertDays = settings?.alert_days ?? 7;
  const defaultLowStock = settings?.low_stock_threshold ?? 1;

  const itemsWithMeta = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        expiryDate: parseLocalDate(item.expiry_date),
        alertDays: getAlertDaysForTags(item.tags, tagRuleMap, defaultAlertDays),
        lowStockThreshold: getLowStockForTags(item.tags, tagRuleMap, defaultLowStock),
      })),
    [items, tagRuleMap, defaultAlertDays, defaultLowStock]
  );

  const totalItems = itemsWithMeta.length;
  const expiredCount = itemsWithMeta.filter(
    (item) => item.expiryDate && item.expiryDate < today
  ).length;

  const expiringSoonCount = itemsWithMeta.filter((item) => {
    if (!item.expiryDate) return false;
    const diffDays = Math.ceil((item.expiryDate - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= item.alertDays;
  }).length;

  const lowStockCount = itemsWithMeta.filter((item) => {
    if (item.state === "none left") return true;
    return typeof item.quantity === "number" && item.quantity <= item.lowStockThreshold;
  }).length;

  const tagCounts = useMemo(() => {
    const counts = {};
    itemsWithMeta.forEach((item) => {
      (item.tags || []).forEach((tag) => {
        if (!tag) return;
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [itemsWithMeta]);

  const recentItems = itemsWithMeta.slice(0, 5);

  const widgetDefs = [
    {
      id: "total_items",
      label: "Total items",
      render: () => <strong style={{ fontSize: "2rem" }}>{totalItems}</strong>,
    },
    {
      id: "expiring_soon",
      label: "Expiring soon",
      render: () => <strong style={{ fontSize: "2rem" }}>{expiringSoonCount}</strong>,
    },
    {
      id: "expired",
      label: "Expired",
      render: () => <strong style={{ fontSize: "2rem" }}>{expiredCount}</strong>,
    },
    {
      id: "low_stock",
      label: "Low stock",
      render: () => <strong style={{ fontSize: "2rem" }}>{lowStockCount}</strong>,
    },
    {
      id: "top_tags",
      label: "Top tags",
      render: () =>
        tagCounts.length ? (
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {tagCounts.map(([tag, count]) => (
              <li key={tag}>
                {tag} ({count})
              </li>
            ))}
          </ul>
        ) : (
          <span style={{ color: "#6b7280" }}>No tags yet</span>
        ),
    },
    {
      id: "recent_items",
      label: "Recently added",
      render: () =>
        recentItems.length ? (
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {recentItems.map((item) => (
              <li key={item.id}>{item.name || "Unnamed item"}</li>
            ))}
          </ul>
        ) : (
          <span style={{ color: "#6b7280" }}>No items yet</span>
        ),
    },
  ];

  const toggleWidget = (id) => {
    setVisibleWidgets((prev) =>
      prev.includes(id) ? prev.filter((widget) => widget !== id) : [...prev, id]
    );
  };

  if (loading) return <p>Loading dashboard...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <h2>Dashboard</h2>
        <p style={{ margin: 0, color: "#6b7280" }}>
          Widgets use tag-based thresholds when available.
        </p>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <h3 style={{ marginBottom: "0.4rem" }}>Customize widgets</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {widgetDefs.map((widget) => (
            <label key={widget.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={visibleWidgets.includes(widget.id)}
                onChange={() => toggleWidget(widget.id)}
              />
              {widget.label}
            </label>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: "1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        {widgetDefs
          .filter((widget) => visibleWidgets.includes(widget.id))
          .map((widget) => (
            <div
              key={widget.id}
              style={{
                padding: "1rem",
                borderRadius: "16px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                boxShadow: "0 10px 20px rgba(15, 23, 42, 0.08)",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              <span style={{ fontWeight: 600, color: "#111827" }}>{widget.label}</span>
              {widget.render()}
            </div>
          ))}
      </div>
    </div>
  );
}
