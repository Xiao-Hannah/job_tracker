import { createClient } from "@libsql/client";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Job } from "../src/types/job.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = createClient({ url: `file:${join(DATA_DIR, "jobs.db")}` });

// ── Schema ─────────────────────────────────────────────────────────────────

await db.execute(`
  CREATE TABLE IF NOT EXISTS jobs (
    id               TEXT PRIMARY KEY,
    company          TEXT NOT NULL DEFAULT '',
    title            TEXT NOT NULL DEFAULT '',
    description      TEXT NOT NULL DEFAULT '',
    link             TEXT NOT NULL DEFAULT '',
    application_date TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'Applied',
    status_update    TEXT NOT NULL DEFAULT '',
    last_updated     TEXT NOT NULL DEFAULT '',
    extraction_source TEXT
  )
`);

// ── Row ↔ Job ──────────────────────────────────────────────────────────────

function toJob(row: Record<string, any>): Job {
  return {
    id:              String(row.id),
    company:         String(row.company  ?? ""),
    title:           String(row.title    ?? ""),
    description:     String(row.description ?? ""),
    link:            String(row.link     ?? ""),
    applicationDate: String(row.application_date ?? ""),
    status:          (row.status ?? "Applied") as Job["status"],
    statusUpdate:    String(row.status_update ?? ""),
    lastUpdated:     String(row.last_updated  ?? ""),
    extractionSource: row.extraction_source ?? undefined,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function getAllJobs(): Promise<Job[]> {
  const res = await db.execute("SELECT * FROM jobs ORDER BY last_updated DESC");
  return res.rows.map(toJob);
}

export async function createJob(job: Job): Promise<Job> {
  await db.execute({
    sql: `INSERT INTO jobs
            (id, company, title, description, link,
             application_date, status, status_update, last_updated, extraction_source)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      job.id, job.company, job.title, job.description, job.link,
      job.applicationDate, job.status, job.statusUpdate, job.lastUpdated,
      job.extractionSource ?? null,
    ],
  });
  return job;
}

export async function updateJob(id: string, patch: Partial<Job>): Promise<Job | null> {
  // Read-modify-write so callers only need to send changed fields
  const existing = await db.execute({ sql: "SELECT * FROM jobs WHERE id = ?", args: [id] });
  if (!existing.rows.length) return null;
  const current = toJob(existing.rows[0] as any);
  const merged  = { ...current, ...patch };

  await db.execute({
    sql: `UPDATE jobs SET
            company = ?, title = ?, description = ?, link = ?,
            application_date = ?, status = ?, status_update = ?,
            last_updated = ?, extraction_source = ?
          WHERE id = ?`,
    args: [
      merged.company, merged.title, merged.description, merged.link,
      merged.applicationDate, merged.status, merged.statusUpdate,
      merged.lastUpdated, merged.extractionSource ?? null,
      id,
    ],
  });
  return merged;
}

export async function deleteJob(id: string): Promise<boolean> {
  const res = await db.execute({ sql: "DELETE FROM jobs WHERE id = ?", args: [id] });
  return (res.rowsAffected ?? 0) > 0;
}
