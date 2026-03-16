import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./TagPicker.css";

const normalizeTag = (value) => (value || "").trim().toLowerCase();

export default function TagPicker({ availableTags = [], selectedTags = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [localTags, setLocalTags] = useState([]);
  const [newTag, setNewTag] = useState("");

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

  const handleAddTag = () => {
    const normalized = normalizeTag(newTag);
    if (!normalized) return;
    if (!localTags.includes(normalized)) {
      setLocalTags((prev) => [...prev, normalized]);
    }
    if (!selectedTags.includes(normalized)) {
      onChange?.([...selectedTags, normalized]);
    }
    setNewTag("");
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

  const modal = open
    ? createPortal(
        <div className="tag-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="tag-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tag-modal-header">
              <h4>Tags</h4>
              <button type="button" className="tag-close-btn" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            <div className="tag-modal-body">
              <div className="tag-create-row">
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Create new tag"
                />
                <button type="button" onClick={handleAddTag}>
                  Add
                </button>
              </div>

              <div className="tag-options">
                {localTags.length === 0 ? (
                  <p>No tags yet.</p>
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
                Done
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
        {selectedTags.length === 0 && <span className="tag-picker-empty">No tags</span>}
        {selectedTags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
          </span>
        ))}
        <button
          type="button"
          className="tag-add-btn"
          onClick={() => setOpen(true)}
          aria-label="Add tags"
        >
          +
        </button>
      </div>

      {modal}
    </div>
  );
}
