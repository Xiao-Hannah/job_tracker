import type { JobStatus } from "../types/job";

const colors: Record<JobStatus, { bg: string; text: string }> = {
  Saved:        { bg: "#f1f1ef", text: "#6b7280" },
  Applied:      { bg: "#dbeafe", text: "#1d4ed8" },
  Interviewing: { bg: "#fef3c7", text: "#b45309" },
  Rejected:     { bg: "#fee2e2", text: "#dc2626" },
  Offer:        { bg: "#d1fae5", text: "#065f46" },
  Withdrawn:    { bg: "#ede9fe", text: "#6d28d9" },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { bg, text } = colors[status];
  return (
    <span
      style={{
        background: bg,
        color: text,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}
