import { useState } from "react";

type Mode = "url" | "paste";

interface PasteData {
  company: string;
  title: string;
  link: string;
  description: string;
}

interface Props {
  onExtract: (url: string) => Promise<void>;
  onPaste: (data: PasteData) => void;
  loading: boolean;
}

export function AddJobForm({ onExtract, onPaste, loading }: Props) {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl]   = useState("");
  const [paste, setPaste] = useState<PasteData>({
    company: "", title: "", link: "", description: "",
  });

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    await onExtract(trimmed);
    setUrl("");
  }

  function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    onPaste(paste);
    setPaste({ company: "", title: "", link: "", description: "" });
  }

  return (
    <div className="add-job-form">
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === "url" ? "active" : ""}`}
          type="button"
          onClick={() => setMode("url")}
        >
          🔗 Extract from link
        </button>
        <button
          className={`mode-tab ${mode === "paste" ? "active" : ""}`}
          type="button"
          onClick={() => setMode("paste")}
        >
          📋 Paste JD manually
        </button>
      </div>

      {mode === "url" ? (
        <form className="add-form" onSubmit={handleUrlSubmit}>
          <input
            className="url-input"
            type="url"
            placeholder="Paste a job posting URL…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            required
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <span className="loading-row"><span className="spinner" />Extracting…</span>
            ) : (
              "Extract"
            )}
          </button>
        </form>
      ) : (
        <form className="paste-form" onSubmit={handlePasteSubmit}>
          <div className="paste-meta-row">
            <input
              className="paste-meta-input"
              type="text"
              placeholder="Company name"
              value={paste.company}
              onChange={(e) => setPaste((p) => ({ ...p, company: e.target.value }))}
            />
            <input
              className="paste-meta-input"
              type="text"
              placeholder="Job title"
              value={paste.title}
              onChange={(e) => setPaste((p) => ({ ...p, title: e.target.value }))}
            />
            <input
              className="paste-meta-input link-field"
              type="url"
              placeholder="Job link (optional)"
              value={paste.link}
              onChange={(e) => setPaste((p) => ({ ...p, link: e.target.value }))}
            />
          </div>
          <textarea
            className="jd-paste-textarea"
            placeholder="Paste the full job description here…"
            value={paste.description}
            onChange={(e) => setPaste((p) => ({ ...p, description: e.target.value }))}
            required
          />
          <div className="paste-form-footer">
            <button className="btn-primary" type="submit">
              Review & Save
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
