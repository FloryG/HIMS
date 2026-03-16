// src/MyProfile.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function MyProfile({ user, settings }) {
  const [profile, setProfile] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [alertDays, setAlertDays] = useState(settings?.alert_days ?? 7);
  const [lowStockThreshold, setLowStockThreshold] = useState(settings?.low_stock_threshold ?? 1);
  const maxNameLength = 40;
  const normalizedName = (profile?.name || "").trim();
  const trimmedDraft = nameDraft.trim();
  const isDirty = trimmedDraft !== normalizedName;

  useEffect(() => {
    setAlertDays(settings?.alert_days ?? 7);
    setLowStockThreshold(settings?.low_stock_threshold ?? 1);
  }, [settings]);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, name")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          const { error: upsertError } = await supabase
            .from("profiles")
            .upsert([{ id: user.id, name: "" }]);

          if (upsertError) throw upsertError;

          setProfile({ id: user.id, name: "", email: user.email });
          setNameDraft("");
        } else {
          setProfile({ ...data, email: user.email });
          setNameDraft(data.name || "");
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
        setError("Failed to load profile. You may need to register first.");
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError("");
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .upsert([{ id: user.id, name: trimmedDraft }]);

    if (error) {
      console.error("Failed to update profile:", error);
      setError("Failed to update profile.");
    } else {
      setProfile((prev) => (prev ? { ...prev, name: trimmedDraft } : prev));
      setMessage("Profile updated.");
    }

    setSaving(false);
  };

  const handleSaveSettings = async () => {
    if (!user?.id) return;
    setMessage("");
    setError("");
    const { error } = await supabase.from("user_settings").upsert([
      {
        user_id: user.id,
        alert_days: Number(alertDays),
        low_stock_threshold: Number(lowStockThreshold),
      },
    ]);
    if (error) {
      setError("Failed to update settings.");
    } else {
      setMessage("Settings saved.");
    }
  };

  if (loading) return <p style={{ textAlign: "center", marginTop: "2rem" }}>Loading profile...</p>;
  if (!profile) return <p style={{ textAlign: "center", marginTop: "2rem" }}>No profile found.</p>;

  return (
    <div
      style={{
        maxWidth: "640px",
        margin: "2rem auto",
        padding: "1rem",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <h2 style={{ textAlign: "center", color: "#555" }}>Profile</h2>

      <div
        style={{
          backgroundColor: "#fef9f9",
          padding: "1rem",
          borderRadius: "15px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "0.9rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              backgroundColor: "#ffd1dc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {profile.name ? profile.name[0].toUpperCase() : "?"}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: "600", fontSize: "1.1rem", color: "#333" }}>
              {profile.name || "No Name"}
            </p>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>{user.email}</p>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#fff0f5",
            padding: "0.9rem",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <p style={{ margin: 0, fontWeight: "500", color: "#555" }}>Profile Name</p>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Enter your name"
            maxLength={maxNameLength}
            style={{
              padding: "0.6rem 0.7rem",
              borderRadius: "10px",
              border: "1px solid #e1cfd4",
              fontSize: "0.95rem",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#8a7a7f" }}>
            <span>Visible on shared inventories.</span>
            <span>{nameDraft.length}/{maxNameLength}</span>
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={saving || !isDirty}
            style={{
              padding: "0.6rem 0.9rem",
              borderRadius: "10px",
              border: "none",
              backgroundColor: saving || !isDirty ? "#ccc" : "#f28fb1",
              color: "#fff",
              fontWeight: "600",
              cursor: saving || !isDirty ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
          {isDirty && (
            <button
              onClick={() => setNameDraft(profile?.name || "")}
              style={{
                padding: "0.55rem 0.9rem",
                borderRadius: "10px",
                border: "1px solid #f2b4c9",
                backgroundColor: "#fff7fa",
                color: "#a25573",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#f0f8ff",
          padding: "1rem",
          borderRadius: "15px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: "0.8rem",
        }}
      >
        <h3 style={{ margin: 0 }}>Alerts & Stock Settings</h3>
        <p style={{ margin: 0, color: "#6b7280" }}>
          Default values apply when no tag-specific rule exists.
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          Alert days before expiry
          <input
            type="number"
            min={1}
            max={60}
            value={alertDays}
            onChange={(e) => setAlertDays(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: "10px", border: "1px solid #cbd5f5" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          Low stock threshold
          <input
            type="number"
            min={0}
            max={20}
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: "10px", border: "1px solid #cbd5f5" }}
          />
        </label>
        <button onClick={handleSaveSettings}>Save settings</button>
      </div>

      {message && <p style={{ margin: 0, color: "#2f8f83" }}>{message}</p>}
      {error && <p style={{ margin: 0, color: "#c6554f" }}>{error}</p>}
    </div>
  );
}
