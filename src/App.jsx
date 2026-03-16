import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import BarcodeLookup from "./BarcodeLookup";
import Dashboard from "./Dashboard";
import InventoryView from "./InventoryView";
import ShoppingList from "./ShoppingList";
import MyProfile from "./MyProfile";
import HouseholdPanel from "./HouseholdPanel";
import { I18nProvider, getTranslator } from "./i18n";
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

const defaultUiPrefs = {
  defaultScanMode: "manual",
  continuousScan: false,
  compactMode: false,
  showImages: true,
  theme: "light",
  language: "en",
};

const loadUiPrefs = () => {
  if (typeof window === "undefined") return { ...defaultUiPrefs };
  return {
    defaultScanMode: localStorage.getItem("hims.pref.defaultScanMode") || defaultUiPrefs.defaultScanMode,
    continuousScan: localStorage.getItem("hims.pref.continuousScan") === "true",
    compactMode: localStorage.getItem("hims.pref.compactMode") === "true",
    showImages: localStorage.getItem("hims.pref.showImages") !== "false",
    theme: localStorage.getItem("hims.pref.theme") || defaultUiPrefs.theme,
    language: localStorage.getItem("hims.pref.language") || defaultUiPrefs.language,
  };
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
  const [householdTab, setHouseholdTab] = useState("info");
  const [uiPrefs, setUiPrefs] = useState(loadUiPrefs);
  const [householdMenuOpen, setHouseholdMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const householdMenuRef = useRef(null);
  const t = useMemo(() => getTranslator(uiPrefs.language), [uiPrefs.language]);

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
        setHouseholdError(t("household.none_profile"));
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
          ? t("household.timeout")
          : isRlsError
            ? t("household.rls_error")
            : t("household.failed")
      );
    } finally {
      setHouseholdLoading(false);
    }
  }, [t]);

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

  const handleHouseholdSelect = async (nextId) => {
    if (!nextId || nextId === household?.id) return;
    setHouseholdLoading(true);
    try {
      await setActiveHousehold(session.user.id, nextId);
      await loadHouseholdData(session.user);
      setHouseholdMenuOpen(false);
    } catch (error) {
      console.error(error);
      setHouseholdError(t("household.switch_failed"));
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("hims.pref.defaultScanMode", uiPrefs.defaultScanMode);
    localStorage.setItem("hims.pref.continuousScan", String(uiPrefs.continuousScan));
    localStorage.setItem("hims.pref.compactMode", String(uiPrefs.compactMode));
    localStorage.setItem("hims.pref.showImages", String(uiPrefs.showImages));
    localStorage.setItem("hims.pref.theme", uiPrefs.theme);
    localStorage.setItem("hims.pref.language", uiPrefs.language);
  }, [uiPrefs]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = uiPrefs.theme || "light";
  }, [uiPrefs.theme]);

  useEffect(() => {
    if (!householdMenuOpen) return;
    const handleClick = (event) => {
      if (!householdMenuRef.current?.contains(event.target)) {
        setHouseholdMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [householdMenuOpen]);

  useEffect(() => {
    if (page !== "household") {
      setHouseholdMenuOpen(false);
    }
  }, [page]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [page]);

  if (loading) {
    return (
      <I18nProvider lang={uiPrefs.language}>
        <p>{t("common.loading")}</p>
      </I18nProvider>
    );
  }
  if (!session) {
    return (
      <I18nProvider lang={uiPrefs.language}>
        <Auth />
      </I18nProvider>
    );
  }

  const householdOptions = households
    .map((membership) => membership.households)
    .filter(Boolean);
  const showHouseholdPicker = householdOptions.length > 1;
  const householdMenuLabel = household?.name || "-";

  const openHouseholdTab = (tabId) => {
    setPage("household");
    setHouseholdTab(tabId);
    setHouseholdMenuOpen(false);
  };

  if (!household) {
    return (
      <I18nProvider lang={uiPrefs.language}>
        <div className={`app-container${uiPrefs.compactMode ? " compact" : ""}`}>
        {householdLoading && (
          <div className="household-banner">{t("household.loading")}</div>
        )}
        <h2>{t("household.needed_title")}</h2>
        <p>{householdError || t("household.needed_desc")}</p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="pill-btn" onClick={() => loadHouseholdData(session.user)}>
            {t("common.retry")}
          </button>
          <button className="pill-btn accent" onClick={() => setPage("household")}>
            {t("household.go_to")}
          </button>
        </div>
        {page === "household" && (
          <HouseholdPanel
            user={session.user}
            household={household}
            households={households}
            sections={sections}
            tagRules={tagRules}
            joinCodePrefill={joinCodePrefill}
            activeTab={householdTab}
            onTabChange={setHouseholdTab}
            onRefreshSections={refreshSections}
            onRefreshTagRules={refreshTagRules}
            onReloadHousehold={() => loadHouseholdData(session.user)}
          />
        )}
        {page === "profile" && (
          <MyProfile
            user={session.user}
            settings={settings}
            household={household}
            households={households}
            uiPrefs={uiPrefs}
            onUpdatePrefs={setUiPrefs}
          />
        )}
        </div>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider lang={uiPrefs.language}>
      <div className={`app-container${uiPrefs.compactMode ? " compact" : ""}`}>
      <nav className="navbar">
        <button
          className={page === "dashboard" ? "active" : ""}
          onClick={() => setPage("dashboard")}
        >
          {t("nav.dashboard")}
        </button>
        <button
          className={page === "scanner" ? "active" : ""}
          onClick={() => setPage("scanner")}
        >
          {t("nav.scan")}
        </button>
        <button
          className={page === "inventory" ? "active" : ""}
          onClick={() => setPage("inventory")}
        >
          {t("nav.inventory")}
        </button>
        <button
          className={page === "shopping" ? "active" : ""}
          onClick={() => setPage("shopping")}
        >
          {t("nav.shopping")}
        </button>
        <div className="nav-menu" ref={householdMenuRef}>
          <button
            className={`nav-menu-button ${page === "household" ? "active" : ""}`}
            onClick={() => {
              setPage("household");
              setHouseholdMenuOpen((open) => !open);
            }}
          >
            <span className="nav-menu-title">
              {t("nav.household", { name: householdMenuLabel })}
            </span>
          </button>
          {householdMenuOpen && (
            <div className="nav-submenu">
              <div className="nav-submenu-header">
                <span>{t("household.active")}</span>
                <strong>{household?.name || "-"}</strong>
              </div>
              {showHouseholdPicker && (
                <div className="nav-submenu-switch">
                  <span className="nav-submenu-label">{t("household.switch")}</span>
                  <div className="household-switch-list">
                    {householdOptions.map((option) => (
                      <button
                        key={option.id}
                        className={`pill-btn ${option.id === household.id ? "active" : ""}`}
                        onClick={() => handleHouseholdSelect(option.id)}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="nav-submenu-divider" />
              <button
                className={householdTab === "info" ? "active" : ""}
                onClick={() => openHouseholdTab("info")}
              >
                {t("household.info")}
              </button>
              <button
                className={householdTab === "tags" ? "active" : ""}
                onClick={() => openHouseholdTab("tags")}
              >
                {t("household.tags")}
              </button>
              <button
                className={householdTab === "sections" ? "active" : ""}
                onClick={() => openHouseholdTab("sections")}
              >
                {t("household.sections")}
              </button>
              <button
                className={householdTab === "activity" ? "active" : ""}
                onClick={() => openHouseholdTab("activity")}
              >
                {t("household.activity")}
              </button>
            </div>
          )}
        </div>
        <button
          className={page === "profile" ? "active" : ""}
          onClick={() => setPage("profile")}
        >
          {t("nav.profile")}
        </button>
        <button onClick={() => supabase.auth.signOut()}>{t("nav.logout")}</button>
      </nav>

      {householdLoading && (
        <div className="household-banner">{t("household.loading")}</div>
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
            tagRules={tagRules}
            onManageTags={() => openHouseholdTab("tags")}
            uiPrefs={uiPrefs}
          />
        )}
        {page === "inventory" && (
          <InventoryView
            user={session.user}
            householdId={household.id}
            sections={sections}
            settings={settings}
            tagRules={tagRules}
            onManageTags={() => openHouseholdTab("tags")}
            uiPrefs={uiPrefs}
          />
        )}
        {page === "shopping" && (
          <ShoppingList
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
            activeTab={householdTab}
            onTabChange={setHouseholdTab}
            onRefreshSections={refreshSections}
            onRefreshTagRules={refreshTagRules}
            onReloadHousehold={() => loadHouseholdData(session.user)}
          />
        )}
        {page === "profile" && (
          <MyProfile
            user={session.user}
            settings={settings}
            household={household}
            households={households}
            uiPrefs={uiPrefs}
            onUpdatePrefs={setUiPrefs}
          />
        )}
      </div>

      <div className="mobile-nav">
        <button
          className={page === "dashboard" ? "active" : ""}
          onClick={() => setPage("dashboard")}
        >
          {t("nav.dashboard")}
        </button>
        <button
          className={page === "scanner" ? "active" : ""}
          onClick={() => setPage("scanner")}
        >
          {t("nav.scan")}
        </button>
        <button
          className={page === "inventory" ? "active" : ""}
          onClick={() => setPage("inventory")}
        >
          {t("nav.inventory")}
        </button>
        <button
          className={page === "shopping" ? "active" : ""}
          onClick={() => setPage("shopping")}
        >
          {t("nav.shopping")}
        </button>
        <button
          className={mobileMenuOpen ? "active" : ""}
          onClick={() => setMobileMenuOpen(true)}
        >
          {t("nav.more")}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-sheet-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-header">
              <h3>{t("nav.more")}</h3>
              <button className="pill-btn" onClick={() => setMobileMenuOpen(false)}>
                {t("common.close")}
              </button>
            </div>

            <div className="mobile-sheet-group">
              <span className="mobile-sheet-title">{t("nav.profile")}</span>
              <button className="mobile-sheet-link" onClick={() => setPage("profile")}>
                {t("nav.profile")}
              </button>
            </div>

            <div className="mobile-sheet-group">
              <span className="mobile-sheet-title">{t("nav.household", { name: householdMenuLabel })}</span>
              <button className="mobile-sheet-link" onClick={() => openHouseholdTab("info")}>
                {t("household.info")}
              </button>
              <button className="mobile-sheet-link" onClick={() => openHouseholdTab("tags")}>
                {t("household.tags")}
              </button>
              <button className="mobile-sheet-link" onClick={() => openHouseholdTab("sections")}>
                {t("household.sections")}
              </button>
              <button className="mobile-sheet-link" onClick={() => openHouseholdTab("activity")}>
                {t("household.activity")}
              </button>
            </div>

            {showHouseholdPicker && (
              <div className="mobile-sheet-group">
                <span className="mobile-sheet-title">{t("household.switch")}</span>
                <div className="household-switch-list">
                  {householdOptions.map((option) => (
                    <button
                      key={option.id}
                      className={`pill-btn ${option.id === household.id ? "active" : ""}`}
                      onClick={() => handleHouseholdSelect(option.id)}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button className="pill-btn danger" onClick={() => supabase.auth.signOut()}>
              {t("nav.logout")}
            </button>
          </div>
        </div>
      )}
      </div>
    </I18nProvider>
  );
}
