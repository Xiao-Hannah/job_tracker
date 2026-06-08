import type { Job } from "../types/job";

const HEADERS = [
  "Company",
  "Job Title",
  "Link",
  "Application Date",
  "Status",
  "Notes",
  "Last Updated",
  "Job Description",
];

function cell(value: string) {
  // Escape double-quotes and wrap in quotes so commas / newlines inside are safe.
  return `"${value.replace(/"/g, '""')}"`;
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US");
}

export function downloadCSV(jobs: Job[]) {
  const rows = [
    HEADERS.map(cell).join(","),
    ...jobs.map((j) =>
      [
        j.company,
        j.title,
        j.link,
        formatDate(j.applicationDate),
        j.status,
        j.statusUpdate,
        formatDate(j.lastUpdated),
        j.description,
      ]
        .map(cell)
        .join(",")
    ),
  ].join("\r\n");

  // BOM so Excel opens UTF-8 correctly without garbled characters
  const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: `job-applications-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
