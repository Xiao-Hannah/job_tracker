import type { JobStatus } from "../types/job";

export type StatusFilterOption = JobStatus | "All" | "needs-follow-up";

const ALL_STATUSES: JobStatus[] = [
  "Saved", "Applied", "Interviewing", "Rejected", "Offer", "Withdrawn",
];

interface Props {
  search: string;
  statusFilter: StatusFilterOption;
  onSearchChange: (v: string) => void;
  onStatusChange: (v: StatusFilterOption) => void;
  total: number;
}

export function SearchFilter({ search, statusFilter, onSearchChange, onStatusChange, total }: Props) {
  return (
    <div className="search-filter-bar">
      <input
        className="search-input"
        type="text"
        placeholder="Search company or title…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className="status-select"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as StatusFilterOption)}
      >
        <option value="All">All statuses</option>
        {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value="needs-follow-up">Needs follow-up</option>
      </select>
      <span className="record-count">{total} application{total !== 1 ? "s" : ""}</span>
    </div>
  );
}
