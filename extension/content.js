(function () {
  "use strict";

  // Guard against double-injection (popup injects this dynamically each time)
  if (window.__jobTrackerInjected) return;
  window.__jobTrackerInjected = true;

  // ─── Shared helpers ────────────────────────────────────────────────────────

  const NOISE = new Set([
    "workday", "careers", "jobs", "job search", "search jobs",
    "all jobs", "career site", "job board", "career opportunities",
    "opportunities", "home", "apply",
  ]);

  function getText(el) {
    return el ? (el.innerText || el.textContent || "").trim() : "";
  }
  function firstLine(el) {
    return getText(el).split("\n")[0].trim();
  }
  function trySelectors(selectors) {
    for (const sel of selectors) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          const t = firstLine(el);
          if (t && t.length > 1 && t.length < 250) return t;
        }
      } catch (_) {}
    }
    return "";
  }
  function salaryFromText(text) {
    const m = text.match(
      /\$[\d,]+(?:\.\d+)?[kK]?\s*(?:[-–—]|\bto\b)\s*\$[\d,]+(?:\.\d+)?[kK]?(?:\s*(?:\/yr|\/year|per year|annually|USD))?/i
    );
    return m ? m[0].replace(/\s+/g, " ").trim() : "";
  }
  function workTypeFromText(text) {
    const t = text.toLowerCase();
    if (/\bfully\s+remote\b|\b100%\s+remote\b|\bremote[\s-]?only\b/.test(t)) return "Remote";
    if (/\bhybrid\b/.test(t)) return "Hybrid";
    if (/\bremote\b/.test(t)) return "Remote";
    if (/\bon[\s-]?site\b|\bin[\s-]?office\b|\bin[\s-]?person\b/.test(t)) return "On-site";
    return "";
  }

  // ─── Workday ───────────────────────────────────────────────────────────────

  function scrapeWorkday() {
    const slug = window.location.hostname.split(".")[0];
    let company = slug.charAt(0).toUpperCase() + slug.slice(1);

    const logoImg = document.querySelector(
      'header img[alt], [class*="brand"] img[alt], [class*="logo"] img[alt]'
    );
    if (logoImg) {
      const alt = (logoImg.getAttribute("alt") || "").trim();
      if (alt && !NOISE.has(alt.toLowerCase())) company = alt;
    }

    let title = "";
    const rawPageTitle = document.title.trim();
    if (rawPageTitle) {
      const parts = rawPageTitle
        .split(/\s*[|\-–—]\s*/)
        .map((s) => s.trim())
        .filter((s) => s && !NOISE.has(s.toLowerCase()));
      if (parts.length >= 1) {
        title = parts[0];
        if (parts.length >= 2 && parts[1].length < 60) company = parts[1];
      }
    }

    if (!title || NOISE.has(title.toLowerCase())) {
      const domCandidates = [
        document.querySelector('[data-automation-id="jobPostingHeader"] h2'),
        document.querySelector('[data-automation-id="jobPostingHeader"] h1'),
        document.querySelector('[data-automation-id="jobTitle"]'),
        document.querySelector('[data-automation-id="jobPostingHeader"]'),
      ];
      for (const el of domCandidates) {
        const t = firstLine(el);
        if (t && t.length > 1 && t.length < 150 && !NOISE.has(t.toLowerCase())) {
          title = t; break;
        }
      }
    }

    if (!title) {
      const pathParts = window.location.pathname.split("/").filter(Boolean).reverse();
      const s = pathParts.find(
        (p) => p.includes("-") && p.length > 5 &&
          !/^(en|fr|de|es|ja|zh)(-[A-Z]{2})?$/.test(p) && !NOISE.has(p.toLowerCase())
      );
      if (s) {
        title = s.replace(/_[A-Z]{1,4}\d+$/, "").replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }

    let description = "";
    for (const sel of [
      '[data-automation-id="jobPostingDescription"]',
      '[data-automation-id="job-posting-description"]',
      '[data-automation-id="jobDescription"]',
      '[class*="jobDescription"]', '[class*="job-description"]', "section.job-description",
    ]) {
      const t = getText(document.querySelector(sel));
      if (t.length > 100) { description = t; break; }
    }

    let location = "";
    for (const sel of [
      '[data-automation-id="locations"]',
      '[data-automation-id="job-location"]',
      '[data-automation-id="location"]',
    ]) {
      const t = firstLine(document.querySelector(sel));
      if (t && t.length < 200) { location = t; break; }
    }

    let salary = firstLine(document.querySelector(
      '[data-automation-id="salary"], [class*="salary"], [class*="compensation"]'
    ));
    if (!salary) salary = salaryFromText(description + " " + document.body.innerText);

    const workType = workTypeFromText(location + " " + description + " " + title);

    return { title, company, description, location, salary, workType, url: window.location.href };
  }

  // ─── LinkedIn ──────────────────────────────────────────────────────────────

  function scrapeLinkedIn() {
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

    if (!title) {
      title = trySelectors([
        ".job-details-jobs-unified-top-card__job-title h1",
        ".jobs-unified-top-card__job-title h1",
        "h1.t-24", "h1[class*='job-title']", ".artdeco-entity-lockup__title",
      ]);
      if (!title) {
        for (const h1 of document.querySelectorAll("h1")) {
          const t = firstLine(h1);
          if (t && t.length > 3 && t.length < 200) { title = t; break; }
        }
      }
    }

    if (!company) {
      company = trySelectors([
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".topcard__org-name-link", ".topcard__org-name",
        "a[data-tracking-control-name='public_jobs_topcard-org-name']",
        ".artdeco-entity-lockup__subtitle a", ".artdeco-entity-lockup__subtitle",
      ]);
    }

    const location = trySelectors([
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
      ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
    ]);

    let workType = "";
    const workTypeRaw = trySelectors([
      ".job-details-jobs-unified-top-card__workplace-type",
      ".jobs-unified-top-card__workplace-type",
    ]);
    if (workTypeRaw) {
      if (/remote/i.test(workTypeRaw))        workType = "Remote";
      else if (/hybrid/i.test(workTypeRaw))   workType = "Hybrid";
      else if (/on.?site/i.test(workTypeRaw)) workType = "On-site";
      else workType = workTypeRaw;
    }

    let description = "";
    for (const sel of [
      "#job-details", ".jobs-description__content",
      ".jobs-description-content__text", ".jobs-description",
      "[class*='description__text']", "[class*='job-description']",
    ]) {
      const t = getText(document.querySelector(sel));
      if (t.length > 100) { description = t; break; }
    }

    let salary = "";
    for (const el of document.querySelectorAll(
      ".job-details-jobs-unified-top-card__job-insight, " +
      ".jobs-unified-top-card__job-insight, [class*='salary'], [class*='compensation']"
    )) {
      const text = getText(el);
      if (/\$/.test(text)) { salary = text.split("\n")[0].trim(); break; }
    }
    if (!salary) salary = salaryFromText(description + " " + document.body.innerText);
    if (!workType) workType = workTypeFromText(location + " " + description);

    return { title, company, description, location, salary, workType, url: window.location.href };
  }

  // ─── Generic (any JS-rendered job site) ───────────────────────────────────

  function getMeta(name) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el ? (el.getAttribute("content") || "").trim() : "";
  }

  // Parse JSON-LD blocks and return the first JobPosting object found, or null.
  function findJsonLdJob() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        let data = JSON.parse(script.textContent);
        if (!Array.isArray(data)) data = [data];
        // Walk top-level items and any @graph arrays
        const items = data.flatMap((d) => [d, ...(d["@graph"] || [])]);
        const job = items.find((x) => {
          if (!x) return false;
          const t = x["@type"];
          // @type can be a string or an array; namespaced types like "schema:JobPosting" also count
          return Array.isArray(t)
            ? t.some((s) => /JobPosting/i.test(s))
            : typeof t === "string" && /JobPosting/i.test(t);
        });
        if (job?.title) return job;
      } catch (_) {}
    }
    return null;
  }

  function parseJsonLdJob(job) {
    // Location
    let location = "";
    const locs = [].concat(job.jobLocation || []);
    if (locs.length) {
      const addr = locs[0]?.address || locs[0];
      if (typeof addr === "string") {
        location = addr;
      } else if (addr) {
        location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
          .filter(Boolean).join(", ");
      }
    }

    // Salary
    let salary = "";
    const bs = job.baseSalary?.value ?? job.baseSalary;
    if (bs) {
      const min = bs.minValue ?? bs.value;
      const max = bs.maxValue ?? bs.value;
      if (min && max && min !== max) {
        salary = `$${Number(min).toLocaleString()} – $${Number(max).toLocaleString()}`;
      } else if (min) {
        salary = `$${Number(min).toLocaleString()}`;
      }
      const unit = bs.unitText || job.baseSalary?.unitText;
      if (salary && unit) salary += ` / ${unit}`;
    }
    if (!salary) salary = salaryFromText(document.body.innerText);

    // Work type
    let workType = "";
    const locType = [].concat(job.jobLocationType || []).join(" ");
    if (/TELECOMMUTE/i.test(locType)) {
      workType = "Remote";
    } else {
      const et = [].concat(job.employmentType || []).join(" ");
      workType = workTypeFromText(et + " " + location);
    }

    // Description — strip HTML from schema markup
    const description = (job.description || "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      title:   job.title.trim(),
      company: job.hiringOrganization?.name?.trim() || "",
      description,
      location,
      salary,
      workType,
      url: window.location.href,
    };
  }

  // Site-specific selectors for major ATS platforms that don't rely on JSON-LD.
  function scrapeSiteSpecific() {
    const h = window.location.hostname;
    const path = window.location.pathname;

    // ── Greenhouse (boards.greenhouse.io or embedded iframes) ────────────────
    if (/greenhouse\.io/.test(h) || document.querySelector("#grnhse_app, .greenhouse")) {
      return {
        title:       trySelectors(["#header h1", ".app-title", "[class*='opening'] h1"]),
        company:     trySelectors(["#header .company-name", ".company-name"]) ||
                     getMeta("og:site_name"),
        location:    trySelectors(["#header .location", ".location"]),
        description: getText(document.querySelector("#content, #job_description, .job__description")),
        salary:      "",
        workType:    "",
      };
    }

    // ── Lever (jobs.lever.co) ────────────────────────────────────────────────
    if (/lever\.co/.test(h)) {
      const locEls = document.querySelectorAll(".posting-categories .sort-by-time, .posting-categories .location");
      return {
        title:       trySelectors([".posting-headline h2", "h2.posting-name"]),
        company:     path.split("/")[1] || getMeta("og:site_name"),
        location:    firstLine(locEls[0]),
        description: getText(document.querySelector(".section.page-full-width, .content")),
        salary:      "",
        workType:    locEls.length > 1 ? firstLine(locEls[1]) : "",
      };
    }

    // ── Indeed (indeed.com) ──────────────────────────────────────────────────
    if (/indeed\.com/.test(h)) {
      return {
        title:       trySelectors([
          '[data-testid="jobsearch-JobInfoHeader-title"] span',
          '[data-testid="jobsearch-JobInfoHeader-title"]',
          "h1[class*='jobTitle']",
        ]),
        company:     trySelectors([
          '[data-company-name="true"] a',
          '[data-testid="inlineHeader-companyName"] a',
          '[data-testid="inlineHeader-companyName"]',
        ]),
        location:    trySelectors([
          '[data-testid="job-location"]',
          '[data-testid="inlineHeader-companyLocation"]',
        ]),
        description: getText(document.querySelector("#jobDescriptionText, [id*='jobDescription']")),
        salary:      trySelectors(['[data-testid="attribute_snippet_testid"]', '[class*="salary"]']),
        workType:    "",
      };
    }

    // ── Glassdoor (glassdoor.com) ─────────────────────────────────────────────
    if (/glassdoor\.com/.test(h)) {
      return {
        title:       trySelectors(['[data-test="job-title"]', 'h1[class*="JobTitle"]']),
        company:     trySelectors(['[data-test="employer-name"]', '[class*="EmployerName"]']),
        location:    trySelectors(['[data-test="location"]', '[class*="location"]']),
        description: getText(document.querySelector('[class*="JobDescription"], [id*="JobDesc"]')),
        salary:      trySelectors(['[data-test="salary-estimate"]', '[class*="salary"]']),
        workType:    "",
      };
    }

    // ── iCIMS (*.icims.com) ──────────────────────────────────────────────────
    if (/icims\.com/.test(h)) {
      return {
        title:       trySelectors([".iCIMS_Header h1", "#requisitionDescriptionInterface h1", "h1"]),
        company:     getMeta("og:site_name"),
        location:    trySelectors(["[class*='iCIMS_'] [class*='location']", ".iCIMS_JobHeaderField"]),
        description: getText(document.querySelector(".iCIMS_JobContent, #jobContentWrapper")),
        salary:      "",
        workType:    "",
      };
    }

    // ── Ashby (jobs.ashbyhq.com) ─────────────────────────────────────────────
    if (/ashbyhq\.com/.test(h)) {
      return {
        title:       trySelectors(["h1", "[class*='job-title']"]),
        company:     trySelectors(["[class*='company']", "[class*='org-name']"]) ||
                     getMeta("og:site_name"),
        location:    trySelectors(["[class*='location']", "[class*='job-location']"]),
        description: getText(document.querySelector("[class*='description'], [class*='content']")),
        salary:      "",
        workType:    "",
      };
    }

    // ── JobRight (jobright.ai/jobs/info/*) ───────────────────────────────────
    if (/jobright\.ai/.test(h)) {
      // Page title format: "Job Title at Company | Jobright.ai"
      let title = "", company = "";
      const rawTitle = document.title.trim();
      const atMatch  = rawTitle.match(/^(.+?)\s+at\s+(.+?)\s*[|\-–]\s*Jobright/i);
      if (atMatch) { title = atMatch[1].trim(); company = atMatch[2].trim(); }

      // Fallback: first two distinct h2s in main (title then company)
      if (!title) {
        const h2s = Array.from(document.querySelectorAll("main h2, h2"))
          .map((el) => firstLine(el))
          .filter((t) => t && t.length > 1 && t.length < 200);
        if (h2s[0]) title   = h2s[0];
        if (h2s[1]) company = company || h2s[1];
      }

      // Location: text node sibling of the location icon
      let location = "";
      for (const img of document.querySelectorAll('img[alt*="location" i], img[alt*="pin" i]')) {
        const t = getText(img.nextElementSibling || img.parentElement);
        if (t && t.length < 150) { location = t.split("\n")[0].trim(); break; }
      }
      if (!location) location = trySelectors(["[class*='location']", "[class*='city']"]);

      // Work type: text sibling of the remote/work-mode icon
      let workType = "";
      for (const img of document.querySelectorAll('img[alt="remote"], img[alt*="work" i], img[alt*="mode" i]')) {
        const t = getText(img.nextElementSibling || img.parentElement);
        if (t) {
          if (/remote/i.test(t))        workType = "Remote";
          else if (/hybrid/i.test(t))   workType = "Hybrid";
          else if (/onsite|on.?site/i.test(t)) workType = "On-site";
          if (workType) break;
        }
      }

      return {
        title,
        company,
        location,
        workType,
        description: getText(document.querySelector("main")),
        salary:      "",
      };
    }

    return null;
  }

  // Last-resort: use structural analysis — find the richest content block.
  function scrapeHeuristic() {
    // Title: page <title> parsing first, then first h1 in main content
    let title = "";
    let company = "";

    const rawTitle = document.title.trim();
    const atMatch  = rawTitle.match(/^(.+?)\s+at\s+(.+?)(?:\s*[|\-–—].*)?$/i);
    if (atMatch && atMatch[1].length < 150 && atMatch[2].length < 100) {
      title   = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      const parts = rawTitle.split(/\s*[|\-–—]\s*/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) { title = parts[0]; company = parts[1]; }
      else if (parts.length === 1) title = parts[0];
    }

    // Title: stable attribute selectors that survive CSS hashing
    if (!title) {
      title = trySelectors([
        // data-testid / aria patterns
        "[data-testid*='title'], [data-testid*='position'], [data-testid*='job-name']",
        "[aria-label*='job title' i], [aria-label*='position' i]",
        // id-based
        "#job-title, #jobTitle, #position-title",
        // h1 inside a landmark
        "main h1", "article h1", '[role="main"] h1',
        // any h1
        "h1",
      ]);
    }

    // Company: stable patterns
    if (!company) {
      company = trySelectors([
        "[data-testid*='company'], [data-testid*='employer'], [data-testid*='org']",
        "[itemprop='name']",
        "#company-name, #companyName, #employer-name",
      ]) || getMeta("og:site_name");
    }

    // Location: stable patterns
    const location = trySelectors([
      "[data-testid*='location'], [data-testid*='city']",
      "[aria-label*='location' i]",
      "#job-location, #jobLocation",
      "[itemprop='addressLocality']",
    ]);

    // Description: find the element with the most paragraph/list content
    let description = "";
    const contentRoots = [
      ...document.querySelectorAll("main, article, [role='main'], #content, #job-content"),
    ];
    if (!contentRoots.length) contentRoots.push(document.body);

    // Score each candidate by richness (number of <p> + <li> children × avg text length)
    let bestScore  = 0;
    let bestEl     = null;
    for (const root of contentRoots) {
      for (const el of [root, ...root.querySelectorAll("section, div")]) {
        const blocks = el.querySelectorAll("p, li");
        if (blocks.length < 3) continue;
        const textLen = getText(el).length;
        const score   = blocks.length * Math.sqrt(textLen);
        if (score > bestScore) { bestScore = score; bestEl = el; }
      }
    }
    if (bestEl) description = getText(bestEl);

    // Salary
    const salary = salaryFromText(description + " " + document.body.innerText);

    // Work type from all gathered text
    const workType = workTypeFromText(location + " " + description + " " + title);

    return { title, company, description, location, salary, workType, url: window.location.href };
  }

  function scrapeGeneric() {
    // 1. JSON-LD (covers Greenhouse, Lever, Ashby, SmartRecruiters, Workable, BambooHR, etc.)
    const jsonLdJob = findJsonLdJob();
    if (jsonLdJob) return parseJsonLdJob(jsonLdJob);

    // 2. Site-specific selectors for major platforms that don't rely on JSON-LD
    const siteResult = scrapeSiteSpecific();
    if (siteResult?.title) {
      // Fill in salary + workType from text if not found by selectors
      const allText = [siteResult.description, siteResult.location, siteResult.title].join(" ");
      if (!siteResult.salary)   siteResult.salary   = salaryFromText(allText + " " + document.body.innerText);
      if (!siteResult.workType) siteResult.workType = workTypeFromText(allText);
      return { ...siteResult, url: window.location.href };
    }

    // 3. Structural heuristics — last resort for truly unknown sites
    return scrapeHeuristic();
  }

  // ─── Floating "Save to Tracker" button ────────────────────────────────────

  const TRACKER_URL = "http://localhost:3001";

  function runScraper() {
    const h = window.location.hostname;
    if (/\.(myworkdayjobs|workdayjobs)\.com$/.test(h)) return scrapeWorkday();
    if (h === "www.linkedin.com") return scrapeLinkedIn();
    return scrapeGeneric();
  }

  function buildPayload(data) {
    const now = new Date();
    return {
      id:               `ext-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
      company:          data.company     || "",
      title:            data.title       || "",
      description:      data.description || "",
      link:             data.url         || "",
      location:         data.location    || "",
      salary:           data.salary      || "",
      workType:         data.workType    || "",
      applicationDate:  now.toISOString().slice(0, 10),
      status:           "Applied",
      statusUpdate:     "",
      lastUpdated:      now.toISOString(),
      extractionSource: "extension",
    };
  }

  function isJobDetailPage() {
    const h = window.location.hostname;
    const p = window.location.pathname;
    return (h === "www.linkedin.com"  && /^\/jobs\/view\//.test(p)) ||
           (h === "jobright.ai"       && /^\/jobs\/info\//.test(p));
  }

  function injectFloatingButton() {
    if (document.getElementById("__jt_save_btn")) return;

    const btn = document.createElement("button");
    btn.id = "__jt_save_btn";
    btn.textContent = "Save to Tracker";
    Object.assign(btn.style, {
      position:   "fixed",
      bottom:     "24px",
      right:      "24px",
      zIndex:     "2147483647",
      padding:    "10px 18px",
      background: "#2d7ef7",
      color:      "#fff",
      border:     "none",
      borderRadius: "8px",
      fontSize:   "14px",
      fontWeight: "600",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor:     "pointer",
      boxShadow:  "0 4px 14px rgba(0,0,0,.3)",
      transition: "background 0.15s",
      lineHeight: "1.4",
    });

    btn.addEventListener("mouseenter", () => { if (!btn.disabled) btn.style.background = "#1a6de3"; });
    btn.addEventListener("mouseleave", () => { if (!btn.disabled) btn.style.background = "#2d7ef7"; });

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Saving…";
      btn.style.background = "#6b7280";
      btn.style.cursor = "not-allowed";

      try {
        const data = runScraper();
        const res  = await fetch(`${TRACKER_URL}/api/jobs/manual`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(buildPayload(data)),
        });
        if (!res.ok) throw new Error(`Server ${res.status}`);
        btn.textContent = "✅ Saved!";
        btn.style.background = "#059669";
      } catch (_) {
        btn.textContent = "❌ Failed";
        btn.style.background = "#dc2626";
      }

      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Save to Tracker";
        btn.style.background = "#2d7ef7";
        btn.style.cursor = "pointer";
      }, 2000);
    });

    document.body.appendChild(btn);
  }

  function tryInjectButton() {
    if (isJobDetailPage()) injectFloatingButton();
  }

  // Initial attempt
  tryInjectButton();

  // SPA support: LinkedIn navigates without full page reloads.
  // Watch for any DOM mutations that change the URL, then re-check after the
  // new page content settles (1500 ms gives React time to render).
  let __jtLastUrl = location.href;
  new MutationObserver(() => {
    if (location.href === __jtLastUrl) return;
    __jtLastUrl = location.href;
    const old = document.getElementById("__jt_save_btn");
    if (old) old.remove();
    setTimeout(tryInjectButton, 1500);
  }).observe(document, { subtree: true, childList: true });

  // ─── Message listener ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "scrape") {
      try {
        const h = window.location.hostname;
        let data;
        if (/\.(myworkdayjobs|workdayjobs)\.com$/.test(h)) {
          data = scrapeWorkday();
        } else if (h === "www.linkedin.com") {
          data = scrapeLinkedIn();
        } else {
          data = scrapeGeneric();
        }
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    }
    return true;
  });
})();
