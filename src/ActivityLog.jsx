import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { useI18n } from "./i18n";
import { pickTranslation } from "./localize";

const formatDateTime = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const getEntryBarcode = (entry) =>
  entry?.data?.barcode || entry?.previous_data?.barcode || "";

const getEntryTags = (entry) =>
  entry?.data?.tags || entry?.previous_data?.tags || [];

export default function ActivityLog({ householdId }) {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const fetchLog = async () => {
      if (!householdId) return;
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("item_history")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        console.error(error);
        const message =
          error.code === "42P01"
            ? t("activity.not_setup")
            : t("activity.failed");
        setError(message);
        setEntries([]);
        setLoading(false);
        return;
      }

      const history = data || [];
      setEntries(history);

      const userIds = Array.from(
        new Set(history.map((entry) => entry.user_id).filter(Boolean))
      );

      if (userIds.length) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", userIds);

        if (!profileError && profileData) {
          const map = {};
          profileData.forEach((profile) => {
            map[profile.id] = profile.name || t("activity.member");
          });
          setProfiles(map);
        }
      }

      setLoading(false);
    };

    fetchLog();
  }, [householdId, t]);

  const actionLabels = useMemo(
    () => ({
      created: t("activity.action.added"),
      updated: t("activity.action.updated"),
      deleted: t("activity.action.deleted"),
    }),
    [t]
  );

  const getEntryName = (entry) => {
    const nameTranslations =
      entry?.data?.name_translations || entry?.previous_data?.name_translations;
    const fallback = entry?.data?.name || entry?.previous_data?.name || t("shopping.unnamed");
    return pickTranslation(nameTranslations, fallback, lang);
  };

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesAction =
        actionFilter === "all" || entry.action === actionFilter;
      const name = getEntryName(entry).toLowerCase();
      const barcode = getEntryBarcode(entry).toLowerCase();
      const matchesQuery =
        !query || name.includes(query.toLowerCase()) || barcode.includes(query.toLowerCase());
      return matchesAction && matchesQuery;
    });
  }, [entries, actionFilter, query]);

  if (loading) return <p>{t("activity.loading")}</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ width: "100%" }}>
      <div className="toolbar-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("activity.search_placeholder")}
        />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="all">{t("activity.all_actions")}</option>
          <option value="created">{t("activity.action.added")}</option>
          <option value="updated">{t("activity.action.updated")}</option>
          <option value="deleted">{t("activity.action.deleted")}</option>
        </select>
      </div>

      {filteredEntries.length === 0 ? (
        <p style={{ marginTop: "1rem" }}>{t("activity.none")}</p>
      ) : (
        <div
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          {filteredEntries.map((entry) => {
            const name = getEntryName(entry);
            const barcode = getEntryBarcode(entry);
            const tags = getEntryTags(entry);
            const userLabel = entry.user_id
              ? profiles[entry.user_id] || entry.user_id.slice(0, 8)
              : t("activity.system");
            return (
              <div
                key={entry.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  backgroundColor: "var(--surface)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                <strong>{actionLabels[entry.action] || entry.action}</strong>
                <span style={{ color: "var(--muted)" }}>{formatDateTime(entry.created_at)}</span>
                <span>{name}</span>
                {barcode && <span style={{ color: "var(--muted)" }}>{t("activity.barcode")}: {barcode}</span>}
                {tags?.length ? (
                  <span style={{ color: "var(--muted)" }}>
                    {t("activity.tags")}: {tags.join(", ")}
                  </span>
                ) : null}
                <span style={{ color: "var(--muted)" }}>{t("activity.by")}: {userLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
