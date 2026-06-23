(function () {
  "use strict";

  // Noise words that appear as Workday page titles or heading text but aren't job titles.
  const NOISE = new Set([
    "workday", "careers", "jobs", "job search", "search jobs",
    "all jobs", "career site", "job board", "career opportunities",
    "opportunities", "home", "apply",
  ]);

  function firstLine(el) {
    if (!el) return "";
    return (el.innerText || el.textContent || "").split("\n")[0].trim();
  }

  function scrapeWorkday() {
    // ── Company: from subdomain ─────────────────────────────────────────────
    const slug = window.location.hostname.split(".")[0];
    let company = slug.charAt(0).toUpperCase() + slug.slice(1);

    // Improve company name from logo alt text
    const logoImg = document.querySelector(
      'header img[alt], [class*="brand"] img[alt], [class*="logo"] img[alt]'
    );
    if (logoImg) {
      const alt = (logoImg.getAttribute("alt") || "").trim();
      if (alt && !NOISE.has(alt.toLowerCase())) company = alt;
    }

    // ── Title strategy 1: page <title> tag ─────────────────────────────────
    // Workday always sets a clean title server-side.
    // Formats: "Job Title | Company"  /  "Job Title - Company - Workday"
    let title = "";
    const rawPageTitle = document.title.trim();
    if (rawPageTitle) {
      const parts = rawPageTitle
        .split(/\s*[|\-–—]\s*/)
        .map((s) => s.trim())
        .filter((s) => s && !NOISE.has(s.toLowerCase()));
      if (parts.length >= 1) {
        title = parts[0];
        // If the second meaningful part looks like a company name (not a URL fragment
        // and shorter than the title), use it to sharpen company.
        if (parts.length >= 2 && parts[1].length < 60) {
          company = parts[1];
        }
      }
    }

    // ── Title strategy 2: specific Workday automation IDs ──────────────────
    // These are tried only if the page title gave us nothing useful.
    // We use firstLine() to avoid pulling in location/meta text that lives
    // inside the same container as the heading.
    if (!title || NOISE.has(title.toLowerCase())) {
      const domCandidates = [
        document.querySelector('[data-automation-id="jobPostingHeader"] h2'),
        document.querySelector('[data-automation-id="jobPostingHeader"] h1'),
        document.querySelector('[data-automation-id="jobTitle"]'),
        // Last-resort: the container itself — take only its first line
        document.querySelector('[data-automation-id="jobPostingHeader"]'),
      ];
      for (const el of domCandidates) {
        const t = firstLine(el);
        if (t && t.length > 1 && t.length < 150 && !NOISE.has(t.toLowerCase())) {
          title = t;
          break;
        }
      }
    }

    // ── Title strategy 3: URL slug ──────────────────────────────────────────
    // Workday URLs: /en-US/Careers/job/Seattle-WA/Software-Engineer_JR12345
    if (!title) {
      const pathParts = window.location.pathname.split("/").filter(Boolean).reverse();
      const slug = pathParts.find(
        (p) =>
          p.includes("-") &&
          p.length > 5 &&
          !/^(en|fr|de|es|ja|zh)(-[A-Z]{2})?$/.test(p) &&
          !NOISE.has(p.toLowerCase())
      );
      if (slug) {
        title = slug
          .replace(/_[A-Z]{1,4}\d+$/, "") // strip trailing job-req ID like _JR12345
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }

    // ── Description ─────────────────────────────────────────────────────────
    const descSelectors = [
      '[data-automation-id="jobPostingDescription"]',
      '[data-automation-id="job-posting-description"]',
      '[data-automation-id="jobDescription"]',
      '[class*="jobDescription"]',
      '[class*="job-description"]',
      "section.job-description",
    ];
    let description = "";
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      const t  = (el ? el.innerText || el.textContent : "").trim();
      if (t.length > 100) { description = t; break; }
    }

    // ── Location ────────────────────────────────────────────────────────────
    const locSelectors = [
      '[data-automation-id="locations"]',
      '[data-automation-id="job-location"]',
      '[data-automation-id="location"]',
    ];
    let location = "";
    for (const sel of locSelectors) {
      const el = document.querySelector(sel);
      const t  = firstLine(el);
      if (t && t.length < 200) { location = t; break; }
    }

    // ── Salary ──────────────────────────────────────────────────────────────
    let salary = "";
    const salaryEl = document.querySelector(
      '[data-automation-id="salary"], [class*="salary"], [class*="compensation"]'
    );
    if (salaryEl) salary = firstLine(salaryEl);

    if (!salary) {
      const m = (description + " " + document.body.innerText).match(
        /\$[\d,]+(?:\.\d+)?[kK]?\s*(?:[-–—]|\bto\b)\s*\$[\d,]+(?:\.\d+)?[kK]?(?:\s*(?:\/yr|\/year|per year|annually|USD))?/i
      );
      if (m) salary = m[0].replace(/\s+/g, " ").trim();
    }

    // ── Remote ──────────────────────────────────────────────────────────────
    const allText = (location + " " + description + " " + title).toLowerCase();
    let remote = "";
    if (/\bfully\s+remote\b|\b100%\s+remote\b|\bremote[\s-]?only\b/.test(allText)) {
      remote = "Remote";
    } else if (/\bhybrid\b/.test(allText)) {
      remote = "Hybrid";
    } else if (/\bremote\b/.test(allText)) {
      remote = "Remote";
    } else if (/\bon[\s-]?site\b|\bin[\s-]?office\b|\bin[\s-]?person\b/.test(allText)) {
      remote = "On-site";
    }

    return { title, company, description, location, salary, workType: remote, url: window.location.href };
  }

  function scrapeLinkedIn() {
    function getText(el) {
      return el ? (el.innerText || el.textContent || "").trim() : "";
    }
    function firstLine(el) {
      return getText(el).split("\n")[0].trim();
    }
    function trySelectors(selectors) {
      for (const sel of selectors) {
        try {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            const t = firstLine(el);
            if (t && t.length > 1 && t.length < 250) return t;
          }
        } catch (_) {}
      }
      return "";
    }

    // ── Title + Company: page <title> is the most reliable source ──────────
    // LinkedIn sets it to: "Job Title at Company | LinkedIn"
    // or occasionally:     "Job Title - Company - LinkedIn"
    let title = "";
    let company = "";
    const rawPageTitle = document.title.trim();
    const atMatch = rawPageTitle.match(/^(.+?)\s+at\s+(.+?)\s*[|–\-]\s*LinkedIn\s*$/i);
    if (atMatch) {
      title   = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      const parts = rawPageTitle
        .split(/\s*[|\-–—]\s*/)
        .map((s) => s.trim())
        .filter((s) => s && !/^linkedin$/i.test(s));
      if (parts.length >= 2) { title = parts[0]; company = parts[1]; }
      else if (parts.length === 1) { title = parts[0]; }
    }

    // ── Title DOM fallback ─────────────────────────────────────────────────
    if (!title) {
      title = trySelectors([
        ".job-details-jobs-unified-top-card__job-title h1",
        ".jobs-unified-top-card__job-title h1",
        "h1.t-24",
        "h1[class*='job-title']",
        ".artdeco-entity-lockup__title",
      ]);
      if (!title) {
        for (const h1 of document.querySelectorAll("h1")) {
          const t = firstLine(h1);
          if (t && t.length > 3 && t.length < 200) { title = t; break; }
        }
      }
    }

    // ── Company DOM fallback ───────────────────────────────────────────────
    if (!company) {
      company = trySelectors([
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".topcard__org-name-link",
        ".topcard__org-name",
        "a[data-tracking-control-name='public_jobs_topcard-org-name']",
        ".job-details-about-company-module__company-info a",
        // broad fallback: any h2 near the top that looks like a company name
        ".artdeco-entity-lockup__subtitle a",
        ".artdeco-entity-lockup__subtitle",
      ]);
    }

    // ── Location ──────────────────────────────────────────────────────────
    let location = trySelectors([
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
      ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
      ".jobs-unified-top-card__subtitle-primary-grouping .jobs-unified-top-card__bullet",
    ]);

    // ── Work type ─────────────────────────────────────────────────────────
    let workType = "";
    const workTypeRaw = trySelectors([
      ".job-details-jobs-unified-top-card__workplace-type",
      ".jobs-unified-top-card__workplace-type",
      ".topcard__flavor--bullet:last-child",
    ]);
    if (workTypeRaw) {
      if (/remote/i.test(workTypeRaw))       workType = "Remote";
      else if (/hybrid/i.test(workTypeRaw))  workType = "Hybrid";
      else if (/on.?site/i.test(workTypeRaw)) workType = "On-site";
      else workType = workTypeRaw;
    }

    // ── Description ───────────────────────────────────────────────────────
    let description = "";
    const descSelectors = [
      "#job-details",
      ".jobs-description__content",
      ".jobs-description-content__text",
      ".jobs-description",
      "[class*='description__text']",
      "[class*='job-description']",
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      const t  = getText(el);
      if (t.length > 100) { description = t; break; }
    }

    // ── Salary ────────────────────────────────────────────────────────────
    let salary = "";
    const insightCandidates = document.querySelectorAll(
      ".job-details-jobs-unified-top-card__job-insight, " +
      ".jobs-unified-top-card__job-insight, " +
      "[class*='salary'], [class*='compensation']"
    );
    for (const el of insightCandidates) {
      const text = getText(el);
      if (/\$/.test(text)) { salary = text.split("\n")[0].trim(); break; }
    }
    if (!salary) {
      const m = (description + " " + document.body.innerText).match(
        /\$[\d,]+(?:\.\d+)?[kK]?\s*(?:[-–—]|\bto\b)\s*\$[\d,]+(?:\.\d+)?[kK]?(?:\s*(?:\/yr|\/year|per year|annually|USD))?/i
      );
      if (m) salary = m[0].replace(/\s+/g, " ").trim();
    }

    // ── Work type text fallback ────────────────────────────────────────────
    if (!workType) {
      const allText = (location + " " + description).toLowerCase();
      if (/\bfully\s+remote\b|\b100%\s+remote\b|\bremote[\s-]?only\b/.test(allText)) workType = "Remote";
      else if (/\bhybrid\b/.test(allText)) workType = "Hybrid";
      else if (/\bremote\b/.test(allText)) workType = "Remote";
      else if (/\bon[\s-]?site\b|\bin[\s-]?office\b|\bin[\s-]?person\b/.test(allText)) workType = "On-site";
    }

    return { title, company, description, location, salary, workType, url: window.location.href };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "scrape") {
      try {
        const hostname = window.location.hostname;
        const isLinkedIn = hostname === "www.linkedin.com";
        const data = isLinkedIn ? scrapeLinkedIn() : scrapeWorkday();
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    }
    return true;
  });
})();
