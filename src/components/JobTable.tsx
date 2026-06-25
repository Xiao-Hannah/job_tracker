import type { Job, JobStatus } from "../types/job";
import { StatusBadge } from "./StatusBadge";

const ALL_STATUSES: JobStatus[] = [
  "Saved", "Applied", "Interviewing", "Rejected", "Offer", "Withdrawn",
];

interface Props {
  jobs: Job[];
  onRowClick: (job: Job) => void;
  onStatusChange: (id: string, status: JobStatus) => void;
  onNoteChange: (id: string, note: string) => void;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function needsFollowUp(job: Job): boolean {
  if (job.status !== "Interviewing" || !job.interviewDate) return false;
  const ms = Date.now() - new Date(job.interviewDate + "T00:00:00").getTime();
  return ms > 7 * 24 * 60 * 60 * 1000;
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
            <th>Location</th>
            <th>Salary</th>
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
              className={`job-row${needsFollowUp(job) ? " follow-up-row" : ""}`}
              onClick={() => onRowClick(job)}
            >
              <td className="cell-company">{job.company || <span className="placeholder">—</span>}</td>
              <td className="cell-title">{job.title || <span className="placeholder">—</span>}</td>
              <td className="cell-location">
                {job.location ? (
                  <span>
                    {job.location}
                    {job.workType && <span className="remote-tag">{job.workType}</span>}
                  </span>
                ) : job.workType ? (
                  <span className="remote-tag">{job.workType}</span>
                ) : (
                  <span className="placeholder">—</span>
                )}
              </td>
              <td className="cell-salary">
                {job.salary || <span className="placeholder">—</span>}
              </td>
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
              <td className="cell-date">
                {formatDate(job.applicationDate)}
                {needsFollowUp(job) && <span className="follow-up-tag" title="Interviewed 7+ days ago — no update">↻</span>}
              </td>
              <td
                className="cell-status"
                onClick={(e) => e.stopPropagation()}
              >
                <select
                  className="status-inline-select"
                  value={job.status}
                  onChange={(e) => onStatusChange(job.id, e.target.value as JobStatus)}
                >
                  {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
