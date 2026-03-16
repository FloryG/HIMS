import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import BarcodeLookup from "./BarcodeLookup";
import Dashboard from "./Dashboard";
import InventoryView from "./InventoryView";
import ShoppingList from "./ShoppingList";
import MyProfile from "./MyProfile";
import HouseholdPanel from "./HouseholdPanel";
import {
  ensureActiveHousehold,
  fetchSections,
  fetchTagRules,
  seedSectionsIfEmpty,
  setActiveHousehold,
} from "./householdService";
import "./App.css";

const withTimeout = (promise, ms, label = "Request") => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${label} timed out`);
      error.code = "TIMEOUT";
      reject(error);
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("scanner");
  const [loading, setLoading] = useState(true);
  const [householdLoading, setHouseholdLoading] = useState(false);
  const [householdError, setHouseholdError] = useState("");
  const [household, setHousehold] = useState(null);
  const [households, setHouseholds] = useState([]);
  const [sections, setSections] = useState([]);
  const [tagRules, setTagRules] = useState([]);
  const [settings, setSettings] = useState({ low_stock_threshold: 1, alert_days: 7 });
  const [joinCodePrefill, setJoinCodePrefill] = useState("");

  const loadHouseholdData = useCallback(async (user) => {
    if (!user) return;
    setHouseholdLoading(true);
    setHouseholdError("");
    try {
      const { household: activeHousehold, memberships } = await withTimeout(
        ensureActiveHousehold(user),
        12000,
        "Household load"
      );
      if (activeHousehold) {
        await seedSectionsIfEmpty(activeHousehold.id);
        const sectionData = await fetchSections(activeHousehold.id);
        const ruleData = await fetchTagRules(activeHousehold.id);
        setHousehold(activeHousehold);
        setSections(sectionData);
        setHouseholds(memberships || []);
        setTagRules(ruleData);
      } else {
        setHousehold(null);
        setHouseholdError("No household found. Create or join one from Profile.");
        setSections([]);
        setTagRules([]);
      }

      const { data: settingsData } = await supabase
        .from("user_settings")
        .select("low_stock_threshold, alert_days")
        .eq("user_id", user.id)
        .maybeSingle();

      setSettings({
        low_stock_threshold: settingsData?.low_stock_threshold ?? 1,
        alert_days: settingsData?.alert_days ?? 7,
      });
    } catch (error) {
      console.error("Failed to load household data:", error);
      setHousehold(null);
      setHouseholds([]);
      setSections([]);
      setTagRules([]);
      const message = error?.message || "";
      const isRlsError = message.toLowerCase().includes("row level security");
      setHouseholdError(
        error?.code === "TIMEOUT"
          ? "Loading household is taking too long. Check Supabase URL/keys and RLS policies."
          : isRlsError
            ? "Row Level Security blocked a household request. Apply the RLS policies from supabase_migration.sql."
            : "Failed to load household. Check your database setup."
      );
    } finally {
      setHouseholdLoading(false);
    }
  }, []);

  const refreshSections = useCallback(async () => {
    if (!household?.id) return;
    const sectionData = await fetchSections(household.id);
    setSections(sectionData);
  }, [household]);

  const refreshTagRules = useCallback(async () => {
    if (!household?.id) return;
    const ruleData = await fetchTagRules(household.id);
    setTagRules(ruleData);
  }, [household]);

  const handleHouseholdSwitch = async (event) => {
    const nextId = event.target.value;
    if (!nextId || nextId === household?.id) return;
    setHouseholdLoading(true);
    try {
      await setActiveHousehold(session.user.id, nextId);
      await loadHouseholdData(session.user);
    } catch (error) {
      console.error(error);
      setHouseholdError("Failed to switch household.");
    } finally {
      setHouseholdLoading(false);
    }
  };

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data?.session || null);
      setLoading(false);
    };
    loadSession();

    const params = new URLSearchParams(window.location.search);
    const join = params.get("join") || params.get("code");
    if (join) {
      setJoinCodePrefill(join.replace(/[^a-z0-9]/gi, "").toUpperCase());
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadHouseholdData(session.user);
    }
  }, [session, loadHouseholdData]);

  useEffect(() => {
    if (session?.user && !household && !householdLoading) {
      setPage("household");
    }
  }, [session, household, householdLoading]);

  useEffect(() => {
    if (joinCodePrefill && session?.user) {
      setPage("household");
    }
  }, [joinCodePrefill, session]);

  if (loading) return <p>Loading...</p>;
  if (!session) return <Auth />;

  const householdOptions = households
    .map((membership) => membership.households)
    .filter(Boolean);
  const showHouseholdPicker = householdOptions.length > 1;

  if (!household) {
    return (
      <div className="app-container">
        {householdLoading && (
          <div className="household-banner">Loading household...</div>
        )}
        <h2>Household needed</h2>
        <p>{householdError || "Create or join a household to continue."}</p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => loadHouseholdData(session.user)}>Retry</button>
          <button onClick={() => setPage("household")}>Go to Household</button>
        </div>
        {page === "household" && (
          <HouseholdPanel
            user={session.user}
            household={household}
            households={households}
            sections={sections}
            tagRules={tagRules}
            joinCodePrefill={joinCodePrefill}
            onRefreshSections={refreshSections}
            onRefreshTagRules={refreshTagRules}
            onReloadHousehold={() => loadHouseholdData(session.user)}
          />
        )}
        {page === "profile" && <MyProfile user={session.user} settings={settings} />}
      </div>
    );
  }

  return (
    <div className="app-container">
      <nav className="navbar">
        <button
          className={page === "dashboard" ? "active" : ""}
          onClick={() => setPage("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={page === "scanner" ? "active" : ""}
          onClick={() => setPage("scanner")}
        >
          Scan
        </button>
        <button
          className={page === "inventory" ? "active" : ""}
          onClick={() => setPage("inventory")}
        >
          Inventory
        </button>
        <button
          className={page === "shopping" ? "active" : ""}
          onClick={() => setPage("shopping")}
        >
          Shopping List
        </button>
        <button
          className={page === "household" ? "active" : ""}
          onClick={() => setPage("household")}
        >
          Household
        </button>
        <button
          className={page === "profile" ? "active" : ""}
          onClick={() => setPage("profile")}
        >
          Profile
        </button>
        <div className="household-picker">
          <span className="household-label">Household</span>
          {showHouseholdPicker ? (
            <select
              className="household-switch"
              value={household.id}
              onChange={handleHouseholdSwitch}
            >
              {householdOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="household-name">{household.name}</span>
          )}
        </div>
        <button onClick={() => supabase.auth.signOut()}>Logout</button>
      </nav>

      {householdLoading && (
        <div className="household-banner">Loading household...</div>
      )}

      <div className="page-container">
        {page === "dashboard" && (
          <Dashboard householdId={household.id} settings={settings} tagRules={tagRules} />
        )}
        {page === "scanner" && (
          <BarcodeLookup
            user={session.user}
            householdId={household.id}
            sections={sections}
            settings={settings}
            tagRules={tagRules}
          />
        )}
        {page === "inventory" && (
          <InventoryView
            user={session.user}
            householdId={household.id}
            sections={sections}
            settings={settings}
            tagRules={tagRules}
          />
        )}
        {page === "shopping" && (
          <ShoppingList
            user={session.user}
            householdId={household.id}
            settings={settings}
            tagRules={tagRules}
          />
        )}
        {page === "household" && (
          <HouseholdPanel
            user={session.user}
            household={household}
            households={households}
            sections={sections}
            tagRules={tagRules}
            joinCodePrefill={joinCodePrefill}
            onRefreshSections={refreshSections}
            onRefreshTagRules={refreshTagRules}
            onReloadHousehold={() => loadHouseholdData(session.user)}
          />
        )}
        {page === "profile" && (
          <MyProfile
            user={session.user}
            settings={settings}
          />
        )}
      </div>
    </div>
  );
}
