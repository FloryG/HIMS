import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const ACTION_LABELS = {
  created: "Added",
  updated: "Updated",
  deleted: "Deleted",
};

const formatDateTime = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const getEntryName = (entry) =>
  entry?.data?.name || entry?.previous_data?.name || "Unnamed item";

const getEntryBarcode = (entry) =>
  entry?.data?.barcode || entry?.previous_data?.barcode || "";

const getEntryTags = (entry) =>
  entry?.data?.tags || entry?.previous_data?.tags || [];

export default function ActivityLog({ householdId }) {
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
            ? "Activity log is not set up yet. Run the latest supabase_migration.sql."
            : "Failed to load activity log.";
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
            map[profile.id] = profile.name || "Member";
          });
          setProfiles(map);
        }
      }

      setLoading(false);
    };

    fetchLog();
  }, [householdId]);

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

  if (loading) return <p>Loading activity...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search item name or barcode"
        />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="all">All actions</option>
          <option value="created">Added</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      {filteredEntries.length === 0 ? (
        <p style={{ marginTop: "1rem" }}>No activity yet.</p>
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
              : "System";
            return (
              <div
                key={entry.id}
                style={{
                  border: "1px solid #d9d9d9",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  backgroundColor: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                <strong>{ACTION_LABELS[entry.action] || entry.action}</strong>
                <span style={{ color: "#4b5563" }}>{formatDateTime(entry.created_at)}</span>
                <span>{name}</span>
                {barcode && <span style={{ color: "#6b7280" }}>Barcode: {barcode}</span>}
                {tags?.length ? (
                  <span style={{ color: "#6b7280" }}>
                    Tags: {tags.join(", ")}
                  </span>
                ) : null}
                <span style={{ color: "#6b7280" }}>By: {userLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
