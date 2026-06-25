import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { extractJob } from "./extract.js";
import { getAllJobs, createJob, updateJob, deleteJob } from "./db.js";
import {
  isGmailConfigured, isGmailAuthorized,
  getAuthUrl, handleOAuthCallback, scanGmail,
  type GmailStatus,
} from "./gmail.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = 3001;

// Allow the React dev server AND any Chrome extension to call the API
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin === "http://localhost:5173" || origin.startsWith("chrome-extension://")) {
      cb(null, true);
    } else {
      cb(new Error("CORS: origin not allowed"));
    }
  },
}));
app.use(express.json({ limit: "2mb" }));

// ── Jobs CRUD ──────────────────────────────────────────────────────────────

app.get("/api/jobs", async (_req, res) => {
  try {
    res.json(await getAllJobs());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load jobs" });
  }
});

app.post("/api/jobs", async (req, res) => {
  try {
    const job = await createJob(req.body);
    res.status(201).json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

app.put("/api/jobs/:id", async (req, res) => {
  try {
    const job = await updateJob(req.params.id, req.body);
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update job" });
  }
});

app.delete("/api/jobs/:id", async (req, res) => {
  try {
    const ok = await deleteJob(req.params.id);
    if (!ok) { res.status(404).json({ error: "Job not found" }); return; }
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete job" });
  }
});

// ── Manual add (used by the Chrome extension) ─────────────────────────────
// Accepts pre-scraped data: skips the extraction step entirely.

app.post("/api/jobs/manual", async (req, res) => {
  try {
    const b = req.body as Partial<{
      id: string; company: string; title: string; description: string;
      link: string; location: string; salary: string; workType: string;
      applicationDate: string; status: string; statusUpdate: string;
    }>;

    if (!b.company && !b.title && !b.link) {
      res.status(400).json({ error: "Provide at least one of: company, title, link" });
      return;
    }

    const now = new Date().toISOString();
    const job = await createJob({
      id:              b.id              ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      company:         b.company         ?? "",
      title:           b.title           ?? "",
      description:     b.description     ?? "",
      link:            b.link            ?? "",
      location:        b.location        ?? "",
      salary:          b.salary          ?? "",
      workType:        b.workType        ?? "",
      applicationDate: b.applicationDate ?? now.slice(0, 10),
      status:          (b.status as any) ?? "Applied",
      statusUpdate:    b.statusUpdate    ?? "",
      lastUpdated:     now,
      extractionSource: "extension",
    });
    res.status(201).json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

// ── Extraction ─────────────────────────────────────────────────────────────

app.post("/api/extract-job", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" }); return;
  }
  try { new URL(url); } catch {
    res.status(400).json({ error: "Invalid URL" }); return;
  }
  try {
    res.json(await extractJob(url));
  } catch (err) {
    console.error("Extraction error:", err);
    res.status(500).json({
      company: "", title: "", description: "", location: "", salary: "", workType: "",
      source: "failed", confidence: "low", warning: "Internal extraction error.",
    });
  }
});

// ── Gmail OAuth ────────────────────────────────────────────────────────────

app.get("/api/gmail/status", (_req, res) => {
  res.json({ configured: isGmailConfigured(), authorized: isGmailAuthorized() });
});

app.get("/api/gmail/auth", (_req, res) => {
  if (!isGmailConfigured()) {
    res.status(400).send(
      "Gmail not configured.<br>Save your OAuth credentials to <code>data/gmail_credentials.json</code>.<br>" +
      "See <code>server/gmail.ts</code> for setup instructions."
    );
    return;
  }
  res.redirect(getAuthUrl());
});

app.get("/api/gmail/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send("No code in callback"); return; }
  try {
    await handleOAuthCallback(code);
    res.send("Gmail authorised! You can close this tab. Status updates will run every hour.");
  } catch (e) {
    res.status(500).send("Token exchange failed: " + String(e));
  }
});

// ── Gmail hourly background scan ───────────────────────────────────────────

async function runGmailScan() {
  if (!isGmailAuthorized()) return;
  try {
    const jobs    = await getAllJobs();
    const active  = jobs.filter((j) => j.status === "Applied" || j.status === "Interviewing");
    const companies = [...new Set(active.map((j) => j.company).filter(Boolean))];
    if (!companies.length) return;

    const updates = await scanGmail(companies);
    for (const { company, status } of updates) {
      // Status escalation rules — never downgrade a status
      const canUpdate = (current: string, next: GmailStatus) => {
        if (next === "Offer")        return current !== "Offer";
        if (next === "Rejected")     return current === "Applied" || current === "Interviewing";
        if (next === "Interviewing") return current === "Applied" || current === "Saved";
        return false;
      };
      const matches = jobs.filter(
        (j) => j.company.toLowerCase() === company.toLowerCase() && canUpdate(j.status, status)
      );
      for (const j of matches) {
        await updateJob(j.id, { status, lastUpdated: new Date().toISOString() });
        console.log(`[Gmail] ${j.company}: ${j.status} → ${status}`);
      }
    }
  } catch (e) {
    console.error("[Gmail] scan error:", e);
  }
}

setInterval(runGmailScan, 60 * 60 * 1000);

// ── Serve built frontend ───────────────────────────────────────────────────

const distPath = join(__dirname, "../dist");
if (existsSync(distPath)) {
  const { default: sirv } = await import("sirv");
  app.use(sirv(distPath, { single: true }));
}

app.listen(PORT, () => {
  console.log(`API server on http://localhost:${PORT}`);
  if (isGmailConfigured()) {
    if (isGmailAuthorized()) {
      console.log("[Gmail] Authorised — hourly scan active.");
    } else {
      console.log(`[Gmail] Credentials found but not authorised. Visit http://localhost:${PORT}/api/gmail/auth`);
    }
  }
});
