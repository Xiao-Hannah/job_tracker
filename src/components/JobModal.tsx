import { useEffect, useRef, useState } from "react";
import type { Job, JobStatus } from "../types/job";
import { StatusBadge } from "./StatusBadge";

const ALL_STATUSES: JobStatus[] = [
  "Saved",
  "Applied",
  "Interviewing",
  "Rejected",
  "Offer",
  "Withdrawn",
];

interface Props {
  job: Job;
  onClose: () => void;
  onSave: (updated: Job) => void;
  onDelete: (id: string) => void;
}

export function JobModal({ job, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Job>({ ...job });
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof Job>(key: K, val: Job[K]) {
    setDraft((d) => ({ ...d, [key]: val, lastUpdated: new Date().toISOString() }));
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  function handleDelete() {
    if (window.confirm("Delete this application?")) {
      onDelete(job.id);
      onClose();
    }
  }

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title-group">
            <input
              className="modal-company-input"
              value={draft.company}
              placeholder="Company name"
              onChange={(e) => set("company", e.target.value)}
            />
            <input
              className="modal-title-input"
              value={draft.title}
              placeholder="Job title"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-meta">
          <label className="meta-row">
            <span className="meta-label">Status</span>
            <select
              className="inline-select"
              value={draft.status}
              onChange={(e) => set("status", e.target.value as JobStatus)}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <StatusBadge status={draft.status} />
          </label>

          <label className="meta-row">
            <span className="meta-label">Applied</span>
            <input
              className="inline-input"
              type="date"
              value={draft.applicationDate}
              onChange={(e) => set("applicationDate", e.target.value)}
            />
          </label>

          <label className="meta-row">
            <span className="meta-label">Interview</span>
            <input
              className="inline-input"
              type="date"
              value={draft.interviewDate ?? ""}
              onChange={(e) => set("interviewDate", e.target.value || undefined)}
            />
          </label>

          <label className="meta-row">
            <span className="meta-label">Link</span>
            <input
              className="inline-input link-input"
              type="url"
              value={draft.link}
              onChange={(e) => set("link", e.target.value)}
            />
            {draft.link && (
              <a href={draft.link} target="_blank" rel="noreferrer" className="open-link">
                ↗
              </a>
            )}
          </label>

          <label className="meta-row">
            <span className="meta-label">Notes</span>
            <input
              className="inline-input"
              type="text"
              placeholder="Status update or notes…"
              value={draft.statusUpdate}
              onChange={(e) => set("statusUpdate", e.target.value)}
            />
          </label>
        </div>

        <div className="modal-section">
          <p className="section-label">Job Description</p>
          <textarea
            className="jd-textarea"
            placeholder="Paste or write the job description here…"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="modal-footer">
          <button className="btn-danger" onClick={handleDelete}>Delete</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
