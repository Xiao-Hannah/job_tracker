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
  jobs: Job[];
  onRowClick: (job: Job) => void;
  onStatusChange: (id: string, status: JobStatus) => void;
  onNoteChange: (id: string, note: string) => void;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  // applicationDate is YYYY-MM-DD; lastUpdated is full ISO
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function JobTable({ jobs, onRowClick, onStatusChange, onNoteChange }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="empty-state">
        <p>No applications yet. Paste a job link above to get started.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="job-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Job Title</th>
            <th>Link</th>
            <th>Applied</th>
            <th>Status</th>
            <th>Notes</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className="job-row"
              onClick={() => onRowClick(job)}
            >
              <td className="cell-company">{job.company || <span className="placeholder">—</span>}</td>
              <td className="cell-title">{job.title || <span className="placeholder">—</span>}</td>
              <td
                className="cell-link"
                onClick={(e) => e.stopPropagation()}
              >
                {job.link ? (
                  <a href={job.link} target="_blank" rel="noreferrer" title={job.link}>
                    View ↗
                  </a>
                ) : "—"}
              </td>
              <td className="cell-date">{formatDate(job.applicationDate)}</td>
              <td
                className="cell-status"
                onClick={(e) => e.stopPropagation()}
              >
                <select
                  className="status-inline-select"
                  value={job.status}
                  onChange={(e) => onStatusChange(job.id, e.target.value as JobStatus)}
                  style={{ cursor: "pointer" }}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <StatusBadge status={job.status} />
              </td>
              <td
                className="cell-note"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  className="note-input"
                  type="text"
                  placeholder="Add note…"
                  value={job.statusUpdate}
                  onChange={(e) => onNoteChange(job.id, e.target.value)}
                />
              </td>
              <td className="cell-updated">{formatDate(job.lastUpdated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
