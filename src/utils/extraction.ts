export interface ExtractedJob {
  company: string;
  title: string;
  description: string;
}

// Noise words that appear in page <title> tags but aren't job titles or companies.
const NOISE = new Set([
  "jobs", "careers", "job", "career", "apply", "application",
  "opening", "position", "opportunities", "opportunity", "listings",
  "hiring", "recruit", "recruitment", "work", "employment",
]);

// Separators used in "<Job Title> | <Company>" style page titles.
const TITLE_SEPS = [" | ", " – ", " — ", " - ", " · ", " at ", " @ "];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Heuristic from URL only (fast, no network) ─────────────────────────────
function urlHeuristic(url: string): ExtractedJob {
  const result: ExtractedJob = { company: "", title: "", description: "" };
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    // Known job boards where the domain ≠ the hiring company
    const genericBoards = new Set([
      "linkedin.com", "greenhouse.io", "lever.co", "workday.com",
      "myworkdayjobs.com", "icims.com", "smartrecruiters.com", "jobvite.com",
      "taleo.net", "bamboohr.com", "ashbyhq.com", "wellfound.com",
      "indeed.com", "glassdoor.com", "ziprecruiter.com",
    ]);

    if (!genericBoards.has(host)) {
      const domainParts = host.split(".");
      if (domainParts.length >= 2) {
        result.company = capitalize(domainParts[domainParts.length - 2]);
      }
    }

    // Grab the first path segment that looks like a title slug
    const titleSlug = pathParts.find(
      (p) =>
        p.length > 4 &&
        !/^\d+$/.test(p) &&
        !NOISE.has(p.toLowerCase())
    );
    if (titleSlug) {
      result.title = titleSlug
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  } catch {
    // malformed URL
  }
  return result;
}

// ── Parse raw HTML for title + company ────────────────────────────────────
function parseHtml(html: string, fallback: ExtractedJob): ExtractedJob {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const meta = (name: string) =>
    doc.querySelector(`meta[property="${name}"]`)?.getAttribute("content")?.trim() ||
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() ||
    "";

  const ogTitle    = meta("og:title");
  const ogSite     = meta("og:site_name");
  const twTitle    = meta("twitter:title");
  const pageTitle  = doc.querySelector("title")?.textContent?.trim() ?? "";
  const h1         = doc.querySelector("h1")?.textContent?.trim() ?? "";

  // Pick the richest title source
  const raw = ogTitle || twTitle || pageTitle || h1;

  let title   = "";
  let company = ogSite || fallback.company;

  if (raw) {
    // Try to split "Job Title | Company" style
    let split: string[] | null = null;
    for (const sep of TITLE_SEPS) {
      if (raw.includes(sep)) {
        split = raw.split(sep).map((s) => s.trim()).filter(Boolean);
        break;
      }
    }

    if (split && split.length >= 2) {
      // Determine which side is the job title.
      // Heuristic: the company name is usually shorter and noise-free.
      // If the last segment looks like a company name (short, no interior spaces
      // that would suggest a job title), prefer it as company.
      const first = split[0];
      const last  = split[split.length - 1];

      // If og:site_name matches one of the parts, that's the company.
      if (ogSite && last.toLowerCase().includes(ogSite.toLowerCase())) {
        title   = first;
        company = last;
      } else if (ogSite && first.toLowerCase().includes(ogSite.toLowerCase())) {
        title   = last;
        company = first;
      } else {
        // Default: first part = job title, last part = company
        title   = first;
        company = ogSite || last;
      }
    } else {
      title = raw;
    }
  }

  // Strip residual site-name suffix from title (e.g. "Engineer – Careers – Acme")
  if (company) {
    title = title.replace(new RegExp(`[–\\-|·]?\\s*${escapeRegex(company)}\\s*$`, "i"), "").trim();
  }

  // Clean up noise-only titles
  if (NOISE.has(title.toLowerCase())) title = "";

  return {
    company: company || fallback.company,
    title:   title   || fallback.title,
    description: "",
  };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Main export ────────────────────────────────────────────────────────────
export async function extractFromUrl(url: string): Promise<ExtractedJob> {
  const fallback = urlHeuristic(url);

  try {
    // allorigins proxies the request server-side, bypassing browser CORS.
    // Works for SSR / static job pages. JavaScript-rendered SPAs return sparse HTML.
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return fallback;

    const json = await res.json();
    const html: string = json.contents ?? "";
    if (!html || html.length < 200) return fallback;

    return parseHtml(html, fallback);
  } catch {
    // Proxy timeout, network error, or CSP block — fall back to URL heuristics
    return fallback;
  }

  // ── BACKEND HOOK ──────────────────────────────────────────────────────────
  // Replace the block above with a call to your own scraper for better accuracy:
  //
  // const res = await fetch("/api/scrape", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ url }),
  // });
  // if (res.ok) return res.json(); // { company, title, description }
  // return fallback;
  // ─────────────────────────────────────────────────────────────────────────
}
