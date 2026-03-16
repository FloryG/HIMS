import { useEffect, useMemo, useState } from "react";
import BarcodeScanner from "./BarcodeScanner";
import TagPicker from "./TagPicker";
import { supabase } from "./supabaseClient";
import { DEFAULT_SECTIONS } from "./householdService";
import { useI18n } from "./i18n";
import { buildNameTranslations, pickTranslation } from "./localize";
import {
  applyLocalMutation,
  enqueueAction,
  generateClientId,
  loadCachedItems,
  saveCachedItems,
} from "./offlineQueue";
import "./ScannerStyles.css";

const STATES = [
  "unopened",
  "opened",
  "nearing expiry",
  "soon consumed",
  "none left",
];

const normalizeTag = (value) => (value || "").trim().toLowerCase();

export default function BarcodeLookup({
  user,
  householdId,
  sections = [],
  tagRules = [],
  onManageTags,
  uiPrefs,
}) {
  const { t, lang } = useI18n();
  const safeDefaultMode = uiPrefs?.defaultScanMode === "camera" ? "camera" : "manual";
  const [mode, setMode] = useState(safeDefaultMode);
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [section, setSection] = useState("Fridge");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState("unopened");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [continuousScan, setContinuousScan] = useState(Boolean(uiPrefs?.continuousScan));
  const scannerPaused = mode === "camera" && Boolean(product || manualMode) && !continuousScan;
  const currentLang = uiPrefs?.language || lang || "en";
  const stateOptions = useMemo(
    () => [
      { value: "unopened", label: t("state.unopened") },
      { value: "opened", label: t("state.opened") },
      { value: "nearing expiry", label: t("state.nearing_expiry") },
      { value: "soon consumed", label: t("state.soon_consumed") },
      { value: "none left", label: t("state.none_left") },
    ],
    [t]
  );
  const productName = useMemo(() => {
    if (!product) return "";
    const translations = buildNameTranslations(product);
    return pickTranslation(translations, product?.product_name, currentLang);
  }, [product, currentLang]);

  const sectionOptions = sections.length
    ? sections.map((s) => s.name)
    : DEFAULT_SECTIONS;

  useEffect(() => {
    if (sectionOptions.length && !sectionOptions.includes(section)) {
      setSection(sectionOptions[0]);
    }
  }, [sections, section]);

  useEffect(() => {
    const fetchDefault = async () => {
      if (!barcode || !householdId) return;
      const { data } = await supabase
        .from("product_defaults")
        .select("default_section, default_tags")
        .eq("barcode", barcode)
        .eq("household_id", householdId)
        .maybeSingle();
      if (data?.default_section) setSection(data.default_section);
      if (data?.default_tags?.length) {
        setSelectedTags(data.default_tags.map(normalizeTag));
      } else {
        setSelectedTags([]);
      }
    };
    fetchDefault();
  }, [barcode, householdId]);

  useEffect(() => {
    if (!householdId) return;
    const ruleTags = tagRules.map((rule) => rule.tag).filter(Boolean).map(normalizeTag);
    const cachedTags = loadCachedItems(householdId)
      .flatMap((item) => item.tags || [])
      .map(normalizeTag);
    const merged = Array.from(new Set([...ruleTags, ...cachedTags].filter(Boolean)));
    setAvailableTags(merged);

    if (!navigator.onLine) return;

    const fetchTags = async () => {
      const { data } = await supabase
        .from("items")
        .select("tags")
        .eq("household_id", householdId)
        .limit(500);
      if (!data) return;
      const itemTags = data.flatMap((row) => row.tags || []).map(normalizeTag);
      const next = Array.from(new Set([...ruleTags, ...itemTags].filter(Boolean)));
      setAvailableTags(next);
    };
    fetchTags();
  }, [householdId, tagRules]);

  useEffect(() => {
    if (uiPrefs?.defaultScanMode) {
      setMode(uiPrefs.defaultScanMode === "camera" ? "camera" : "manual");
    }
  }, [uiPrefs?.defaultScanMode]);

  useEffect(() => {
    if (typeof uiPrefs?.continuousScan === "boolean") {
      setContinuousScan(uiPrefs.continuousScan);
    }
  }, [uiPrefs?.continuousScan]);

  const fetchProduct = async (code) => {
    if (!code) return;
    setMsg("");
    setErr("");
    setProduct(null);
    setManualMode(false);

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json`
      );
      const data = await res.json();
      if (!data.product) throw new Error("Product not found");
      setProduct(data.product);
      setManualMode(false);
    } catch (e) {
      setErr(t("scanner.product_not_found"));
      setManualMode(true);
      console.error(e);
    }
  };

  const handleDetected = (code) => {
    if (code === barcode) return;
    setSelectedTags([]);
    setBarcode(code);
    fetchProduct(code);
  };

  const resetScan = () => {
    setMsg("");
    setErr("");
    setProduct(null);
    setManualMode(false);
    setManualName("");
    setManualBrand("");
    setManualImageUrl("");
    setSelectedTags([]);
    setBarcode("");
    setExpiryDate("");
    setQuantity(1);
    setState("unopened");
  };

  const saveOfflineItem = (payload) => {
    const client_id = generateClientId();
    const action = {
      type: "create_item",
      payload: { ...payload, client_id, id: client_id },
    };
    enqueueAction(action);
    const cached = loadCachedItems(householdId);
    const updated = applyLocalMutation(cached, action);
    saveCachedItems(householdId, updated);
  };

  const handleSave = async () => {
    if (!householdId) return;
    const tags = selectedTags;
    const trimmedManualName = manualName.trim();
    const nameTranslations = manualMode
      ? (trimmedManualName
        ? { original: trimmedManualName, [currentLang]: trimmedManualName }
        : null)
      : buildNameTranslations(product);
    const displayName = manualMode
      ? trimmedManualName
      : pickTranslation(nameTranslations, product?.product_name, currentLang);

    const payload = {
      household_id: householdId,
      user_id: user.id,
      barcode: barcode || null,
      name: displayName,
      name_translations: nameTranslations,
      brand: manualMode ? manualBrand.trim() : product?.brands,
      image_url: manualMode ? manualImageUrl.trim() : product?.image_front_small_url,
      nutriscore: manualMode ? null : product?.nutriscore_grade,
      nutriments: manualMode ? {} : product?.nutriments || {},
      expiry_date: expiryDate,
      quantity,
      state,
      section,
      tags,
    };

    if (!payload.name) {
      setErr(t("scanner.name_required"));
      return;
    }

    setErr("");
    setMsg(t("scanner.saving"));

    if (!navigator.onLine) {
      saveOfflineItem(payload);
      setMsg(t("scanner.saved_offline"));
      setProduct(null);
      setManualMode(false);
      setManualName("");
      setManualBrand("");
      setManualImageUrl("");
      setSelectedTags([]);
      setBarcode("");
      setExpiryDate("");
      setQuantity(1);
      setState("unopened");
      return;
    }

    const { data, error: insertError } = await supabase
      .from("items")
      .insert([payload])
      .select("*")
      .single();

    if (insertError) {
      console.error(insertError);
      setErr(t("scanner.save_failed"));
      setMsg("");
      return;
    }

    const cached = loadCachedItems(householdId);
    saveCachedItems(householdId, [data, ...cached]);

    if (barcode) {
      const { error: defaultError } = await supabase
        .from("product_defaults")
        .upsert([
          {
            household_id: householdId,
            user_id: user.id,
            barcode,
            default_section: section,
            default_tags: tags,
            last_updated: new Date(),
          },
        ]);

      if (defaultError) {
        console.error("Failed to update product_defaults:", defaultError);
      }
    }

    setMsg(t("scanner.saved"));
    setProduct(null);
    setManualMode(false);
    setManualName("");
    setManualBrand("");
    setManualImageUrl("");
    setSelectedTags([]);
    setBarcode("");
    setExpiryDate("");
    setQuantity(1);
    setState("unopened");
  };

  return (
    <div className="lookup-container">
      <h2 className="title">{t("scanner.title")}</h2>

      <div className="mode-buttons">
        <button
          className={mode === "manual" ? "active" : ""}
          onClick={() => setMode("manual")}
        >
          {t("scanner.manual")}
        </button>
        <button
          className={mode === "camera" ? "active" : ""}
          onClick={() => setMode("camera")}
        >
          {t("scanner.camera")}
        </button>
      </div>

      {mode === "manual" && (
        <div className="manual-entry">
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder={t("scanner.enter_barcode")}
          />
          <button onClick={() => fetchProduct(barcode)}>{t("scanner.search")}</button>
          <button
            className="secondary-btn"
            onClick={() => {
              setManualMode(true);
              setProduct(null);
              setErr("");
            }}
          >
            {t("scanner.manual_entry")}
          </button>
        </div>
      )}

      {mode === "camera" && (
        <div className="camera-entry">
          <BarcodeScanner onDetected={handleDetected} paused={scannerPaused} />
          <p className="hint">{t("scanner.hint")}</p>
          <div className="scan-options">
            <label className="scan-option">
              <input
                type="checkbox"
                checked={continuousScan}
                onChange={(e) => setContinuousScan(e.target.checked)}
              />
              {t("scanner.continuous")}
            </label>
          </div>
          {scannerPaused && (
            <button className="secondary-btn" onClick={resetScan}>
              {t("scanner.scan_another")}
            </button>
          )}
        </div>
      )}

      {err && <p className="error">{err}</p>}
      {msg && <p className="success">{msg}</p>}

      {(product || manualMode) && (
        <div className="product-card">
          {!manualMode && (
            <img
              src={product?.image_front_small_url}
              alt={productName}
              className="product-img"
            />
          )}
          {manualMode ? (
            <>
              <label>
                {t("scanner.name")}:
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder={t("scanner.name")}
                />
              </label>
              <label>
                {t("scanner.brand")}:
                <input
                  value={manualBrand}
                  onChange={(e) => setManualBrand(e.target.value)}
                  placeholder={t("scanner.brand")}
                />
              </label>
              <label>
                {t("scanner.image_url")}:
                <input
                  value={manualImageUrl}
                  onChange={(e) => setManualImageUrl(e.target.value)}
                  placeholder={t("scanner.image_placeholder")}
                />
              </label>
            </>
          ) : (
            <>
              <h3>{productName}</h3>
              <p>{t("scanner.brand")}: {product?.brands}</p>
              <p>{t("scanner.nutriscore")}: {product?.nutriscore_grade?.toUpperCase() || "N/A"}</p>
            </>
          )}

          <label>
            {t("scanner.section")}:
            <select value={section} onChange={(e) => setSection(e.target.value)}>
              {sectionOptions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>

          <label>
            {t("scanner.expiry")}:
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>

          <label>
            {t("scanner.quantity")}:
            <input
              type="number"
              value={quantity}
              min={1}
              onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            />
          </label>

          <label>
            {t("scanner.state")}:
            <select value={state} onChange={(e) => setState(e.target.value)}>
              {stateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="tag-field">
            <span className="tag-label">{t("scanner.tags")}</span>
            <TagPicker
              availableTags={availableTags}
              selectedTags={selectedTags}
              onChange={setSelectedTags}
              onManageTags={onManageTags}
            />
          </div>

          <button className="save-btn" onClick={handleSave}>
            {t("scanner.save")}
          </button>
        </div>
      )}
    </div>
  );
}
