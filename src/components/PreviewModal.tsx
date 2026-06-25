import { useEffect, useRef, useState } from "react";
import type { Job, JobStatus, ExtractionSource } from "../types/job";

const ALL_STATUSES: JobStatus[] = [
  "Saved", "Applied", "Interviewing", "Rejected", "Offer", "Withdrawn",
];

const SOURCE_LABELS: Record<ExtractionSource, { label: string; className: string }> = {
  "json-ld":   { label: "Extracted via JSON-LD",     className: "badge-high"   },
  "opengraph": { label: "Extracted via OpenGraph",    className: "badge-medium" },
  "html":      { label: "Extracted via HTML",         className: "badge-low"    },
  "manual":    { label: "Manual entry",               className: "badge-manual" },
  "extension": { label: "Captured from Workday",      className: "badge-high"   },
  "failed":    { label: "Extraction failed",          className: "badge-failed" },
};

interface Props {
  draft: Partial<Job>;
  source: ExtractionSource;
  warning?: string;
  onSave: (job: Partial<Job>) => void;
  onCancel: () => void;
}

export function PreviewModal({ draft: initial, source, warning, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Partial<Job>>(initial);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function set<K extends keyof Job>(key: K, val: Job[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  const { label, className } = SOURCE_LABELS[source] ?? SOURCE_LABELS["failed"];
  const showWarning = warning || source === "failed";

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
    >
      <div className="modal preview-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="preview-eyebrow">Review before saving</p>
            <div className={`source-badge ${className}`}>{label}</div>
          </div>
          <button className="modal-close" onClick={onCancel} aria-label="Close">✕</button>
        </div>

        {/* Warning */}
        {showWarning && (
          <div className="preview-warning">
            <span className="warning-icon">⚠</span>
            {warning || "Extraction failed — fill in the details below or paste the JD."}
          </div>
        )}

        {/* Editable fields */}
        <div className="preview-fields">
          <div className="field-row">
            <label className="field-label">Company</label>
            <input
              className="field-input"
              type="text"
              placeholder="Company name"
              value={draft.company ?? ""}
              onChange={(e) => set("company", e.target.value)}
              autoFocus
            />
          </div>
          <div className="field-row">
            <label className="field-label">Job Title</label>
            <input
              className="field-input"
              type="text"
              placeholder="Job title"
              value={draft.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="field-row two-col">
            <div className="field-sub-row">
              <label className="field-label">Status</label>
              <select
                className="field-select"
                value={draft.status ?? "Applied"}
                onChange={(e) => set("status", e.target.value as JobStatus)}
              >
                {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field-sub-row">
              <label className="field-label">Date</label>
              <input
                className="field-input"
                type="date"
                value={draft.applicationDate ?? ""}
                onChange={(e) => set("applicationDate", e.target.value)}
              />
            </div>
          </div>
          {(draft.location || draft.workType || draft.salary) && (
            <div className="field-row preview-meta-chips">
              {draft.location && <span className="meta-chip">{draft.location}</span>}
              {draft.workType   && <span className="meta-chip">{draft.workType}</span>}
              {draft.salary   && <span className="meta-chip salary-chip">{draft.salary}</span>}
            </div>
          )}
          {draft.link && (
            <div className="field-row">
              <label className="field-label">Link</label>
              <a
                className="preview-link"
                href={draft.link}
                target="_blank"
                rel="noreferrer"
              >
                {draft.link}
              </a>
            </div>
          )}
        </div>

        {/* JD textarea */}
        <div className="preview-jd-section">
          <label className="field-label jd-label">
            Job Description
            {draft.description ? (
              <span className="jd-filled">filled ✓</span>
            ) : (
              <span className="jd-empty">not extracted — paste below</span>
            )}
          </label>
          <textarea
            className="preview-jd-textarea"
            placeholder="Paste the full job description here…"
            value={draft.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => onSave(draft)}
            disabled={!draft.company && !draft.title && !draft.link}
          >
            Save Application
          </button>
        </div>
      </div>
    </div>
  );
}
