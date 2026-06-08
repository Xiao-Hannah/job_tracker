import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { extractJob } from "./extract.js";
import { getAllJobs, createJob, updateJob, deleteJob } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = 3001;

app.use(cors({ origin: "http://localhost:5173" }));
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

// ── Extraction ─────────────────────────────────────────────────────────────

app.post("/api/extract-job", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    new URL(url); // validate
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  try {
    const result = await extractJob(url);
    res.json(result);
  } catch (err) {
    console.error("Extraction error:", err);
    res.status(500).json({
      company: "",
      title: "",
      description: "",
      source: "failed",
      confidence: "low",
      warning: "Internal extraction error.",
    });
  }
});

// ── Serve built frontend in production ────────────────────────────────────

const distPath = join(__dirname, "../dist");
if (existsSync(distPath)) {
  const { default: sirv } = await import("sirv");
  app.use(sirv(distPath, { single: true }));
}

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
