import type { Job } from "../types/job";

// All persistence now lives in the SQLite backend.
// These helpers are thin fetch wrappers so App.tsx stays readable.

export async function apiFetchJobs(): Promise<Job[]> {
  const res = await fetch("/api/jobs");
  if (!res.ok) throw new Error("Failed to load jobs from server");
  return res.json();
}

export async function apiCreateJob(job: Job): Promise<Job> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });
  if (!res.ok) throw new Error("Failed to save job");
  return res.json();
}

export async function apiUpdateJob(id: string, patch: Partial<Job>): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update job");
  return res.json();
}

export async function apiDeleteJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete job");
}

// ── One-time migration from localStorage ──────────────────────────────────
// If the user had data from the old localStorage version, push it to SQLite
// on first load and then clear the old key.

export async function migrateFromLocalStorage(): Promise<number> {
  const raw = localStorage.getItem("job_tracker_v1");
  if (!raw) return 0;
  try {
    const jobs: Job[] = JSON.parse(raw);
    if (!jobs.length) { localStorage.removeItem("job_tracker_v1"); return 0; }
    await Promise.all(jobs.map((j) => apiCreateJob(j)));
    localStorage.removeItem("job_tracker_v1");
    return jobs.length;
  } catch {
    return 0;
  }
}
