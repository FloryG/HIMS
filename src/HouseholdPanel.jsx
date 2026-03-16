import { useEffect, useState } from "react";
import {
  addSection,
  createHouseholdForUser,
  deleteTagRule,
  joinHouseholdByCode,
  removeSection,
  setActiveHousehold,
  upsertTagRule,
} from "./householdService";
import ActivityLog from "./ActivityLog";
import { useI18n } from "./i18n";
import "./HouseholdPanel.css";

export default function HouseholdPanel({
  user,
  household,
  households,
  sections,
  tagRules,
  joinCodePrefill,
  activeTab,
  onTabChange,
  onRefreshSections,
  onRefreshTagRules,
  onReloadHousehold,
}) {
  const { t } = useI18n();
  const [localTab, setLocalTab] = useState(activeTab || "info");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [tagRuleTag, setTagRuleTag] = useState("");
  const [tagRuleAlertDays, setTagRuleAlertDays] = useState("");
  const [tagRuleLowStock, setTagRuleLowStock] = useState("");

  const joinCodeDisplay = household?.join_code
    ? household.join_code.match(/.{1,3}/g)?.join("-")
    : "-";
  const inviteLink = household?.join_code
    ? `${window.location.origin}${window.location.pathname}?join=${household.join_code}`
    : "";

  useEffect(() => {
    if (activeTab) {
      setLocalTab(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (joinCodePrefill && !joinCode) {
      setJoinCode(joinCodePrefill);
    }
  }, [joinCodePrefill, joinCode]);

  const normalizeTag = (value) => value.trim().toLowerCase();
  const parseOptionalNumber = (value) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  };

  const handleJoinHousehold = async () => {
    try {
      if (!joinCode.trim()) return;
      await joinHouseholdByCode(user.id, joinCode.trim());
      setJoinCode("");
      await onReloadHousehold();
      setMessage(t("household.joined"));
    } catch (err) {
      console.error(err);
      setError(`${t("household.join_failed")} ${err?.message || ""}`.trim());
    }
  };

  const handleCreateHousehold = async () => {
    try {
      await createHouseholdForUser(user, newHouseholdName);
      setNewHouseholdName("");
      await onReloadHousehold();
      setMessage(t("household.created"));
    } catch (err) {
      console.error(err);
      setError(`${t("household.create_failed")} ${err?.message || ""}`.trim());
    }
  };

  const handleCopyJoinCode = async () => {
    if (!household?.join_code) return;
    try {
      await navigator.clipboard?.writeText(household.join_code);
      setMessage(t("common.copy"));
    } catch (err) {
      console.error(err);
      setError(t("household.copy_failed"));
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard?.writeText(inviteLink);
      setMessage(t("common.copy"));
    } catch (err) {
      console.error(err);
      setError(t("household.copy_failed"));
    }
  };

  const handleSwitchHousehold = async (nextId) => {
    try {
      if (!nextId || nextId === household?.id) return;
      await setActiveHousehold(user.id, nextId);
      await onReloadHousehold();
      setMessage(t("household.switch"));
    } catch (err) {
      console.error(err);
      setError(t("household.switch_failed"));
    }
  };

  const handleAddSection = async () => {
    if (!household?.id) {
      setError(t("sections.manage_requires_household"));
      return;
    }
    if (!newSectionName.trim()) return;
    try {
      await addSection(household.id, newSectionName.trim());
      setNewSectionName("");
      await onRefreshSections();
    } catch (err) {
      console.error(err);
      setError(t("sections.add_failed"));
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!household?.id) return;
    try {
      await removeSection(sectionId);
      await onRefreshSections();
    } catch (err) {
      console.error(err);
      setError(t("sections.remove_failed"));
    }
  };

  const handleSaveTagRule = async () => {
    if (!household?.id) {
      setError(t("tags.manage_requires_household"));
      return;
    }
    const tag = normalizeTag(tagRuleTag);
    if (!tag) return;
    try {
      await upsertTagRule(
        household.id,
        tag,
        parseOptionalNumber(tagRuleAlertDays),
        parseOptionalNumber(tagRuleLowStock)
      );
      setTagRuleTag("");
      await onRefreshTagRules();
      setMessage(t("tags.rule_saved"));
    } catch (err) {
      console.error(err);
      setError(t("tags.rule_failed"));
    }
  };

  const handleDeleteTagRule = async (tag) => {
    if (!household?.id) return;
    try {
      await deleteTagRule(household.id, tag);
      await onRefreshTagRules();
      setMessage(t("tags.rule_removed"));
    } catch (err) {
      console.error(err);
      setError(t("tags.rule_remove_failed"));
    }
  };

  const tabs = [
    { id: "info", label: t("household.info") },
    { id: "tags", label: t("household.tags") },
    { id: "sections", label: t("household.sections") },
    { id: "activity", label: t("household.activity") },
  ];

  const currentTab = activeTab || localTab;
  const handleTabChange = (next) => {
    if (onTabChange) {
      onTabChange(next);
    } else {
      setLocalTab(next);
    }
  };

  return (
    <div className="household-panel">
      <div className="household-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`household-tab ${currentTab === tab.id ? "active" : ""}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentTab === "info" && (
        <div className="household-card">
          <h3>{t("household.info")}</h3>
          <p>
            {t("household.active")}: <strong>{household?.name || "-"}</strong>
          </p>
          <p>
            {t("household.join_code")}: <strong>{joinCodeDisplay}</strong>
          </p>
          {household?.join_code && (
            <div className="household-row">
              <button className="pill-btn" onClick={handleCopyJoinCode}>
                {t("household.copy_code")}
              </button>
              <button className="pill-btn" onClick={handleCopyInviteLink}>
                {t("household.copy_invite")}
              </button>
            </div>
          )}

          {households?.length > 1 && (
            <div className="household-switch-panel">
              <span className="household-muted">{t("household.switch")}</span>
              <div className="household-switch-list">
                {households.map((membership) => (
                  <button
                    key={membership.households.id}
                    className={`pill-btn ${membership.households.id === household?.id ? "active" : ""}`}
                    onClick={() => handleSwitchHousehold(membership.households.id)}
                  >
                    {membership.households.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="household-row">
            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())
              }
              placeholder={t("household.join_placeholder")}
            />
            <button className="pill-btn accent" onClick={handleJoinHousehold}>
              {t("household.join")}
            </button>
          </div>

          {joinCodePrefill && (
            <p className="household-muted">{t("household.invite_detected")}</p>
          )}

          <div className="household-row">
            <input
              value={newHouseholdName}
              onChange={(e) => setNewHouseholdName(e.target.value)}
              placeholder={t("household.new_placeholder")}
            />
            <button className="pill-btn accent" onClick={handleCreateHousehold}>
              {t("household.create")}
            </button>
          </div>
        </div>
      )}

      {currentTab === "tags" && (
        <div className="household-card">
          <h3>{t("tags.manage_title")}</h3>
          <p className="household-muted">{t("tags.manage_desc")}</p>
          {!household?.id ? (
            <p>{t("tags.manage_requires_household")}</p>
          ) : (
            <>
              <div className="household-row">
                <input
                  value={tagRuleTag}
                  onChange={(e) => setTagRuleTag(e.target.value)}
                  placeholder={t("tags.name")}
                />
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={tagRuleAlertDays}
                  onChange={(e) => setTagRuleAlertDays(e.target.value)}
                  placeholder={t("tags.alert_days_optional")}
                />
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={tagRuleLowStock}
                  onChange={(e) => setTagRuleLowStock(e.target.value)}
                  placeholder={t("tags.low_stock_optional")}
                />
                <button className="pill-btn" onClick={handleSaveTagRule}>
                  {t("tags.save")}
                </button>
              </div>

              {tagRules?.length ? (
                <div className="tag-rule-list">
                  {tagRules.map((rule) => (
                    <div key={rule.id} className="tag-rule-item">
                      <strong>{rule.tag}</strong>
                      <span>{t("profile.alert_days")}: {rule.alert_days ?? "-"}</span>
                      <span>{t("profile.low_stock")}: {rule.low_stock_threshold ?? "-"}</span>
                      <button className="pill-btn" onClick={() => handleDeleteTagRule(rule.tag)}>
                        {t("common.remove")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p>{t("tags.none_rules")}</p>
              )}
            </>
          )}
        </div>
      )}

      {currentTab === "sections" && (
        <div className="household-card">
          <h3>{t("sections.title")}</h3>
          {!household?.id ? (
            <p>{t("sections.manage_requires_household")}</p>
          ) : (
            <>
              <div className="household-row">
                <input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder={t("sections.add_placeholder")}
                />
                <button className="pill-btn" onClick={handleAddSection}>
                  {t("common.add")}
                </button>
              </div>

              {sections?.length === 0 ? (
                <p>{t("sections.none")}</p>
              ) : (
                <div className="tag-rule-list">
                  {sections.map((section) => (
                    <div key={section.id} className="tag-rule-item">
                      <span>{section.name}</span>
                      <button className="pill-btn" onClick={() => handleDeleteSection(section.id)}>
                        {t("common.remove")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {currentTab === "activity" && (
        <div className="household-card">
          <h3>{t("activity.title")}</h3>
          {!household?.id ? (
            <p>{t("tags.manage_requires_household")}</p>
          ) : (
            <ActivityLog householdId={household.id} />
          )}
        </div>
      )}

      {message && <p className="household-success">{message}</p>}
      {error && <p className="household-error">{error}</p>}
    </div>
  );
}
