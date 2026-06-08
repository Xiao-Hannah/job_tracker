import { parse } from "node-html-parser";

export type ExtractionSource = "json-ld" | "opengraph" | "html" | "manual" | "failed";
export type ExtractionConfidence = "high" | "medium" | "low";

export interface ExtractResult {
  company: string;
  title: string;
  description: string;
  source: ExtractionSource;
  confidence: ExtractionConfidence;
  warning?: string;
}

// ── HTML → plain text ──────────────────────────────────────────────────────
// IMPORTANT: entities are decoded FIRST so &lt;h2&gt; becomes <h2> before
// the tag-stripping pass runs — otherwise encoded tags survive unstripped.

function htmlToText(html: string): string {
  if (!html) return "";

  // 1. Decode entities so encoded tags become real tags
  let t = html
    .replace(/&lt;/g,  "<")
    .replace(/&gt;/g,  ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

  // 2. Block-level tags → newlines / bullets
  t = t
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|blockquote|header|main|aside)\s*[^>]*>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(ul|ol|table|tbody|tr)\s*>/gi, "\n");

  // 3. Strip every remaining tag
  t = t.replace(/<[^>]+>/g, "");

  // 4. Normalise whitespace
  return t
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Known-blocked / always-JS-rendered domains (skip fetch, fail fast) ─────

const BLOCKED_DOMAINS: Record<string, string> = {
  "linkedin.com":   "LinkedIn requires login and blocks server requests. Use 'Paste JD manually'.",
  "indeed.com":     "Indeed blocks server requests. Use 'Paste JD manually'.",
  "glassdoor.com":  "Glassdoor blocks server requests. Use 'Paste JD manually'.",
};

const JS_RENDERED_DOMAINS: Record<string, string> = {
  "myworkdayjobs.com": "Workday is JavaScript-rendered and can't be scraped server-side. Use 'Paste JD manually'.",
  "workdayjobs.com":   "Workday is JavaScript-rendered and can't be scraped server-side. Use 'Paste JD manually'.",
  "taleo.net":         "Taleo requires login. Use 'Paste JD manually'.",
  "icims.com":         "iCIMS requires login. Use 'Paste JD manually'.",
  "ziprecruiter.com":  "ZipRecruiter blocks server requests. Use 'Paste JD manually'.",
};

function quickFail(url: string): ExtractResult | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, warning] of Object.entries(BLOCKED_DOMAINS)) {
      if (host === domain || host.endsWith("." + domain)) {
        return { company: "", title: "", description: "", source: "failed", confidence: "low", warning };
      }
    }
    for (const [domain, warning] of Object.entries(JS_RENDERED_DOMAINS)) {
      if (host === domain || host.endsWith("." + domain)) {
        return { company: "", title: "", description: "", source: "failed", confidence: "low", warning };
      }
    }
  } catch { /* bad URL */ }
  return null;
}

// ── Domain → company fallback ──────────────────────────────────────────────

const BOARD_HOSTS = new Set([
  "greenhouse.io", "boards.greenhouse.io", "job-boards.greenhouse.io",
  "lever.co", "jobs.lever.co",
  "ashbyhq.com", "jobs.ashbyhq.com",
  "bamboohr.com", "wellfound.com", "smartrecruiters.com", "jobvite.com",
]);

function companyFromDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (BOARD_HOSTS.has(host)) return "";
    const parts = host.split(".");
    const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { return ""; }
}

// ── Fetch helpers ──────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getHtml(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
    });
    return { ok: res.ok, status: res.status, html: await res.text() };
  } finally { clearTimeout(t); }
}

async function getJson(url: string, init: RequestInit = {}): Promise<any> {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA },
      ...init,
    });
    return res.ok ? res.json() : null;
  } finally { clearTimeout(t); }
}

// ─────────────────────────────────────────────────────────────────────────
// Platform APIs
// ─────────────────────────────────────────────────────────────────────────

// ── Greenhouse ─────────────────────────────────────────────────────────────
// Supported URL patterns:
//   https://boards.greenhouse.io/{company}/jobs/{id}
//   https://job-boards.greenhouse.io/{company}/jobs/{id}
//   https://*.greenhouse.io/{company}/jobs/{id}
//   https://example.com/careers?gh_jid={id}   ← embedded Greenhouse

function parseGreenhouse(url: string): { company: string; jobId: string } | null {
  try {
    const u = new URL(url);
    // Embedded via ?gh_jid= param on any domain — job board slug is the domain name
    const ghJid = u.searchParams.get("gh_jid");
    if (ghJid) {
      const host = u.hostname.replace(/^www\./, "");
      const slug = host.split(".")[0]; // e.g. "stripe" from "stripe.com"
      return { company: slug, jobId: ghJid };
    }
    // greenhouse.io hosted boards
    if (u.hostname.includes("greenhouse.io")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const idx   = parts.indexOf("jobs");
      if (idx >= 1 && parts[idx + 1]) {
        return { company: parts[idx - 1], jobId: parts[idx + 1] };
      }
    }
    return null;
  } catch { return null; }
}

async function extractGreenhouse(company: string, jobId: string): Promise<ExtractResult | null> {
  const data = await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}?content=true`
  );
  if (!data?.title) return null;
  const description = data.content ? htmlToText(data.content) : "";
  return {
    company:    data.company_name || company,
    title:      data.title.trim(),
    description,
    source:     "json-ld",
    confidence: description ? "high" : "medium",
  };
}

// ── Ashby ──────────────────────────────────────────────────────────────────
// URL: https://jobs.ashbyhq.com/{company}/{uuid}

function parseAshby(url: string): { company: string; jobId: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("ashbyhq.com")) return null;
    const parts   = u.pathname.split("/").filter(Boolean);
    const company = parts[0];
    const jobId   = parts.find((p) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(p));
    return company && jobId ? { company, jobId } : null;
  } catch { return null; }
}

async function extractAshby(company: string, jobId: string): Promise<ExtractResult | null> {
  const data = await getJson("https://jobs.ashbyhq.com/api/non-user-graphql", {
    method: "POST",
    body: JSON.stringify({
      operationName: "ApiJobPosting",
      variables: { org: company, jobId },
      query: `query ApiJobPosting($org: String!, $jobId: String!) {
        jobPosting(organizationHostedJobsPageName: $org, jobPostingId: $jobId) {
          title descriptionHtml locationName
        }
      }`,
    }),
  });
  const posting = data?.data?.jobPosting;
  if (!posting?.title) return null;
  const description = posting.descriptionHtml ? htmlToText(posting.descriptionHtml) : "";
  return {
    company:    company.charAt(0).toUpperCase() + company.slice(1),
    title:      posting.title.trim(),
    description,
    source:     "json-ld",
    confidence: description ? "high" : "medium",
  };
}

// ── Lever ──────────────────────────────────────────────────────────────────
// URL: https://jobs.lever.co/{company}/{uuid}

function parseLever(url: string): { company: string; jobId: string } | null {
  try {
    const u     = new URL(url);
    if (!u.hostname.includes("lever.co")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const company = parts[0];
    const jobId   = parts.find((p) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(p));
    return company && jobId ? { company, jobId } : null;
  } catch { return null; }
}

async function extractLever(company: string, jobId: string): Promise<ExtractResult | null> {
  const data = await getJson(`https://api.lever.co/v0/postings/${company}/${jobId}`);
  if (!data?.text) return null;
  const description = [
    data.description     ? htmlToText(data.description)     : "",
    data.descriptionBody ? htmlToText(data.descriptionBody) : "",
    ...(data.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content ?? "")}`),
    data.additional      ? htmlToText(data.additional)      : "",
  ].filter(Boolean).join("\n\n");
  return {
    company:    data.company || company,
    title:      data.text.trim(),
    description,
    source:     "json-ld",
    confidence: description ? "high" : "medium",
  };
}

// ── BambooHR ───────────────────────────────────────────────────────────────
// URL: https://{company}.bamboohr.com/careers/{id}

function parseBamboo(url: string): { company: string; jobId: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("bamboohr.com")) return null;
    const company = u.hostname.split(".")[0];
    const parts   = u.pathname.split("/").filter(Boolean);
    const idPart  = parts.find((p) => /^\d+/.test(p));
    const jobId   = idPart?.match(/(\d+)/)?.[1];
    return company && jobId ? { company, jobId } : null;
  } catch { return null; }
}

async function extractBamboo(company: string, jobId: string): Promise<ExtractResult | null> {
  const data = await getJson(
    `https://${company}.bamboohr.com/careers/list?format=json`
  );
  if (!Array.isArray(data?.result)) return null;
  const job = data.result.find((j: any) => String(j.id) === jobId);
  if (!job?.jobOpeningName) return null;
  const html = await getHtml(`https://${company}.bamboohr.com/careers/${jobId}`);
  let description = "";
  if (html.ok) {
    const root = parse(html.html);
    const el   = root.querySelector(".BambooRich") || root.querySelector("[class*='job-description']");
    if (el) description = htmlToText(el.innerHTML);
  }
  return {
    company:    company.charAt(0).toUpperCase() + company.slice(1),
    title:      job.jobOpeningName.trim(),
    description,
    source:     "json-ld",
    confidence: description ? "high" : "medium",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Generic HTML extraction (JSON-LD → OG → HTML selectors)
// ─────────────────────────────────────────────────────────────────────────

const NOISE_TITLES = new Set([
  "careers", "jobs", "job", "career", "apply", "application",
  "job details", "job description", "opening", "position",
  "opportunities", "opportunity", "now hiring",
]);
const SEPS = [" | ", " – ", " — ", " - ", " · "];

function cleanTitle(raw: string, company = ""): string {
  let t = raw.trim();
  for (const sep of SEPS) {
    if (!t.includes(sep)) continue;
    const parts = t.split(sep).map((s) => s.trim());
    const last  = parts[parts.length - 1].toLowerCase();
    t = (NOISE_TITLES.has(last) || (company && last.includes(company.toLowerCase())))
      ? parts.slice(0, -1).join(sep).trim()
      : parts[0].trim();
    break;
  }
  t = t.replace(/\s+at\s+[\w\s]+$/i, "").trim();
  return NOISE_TITLES.has(t.toLowerCase()) ? "" : t;
}

function fromJsonLd(html: string): Partial<ExtractResult> {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw  = JSON.parse(m[1].trim());
      const all: any[] = Array.isArray(raw) ? raw : [raw];
      if (raw?.["@graph"]) all.push(...raw["@graph"]);
      const p = all.find((s) => s["@type"] === "JobPosting");
      if (!p?.title) continue;
      return {
        company:    p.hiringOrganization?.name ?? "",
        title:      String(p.title).trim(),
        description: p.description ? htmlToText(p.description) : "",
        source:     "json-ld",
        confidence: p.hiringOrganization?.name && p.description ? "high" : "medium",
      };
    } catch { continue; }
  }
  return {};
}

function fromOG(root: ReturnType<typeof parse>, company: string): Partial<ExtractResult> {
  const meta = (prop: string) =>
    root.querySelector(`meta[property="${prop}"]`)?.getAttribute("content")?.trim() ||
    root.querySelector(`meta[name="${prop}"]`)?.getAttribute("content")?.trim() || "";
  const raw     = meta("og:title") || meta("twitter:title") || root.querySelector("title")?.text?.trim() || "";
  const ogSite  = meta("og:site_name");
  const co      = ogSite || company;
  const title   = cleanTitle(raw, co);
  return title ? { company: co, title, description: "", source: "opengraph", confidence: co ? "medium" : "low" } : {};
}

const JD_SELECTORS = [
  '[data-automation="jobDescription"]', '[data-testid*="job-description"]',
  "#job-description", "#jobDescription", "#job-details", "#job_description",
  ".posting-description", ".job-description", ".job-details",
  '[class*="jobDescription"]', '[class*="job-detail"]',
  "main article", "article", "main",
];
const TITLE_SELECTORS = [
  '[data-automation="job-detail-title"]', '[data-testid*="job-title"]',
  ".posting-headline h2", ".job-title h1", "h1.title", ".title h1", "h1",
];

function fromHtml(root: ReturnType<typeof parse>, company: string): Partial<ExtractResult> {
  for (const s of ["script", "style", "nav", "header", "footer", "aside", "noscript"]) {
    root.querySelectorAll(s).forEach((el) => el.remove());
  }
  let title = "";
  for (const sel of TITLE_SELECTORS) {
    const t = root.querySelector(sel)?.text?.trim();
    if (t) { title = t; break; }
  }
  if (!title) title = cleanTitle(root.querySelector("title")?.text?.trim() ?? "", company);
  let description = "";
  for (const sel of JD_SELECTORS) {
    const el   = root.querySelector(sel);
    const text = el ? htmlToText(el.innerHTML || el.text) : "";
    if (text.length > 200) { description = text; break; }
  }
  return { company, title, description, source: "html", confidence: title && description ? "medium" : "low" };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

export async function extractJob(url: string): Promise<ExtractResult> {
  const domainCompany = companyFromDomain(url);

  // Fast-fail for known-blocked / JS-only sites
  const early = quickFail(url);
  if (early) return early;

  // Platform APIs (no HTML scraping needed)
  const gh = parseGreenhouse(url);
  if (gh) {
    try { const r = await extractGreenhouse(gh.company, gh.jobId); if (r) return r; } catch { /* fall through */ }
  }
  const ashby = parseAshby(url);
  if (ashby) {
    try { const r = await extractAshby(ashby.company, ashby.jobId); if (r) return r; } catch { /* fall through */ }
  }
  const lever = parseLever(url);
  if (lever) {
    try { const r = await extractLever(lever.company, lever.jobId); if (r) return r; } catch { /* fall through */ }
  }
  const bamboo = parseBamboo(url);
  if (bamboo) {
    try { const r = await extractBamboo(bamboo.company, bamboo.jobId); if (r) return r; } catch { /* fall through */ }
  }

  // Generic HTML fetch
  let html: string;
  try {
    const res = await getHtml(url);
    if (!res.ok) {
      return {
        company: domainCompany, title: "", description: "", source: "failed", confidence: "low",
        warning: `Site returned HTTP ${res.status}. Use 'Paste JD manually'.`,
      };
    }
    html = res.html;
  } catch (err: any) {
    return {
      company: domainCompany, title: "", description: "", source: "failed", confidence: "low",
      warning: err?.name === "AbortError"
        ? "Request timed out. Use 'Paste JD manually'."
        : "Could not reach the page. Use 'Paste JD manually'.",
    };
  }

  if (html.replace(/<[^>]+>/g, "").trim().length < 300) {
    return {
      company: domainCompany, title: "", description: "", source: "failed", confidence: "low",
      warning: "Page is JavaScript-rendered and can't be read server-side. Use 'Paste JD manually'.",
    };
  }

  const jld = fromJsonLd(html);
  if (jld.title) {
    const hd = fromHtml(parse(html), jld.company || domainCompany);
    return {
      company: jld.company || domainCompany, title: jld.title!,
      description: jld.description || hd.description || "",
      source: "json-ld", confidence: jld.confidence as ExtractionConfidence,
    };
  }

  const root = parse(html);
  const og   = fromOG(root, domainCompany);
  if (og.title) {
    const hd = fromHtml(parse(html), og.company || domainCompany);
    return {
      company: og.company || domainCompany, title: og.title!,
      description: hd.description || "",
      source: "opengraph", confidence: og.confidence as ExtractionConfidence,
    };
  }

  const hd = fromHtml(root, domainCompany);
  if (hd.title || hd.description) {
    return {
      company: hd.company || domainCompany, title: hd.title || "",
      description: hd.description || "",
      source: "html", confidence: hd.confidence as ExtractionConfidence,
      warning: "Extraction confidence is low — please review before saving.",
    };
  }

  return {
    company: domainCompany, title: "", description: "", source: "failed", confidence: "low",
    warning: "Could not extract job details. Use 'Paste JD manually'.",
  };
}
