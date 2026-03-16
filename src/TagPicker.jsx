import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./TagPicker.css";
import { useI18n } from "./i18n";

const normalizeTag = (value) => (value || "").trim().toLowerCase();

export default function TagPicker({
  availableTags = [],
  selectedTags = [],
  onChange,
  onManageTags,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [localTags, setLocalTags] = useState([]);

  useEffect(() => {
    const merged = Array.from(
      new Set([...availableTags, ...selectedTags].map(normalizeTag).filter(Boolean))
    );
    setLocalTags(merged);
  }, [availableTags, selectedTags]);

  const toggleTag = (tag) => {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    const next = selectedTags.includes(normalized)
      ? selectedTags.filter((t) => t !== normalized)
      : [...selectedTags, normalized];
    onChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const handleManageTags = () => {
    setOpen(false);
    onManageTags?.();
  };

  const modal = open
    ? createPortal(
        <div className="tag-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="tag-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="tag-modal-header">
              <h4>{t("household.tags")}</h4>
              <button type="button" className="tag-close-btn" onClick={() => setOpen(false)}>
                {t("common.close")}
              </button>
            </div>

            <div className="tag-modal-body">
              <div className="tag-manage-hint">
                {t("tags.helper")}
                {onManageTags && (
                  <button type="button" className="tag-manage-btn" onClick={handleManageTags}>
                    {t("tags.open")}
                  </button>
                )}
              </div>

              <div className="tag-options">
                {localTags.length === 0 ? (
                  <p>{t("tags.none")}</p>
                ) : (
                  localTags.map((tag) => (
                    <label key={tag} className="tag-option">
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag)}
                        onChange={() => toggleTag(tag)}
                      />
                      {tag}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="tag-modal-actions">
              <button type="button" onClick={() => setOpen(false)}>
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="tag-picker">
      <div className="tag-picker-chips">
        {selectedTags.length === 0 && (
          <span className="tag-picker-empty">{t("tags.no_tags")}</span>
        )}
        {selectedTags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
          </span>
        ))}
        <button
          type="button"
          className="tag-add-btn"
          onClick={() => setOpen(true)}
          aria-label={t("tags.add")}
        >
          +
        </button>
      </div>

      {modal}
    </div>
  );
}
