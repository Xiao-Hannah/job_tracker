import { useState, useEffect, useCallback, useRef } from "react";
import { AddJobForm } from "./components/AddJobForm";
import { PreviewModal } from "./components/PreviewModal";
import { SearchFilter, type StatusFilterOption } from "./components/SearchFilter";
import { JobTable } from "./components/JobTable";
import { JobModal } from "./components/JobModal";
import type { Job, JobStatus, ExtractionSource } from "./types/job";
import {
  apiFetchJobs, apiCreateJob, apiUpdateJob, apiDeleteJob,
  migrateFromLocalStorage,
} from "./utils/storage";
import { downloadCSV } from "./utils/export";
import "./App.css";

function today()  { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface PendingPreview {
  draft: Partial<Job>;
  source: ExtractionSource;
  warning?: string;
}

export default function App() {
  const [jobs, setJobs]             = useState<Job[]>([]);
  const [dbReady, setDbReady]       = useState(false);
  const [dbError, setDbError]       = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("All");
  const [selectedJob, setSelectedJob]   = useState<Job | null>(null);
  const [preview, setPreview]       = useState<PendingPreview | null>(null);

  const noteTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const statusTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    apiFetchJobs()
      .then(async (data) => {
        if (data.length === 0) await migrateFromLocalStorage();
        return data.length === 0 ? apiFetchJobs() : data;
      })
      .then((data) => { setJobs(data); setDbReady(true); })
      .catch(() => setDbError(true));
  }, []);

  // ── URL extraction ────────────────────────────────────────────────────────
  async function handleExtract(url: string) {
    setExtracting(true);
    try {
      const res  = await fetch("/api/extract-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setPreview({
        draft: {
          company:     data.company     || "",
          title:       data.title       || "",
          description: data.description || "",
          link:        url,
          location:    data.location    || "",
          salary:      data.salary      || "",
          workType:    data.workType    || "",
          applicationDate: today(),
          status:      "Applied",
          statusUpdate: "",
          extractionSource: data.source,
        },
        source:  data.source  as ExtractionSource,
        warning: data.warning as string | undefined,
      });
    } catch {
      setPreview({
        draft: { link: url, applicationDate: today(), status: "Applied", statusUpdate: "" },
        source: "failed",
        warning: "Could not reach the extraction server.",
      });
    } finally {
      setExtracting(false);
    }
  }

  // ── Manual paste ──────────────────────────────────────────────────────────
  function handlePaste(data: { company: string; title: string; link: string; description: string }) {
    setPreview({
      draft: {
        company: data.company, title: data.title,
        description: data.description, link: data.link,
        applicationDate: today(), status: "Applied",
        statusUpdate: "", extractionSource: "manual",
      },
      source: "manual",
    });
  }

  // ── Confirm preview → persist ─────────────────────────────────────────────
  async function handleConfirmPreview(draft: Partial<Job>) {
    const job: Job = {
      id:              makeId(),
      company:         draft.company         ?? "",
      title:           draft.title           ?? "",
      description:     draft.description     ?? "",
      link:            draft.link            ?? "",
      location:        draft.location        ?? "",
      salary:          draft.salary          ?? "",
      workType:        draft.workType        ?? "",
      applicationDate: draft.applicationDate ?? today(),
      status:          draft.status          ?? "Applied",
      statusUpdate:    draft.statusUpdate    ?? "",
      lastUpdated:     nowIso(),
      extractionSource: draft.extractionSource,
    };
    setJobs((prev) => [job, ...prev]);
    setPreview(null);
    try {
      await apiCreateJob(job);
    } catch {
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
    }
  }

  // ── Inline status change ──────────────────────────────────────────────────
  const handleStatusChange = useCallback((id: string, status: JobStatus) => {
    const ts = nowIso();
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status, lastUpdated: ts } : j));
    const existing = statusTimers.current.get(id);
    if (existing) clearTimeout(existing);
    statusTimers.current.set(id, setTimeout(() => {
      apiUpdateJob(id, { status, lastUpdated: ts });
      statusTimers.current.delete(id);
    }, 400));
  }, []);

  // ── Inline note change ────────────────────────────────────────────────────
  const handleNoteChange = useCallback((id: string, note: string) => {
    const ts = nowIso();
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, statusUpdate: note, lastUpdated: ts } : j));
    const existing = noteTimers.current.get(id);
    if (existing) clearTimeout(existing);
    noteTimers.current.set(id, setTimeout(() => {
      apiUpdateJob(id, { statusUpdate: note, lastUpdated: ts });
      noteTimers.current.delete(id);
    }, 800));
  }, []);

  // ── Modal save ────────────────────────────────────────────────────────────
  async function handleSaveJob(updated: Job) {
    setJobs((prev) => prev.map((j) => j.id === updated.id ? updated : j));
    setSelectedJob(null);
    await apiUpdateJob(updated.id, updated);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDeleteJob(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setSelectedJob(null);
    await apiDeleteJob(id);
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || j.company.toLowerCase().includes(q) || j.title.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (statusFilter === "All") return true;
    if (statusFilter === "needs-follow-up") {
      if (j.status !== "Interviewing" || !j.interviewDate) return false;
      return Date.now() - new Date(j.interviewDate + "T00:00:00").getTime() > SEVEN_DAYS_MS;
    }
    return j.status === statusFilter;
  });

  if (dbError) {
    return (
      <div className="app">
        <div className="db-error">
          <p className="db-error-title">Could not connect to the database</p>
          <p className="db-error-body">
            Make sure the backend server is running:<br />
            <code>npm run dev</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">📋</span>
            <span className="logo-text">Job Tracker</span>
          </div>
          <button
            className="btn-export"
            onClick={() => downloadCSV(jobs)}
            disabled={jobs.length === 0}
            title="Download all applications as CSV"
          >
            Export CSV
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="add-section">
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">
            Extract from a job link or paste the description manually.
          </p>
          <AddJobForm onExtract={handleExtract} onPaste={handlePaste} loading={extracting} />
        </section>

        <section className="table-section">
          <SearchFilter
            search={search}
            statusFilter={statusFilter}
            onSearchChange={setSearch}
            onStatusChange={setStatusFilter}
            total={filtered.length}
          />
          {!dbReady ? (
            <div className="loading-state">Loading…</div>
          ) : (
            <JobTable
              jobs={filtered}
              onRowClick={setSelectedJob}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
            />
          )}
        </section>
      </main>

      {preview && (
        <PreviewModal
          draft={preview.draft}
          source={preview.source}
          warning={preview.warning}
          onSave={handleConfirmPreview}
          onCancel={() => setPreview(null)}
        />
      )}

      {selectedJob && (
        <JobModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onSave={handleSaveJob}
          onDelete={handleDeleteJob}
        />
      )}
    </div>
  );
}
