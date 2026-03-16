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
import "./HouseholdPanel.css";

export default function HouseholdPanel({
  user,
  household,
  households,
  sections,
  tagRules,
  joinCodePrefill,
  onRefreshSections,
  onRefreshTagRules,
  onReloadHousehold,
}) {
  const [activeTab, setActiveTab] = useState("info");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [selectedHouseholdId, setSelectedHouseholdId] = useState(household?.id || "");
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
    setSelectedHouseholdId(household?.id || "");
  }, [household]);

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
      setMessage("Joined household.");
    } catch (err) {
      console.error(err);
      setError(`Failed to join household. ${err?.message || ""}`.trim());
    }
  };

  const handleCreateHousehold = async () => {
    try {
      await createHouseholdForUser(user, newHouseholdName);
      setNewHouseholdName("");
      await onReloadHousehold();
      setMessage("Household created.");
    } catch (err) {
      console.error(err);
      setError(`Failed to create household. ${err?.message || ""}`.trim());
    }
  };

  const handleCopyJoinCode = async () => {
    if (!household?.join_code) return;
    try {
      await navigator.clipboard?.writeText(household.join_code);
      setMessage("Join code copied.");
    } catch (err) {
      console.error(err);
      setError("Failed to copy join code.");
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard?.writeText(inviteLink);
      setMessage("Invite link copied.");
    } catch (err) {
      console.error(err);
      setError("Failed to copy invite link.");
    }
  };

  const handleSwitchHousehold = async () => {
    try {
      if (!selectedHouseholdId || selectedHouseholdId === household?.id) return;
      await setActiveHousehold(user.id, selectedHouseholdId);
      await onReloadHousehold();
      setMessage("Switched household.");
    } catch (err) {
      console.error(err);
      setError("Failed to switch household.");
    }
  };

  const handleAddSection = async () => {
    if (!household?.id) {
      setError("Create or join a household before adding sections.");
      return;
    }
    if (!newSectionName.trim()) return;
    try {
      await addSection(household.id, newSectionName.trim());
      setNewSectionName("");
      await onRefreshSections();
    } catch (err) {
      console.error(err);
      setError("Failed to add section.");
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!household?.id) return;
    try {
      await removeSection(sectionId);
      await onRefreshSections();
    } catch (err) {
      console.error(err);
      setError("Failed to remove section.");
    }
  };

  const handleSaveTagRule = async () => {
    if (!household?.id) {
      setError("Create or join a household before adding tag rules.");
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
      setMessage("Tag rule saved.");
    } catch (err) {
      console.error(err);
      setError("Failed to save tag rule.");
    }
  };

  const handleDeleteTagRule = async (tag) => {
    if (!household?.id) return;
    try {
      await deleteTagRule(household.id, tag);
      await onRefreshTagRules();
      setMessage("Tag rule removed.");
    } catch (err) {
      console.error(err);
      setError("Failed to remove tag rule.");
    }
  };

  const tabs = [
    { id: "info", label: "Household info" },
    { id: "tags", label: "Tags" },
    { id: "sections", label: "Custom sections" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="household-panel">
      <div className="household-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`household-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div className="household-card">
          <h3>Household info</h3>
          <p>
            Active: <strong>{household?.name || "-"}</strong>
          </p>
          <p>
            Join code: <strong>{joinCodeDisplay}</strong>
          </p>
          {household?.join_code && (
            <div className="household-row">
              <button className="pill-btn" onClick={handleCopyJoinCode}>
                Copy join code
              </button>
              <button className="pill-btn" onClick={handleCopyInviteLink}>
                Copy invite link
              </button>
            </div>
          )}

          {households?.length > 1 && (
            <div className="household-row">
              <select
                value={selectedHouseholdId}
                onChange={(e) => setSelectedHouseholdId(e.target.value)}
              >
                {households.map((membership) => (
                  <option key={membership.households.id} value={membership.households.id}>
                    {membership.households.name}
                  </option>
                ))}
              </select>
              <button className="pill-btn" onClick={handleSwitchHousehold}>
                Switch
              </button>
            </div>
          )}

          <div className="household-row">
            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())
              }
              placeholder="Enter join code"
            />
            <button className="pill-btn accent" onClick={handleJoinHousehold}>
              Join
            </button>
          </div>

          {joinCodePrefill && (
            <p className="household-muted">Invite detected. The join code is prefilled.</p>
          )}

          <div className="household-row">
            <input
              value={newHouseholdName}
              onChange={(e) => setNewHouseholdName(e.target.value)}
              placeholder="New household name"
            />
            <button className="pill-btn accent" onClick={handleCreateHousehold}>
              Create
            </button>
          </div>
        </div>
      )}

      {activeTab === "tags" && (
        <div className="household-card">
          <h3>Tags</h3>
          <p className="household-muted">
            Leave alert/stock blank to create organize-only tags.
          </p>
          {!household?.id ? (
            <p>Create or join a household to manage tags.</p>
          ) : (
            <>
              <div className="household-row">
                <input
                  value={tagRuleTag}
                  onChange={(e) => setTagRuleTag(e.target.value)}
                  placeholder="Tag name"
                />
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={tagRuleAlertDays}
                  onChange={(e) => setTagRuleAlertDays(e.target.value)}
                  placeholder="Alert days (optional)"
                />
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={tagRuleLowStock}
                  onChange={(e) => setTagRuleLowStock(e.target.value)}
                  placeholder="Low stock (optional)"
                />
                <button className="pill-btn" onClick={handleSaveTagRule}>
                  Add / Update
                </button>
              </div>

              {tagRules?.length ? (
                <div className="tag-rule-list">
                  {tagRules.map((rule) => (
                    <div key={rule.id} className="tag-rule-item">
                      <strong>{rule.tag}</strong>
                      <span>Alert: {rule.alert_days ?? "-"}</span>
                      <span>Low stock: {rule.low_stock_threshold ?? "-"}</span>
                      <button className="pill-btn" onClick={() => handleDeleteTagRule(rule.tag)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No tag rules yet.</p>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "sections" && (
        <div className="household-card">
          <h3>Custom sections</h3>
          {!household?.id ? (
            <p>Create or join a household to manage sections.</p>
          ) : (
            <>
              <div className="household-row">
                <input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="Add a section"
                />
                <button className="pill-btn" onClick={handleAddSection}>
                  Add
                </button>
              </div>

              {sections?.length === 0 ? (
                <p>No sections yet.</p>
              ) : (
                <div className="tag-rule-list">
                  {sections.map((section) => (
                    <div key={section.id} className="tag-rule-item">
                      <span>{section.name}</span>
                      <button className="pill-btn" onClick={() => handleDeleteSection(section.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="household-card">
          <h3>Activity</h3>
          {!household?.id ? (
            <p>Create or join a household to view activity.</p>
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
