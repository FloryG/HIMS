import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useI18n } from "./i18n";
import "./MyProfile.css";

const DEFAULT_PREFS = {
  defaultScanMode: "manual",
  continuousScan: false,
  compactMode: false,
  showImages: true,
  theme: "light",
  language: "en",
};

const normalizePrefs = (prefs = {}) => ({
  defaultScanMode: prefs.defaultScanMode || DEFAULT_PREFS.defaultScanMode,
  continuousScan: Boolean(prefs.continuousScan),
  compactMode: Boolean(prefs.compactMode),
  showImages: prefs.showImages !== false,
  theme: prefs.theme || DEFAULT_PREFS.theme,
  language: prefs.language || DEFAULT_PREFS.language,
});

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "hu", label: "Magyar" },
];

export default function MyProfile({
  user,
  settings,
  household,
  households = [],
  uiPrefs,
  onUpdatePrefs,
}) {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [alertDays, setAlertDays] = useState(settings?.alert_days ?? 7);
  const [lowStockThreshold, setLowStockThreshold] = useState(settings?.low_stock_threshold ?? 1);
  const [prefs, setPrefs] = useState(normalizePrefs(uiPrefs));
  const maxNameLength = 40;
  const normalizedName = (profile?.name || "").trim();
  const trimmedDraft = nameDraft.trim();
  const isDirty = trimmedDraft !== normalizedName;
  const settingsDirty =
    Number(alertDays) !== (settings?.alert_days ?? 7) ||
    Number(lowStockThreshold) !== (settings?.low_stock_threshold ?? 1);
  const prefDirty = JSON.stringify(prefs) !== JSON.stringify(normalizePrefs(uiPrefs));

  useEffect(() => {
    setAlertDays(settings?.alert_days ?? 7);
    setLowStockThreshold(settings?.low_stock_threshold ?? 1);
  }, [settings]);

  useEffect(() => {
    setPrefs(normalizePrefs(uiPrefs));
  }, [uiPrefs]);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select("id, name")
          .eq("id", user.id)
          .maybeSingle();

        if (fetchError) throw fetchError;

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
        setError(t("profile.profile_failed"));
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [user, t]);

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase
      .from("profiles")
      .upsert([{ id: user.id, name: trimmedDraft }]);

    if (updateError) {
      console.error("Failed to update profile:", updateError);
      setError(t("profile.profile_failed"));
    } else {
      setProfile((prev) => (prev ? { ...prev, name: trimmedDraft } : prev));
      setMessage(t("profile.profile_updated"));
    }

    setSaving(false);
  };

  const handleSaveSettings = async () => {
    if (!user?.id) return;
    setMessage("");
    setError("");
    const { error: settingsError } = await supabase.from("user_settings").upsert([
      {
        user_id: user.id,
        alert_days: Number(alertDays),
        low_stock_threshold: Number(lowStockThreshold),
      },
    ]);
    if (settingsError) {
      setError(t("profile.settings_failed"));
    } else {
      setMessage(t("profile.settings_saved"));
    }
  };

  const handleSavePrefs = () => {
    onUpdatePrefs?.(prefs);
    setMessage(t("profile.prefs_saved"));
  };

  const handleResetPrefs = () => {
    setPrefs(DEFAULT_PREFS);
    onUpdatePrefs?.(DEFAULT_PREFS);
    setMessage(t("profile.prefs_reset"));
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard?.writeText(user.id);
      setMessage(t("profile.copy_success"));
    } catch (err) {
      console.error(err);
      setError(t("profile.copy_failed"));
    }
  };

  const membershipNames = households
    .map((membership) => membership.households?.name)
    .filter(Boolean);

  if (loading) return <p className="profile-loading">{t("common.loading")}</p>;
  if (!profile) return <p className="profile-loading">{t("profile.profile_failed")}</p>;

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div>
          <h2>{t("profile.title")}</h2>
          <p className="profile-muted">{t("profile.subtitle")}</p>
        </div>
        <button className="pill-btn" onClick={() => supabase.auth.signOut()}>
          {t("profile.sign_out")}
        </button>
      </div>

      <div className="profile-grid">
        <div className="profile-card">
          <h3>{t("profile.account")}</h3>
          <div className="profile-account">
            <div className="profile-avatar">
              {profile.name ? profile.name[0].toUpperCase() : "?"}
            </div>
            <div className="profile-account-info">
              <strong>{profile.name || t("profile.display_name")}</strong>
              <span>{user.email}</span>
              <div className="profile-id-row">
                <span className="profile-muted">{t("profile.user_id")}: {user.id.slice(0, 8)}...</span>
                <button className="pill-btn" onClick={handleCopyId}>
                  {t("profile.copy_id")}
                </button>
              </div>
            </div>
          </div>

          <div className="profile-meta">
            <div>
              <span className="profile-muted">{t("profile.active_household")}</span>
              <strong>{household?.name || "-"}</strong>
            </div>
            <div>
              <span className="profile-muted">{t("profile.memberships")}</span>
              <strong>{membershipNames.length || 0}</strong>
            </div>
          </div>
          {membershipNames.length > 0 && (
            <div className="profile-list">
              {membershipNames.map((name) => (
                <span key={name} className="profile-chip">{name}</span>
              ))}
            </div>
          )}
        </div>

        <div className="profile-card">
          <h3>{t("profile.details")}</h3>
          <div className="profile-field">
            <label htmlFor="profile-name">{t("profile.display_name")}</label>
            <input
              id="profile-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={t("profile.display_name")}
              maxLength={maxNameLength}
            />
            <div className="profile-helper">
              <span>{t("profile.visible_hint")}</span>
              <span>{nameDraft.length}/{maxNameLength}</span>
            </div>
          </div>
          <div className="profile-actions">
            <button className="pill-btn accent" onClick={handleSaveProfile} disabled={saving || !isDirty}>
              {saving ? t("common.loading") : t("profile.save_profile")}
            </button>
            {isDirty && (
              <button className="pill-btn" onClick={() => setNameDraft(profile?.name || "")}>
                {t("profile.reset")}
              </button>
            )}
          </div>
        </div>

        <div className="profile-card">
          <h3>{t("profile.alerts_title")}</h3>
          <p className="profile-muted">
            {t("profile.alerts_hint")}
          </p>
          <div className="profile-field">
            <label htmlFor="alert-days">{t("profile.alert_days")}</label>
            <input
              id="alert-days"
              type="number"
              min={1}
              max={60}
              value={alertDays}
              onChange={(e) => setAlertDays(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label htmlFor="low-stock">{t("profile.low_stock")}</label>
            <input
              id="low-stock"
              type="number"
              min={0}
              max={20}
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
            />
          </div>
          <button className="pill-btn accent" onClick={handleSaveSettings} disabled={!settingsDirty}>
            {t("profile.save_settings")}
          </button>
        </div>

        <div className="profile-card">
          <h3>{t("profile.preferences")}</h3>
          <div className="profile-field">
            <label htmlFor="default-scan">{t("profile.default_scan")}</label>
            <select
              id="default-scan"
              value={prefs.defaultScanMode}
              onChange={(e) => setPrefs({ ...prefs, defaultScanMode: e.target.value })}
            >
              <option value="manual">{t("profile.manual_entry")}</option>
              <option value="camera">{t("profile.camera_scan")}</option>
            </select>
          </div>
          <div className="profile-field">
            <label>{t("profile.theme")}</label>
            <div className="profile-toggle-group">
              <button
                type="button"
                className={`pill-btn ${prefs.theme === "light" ? "active" : ""}`}
                onClick={() => setPrefs({ ...prefs, theme: "light" })}
              >
                {t("profile.theme_light")}
              </button>
              <button
                type="button"
                className={`pill-btn ${prefs.theme === "dark" ? "active" : ""}`}
                onClick={() => setPrefs({ ...prefs, theme: "dark" })}
              >
                {t("profile.theme_dark")}
              </button>
            </div>
          </div>
          <div className="profile-field">
            <label htmlFor="language-select">{t("profile.language")}</label>
            <select
              id="language-select"
              value={prefs.language}
              onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <label className="profile-toggle">
            <input
              type="checkbox"
              checked={prefs.continuousScan}
              onChange={(e) => setPrefs({ ...prefs, continuousScan: e.target.checked })}
            />
            {t("profile.continuous_scan")}
          </label>
          <label className="profile-toggle">
            <input
              type="checkbox"
              checked={prefs.compactMode}
              onChange={(e) => setPrefs({ ...prefs, compactMode: e.target.checked })}
            />
            {t("profile.compact_layout")}
          </label>
          <label className="profile-toggle">
            <input
              type="checkbox"
              checked={prefs.showImages}
              onChange={(e) => setPrefs({ ...prefs, showImages: e.target.checked })}
            />
            {t("profile.show_images")}
          </label>
          <div className="profile-actions">
            <button className="pill-btn accent" onClick={handleSavePrefs} disabled={!prefDirty}>
              {t("profile.save_prefs")}
            </button>
            <button className="pill-btn" onClick={handleResetPrefs}>
              {t("profile.reset_prefs")}
            </button>
          </div>
        </div>
      </div>

      {message && <p className="profile-success">{message}</p>}
      {error && <p className="profile-error">{error}</p>}
    </div>
  );
}
