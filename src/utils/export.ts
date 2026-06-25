import type { Job } from "../types/job";

const HEADERS = [
  "Company", "Job Title", "Location", "Remote", "Salary",
  "Link", "Application Date", "Status", "Notes", "Last Updated", "Job Description",
];

function cell(value: string) {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
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
        j.company, j.title, j.location ?? "", j.workType ?? "", j.salary ?? "",
        j.link, formatDate(j.applicationDate),
        j.status, j.statusUpdate, formatDate(j.lastUpdated), j.description,
      ].map(cell).join(",")
    ),
  ].join("\r\n");

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
