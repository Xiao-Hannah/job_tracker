"use strict";

const SERVER = "http://localhost:3001";
const root   = document.getElementById("root");

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(html) {
  root.innerHTML = html;
}

function showIdle() {
  render(`<div class="idle">
    <strong>Not a supported job page</strong>
    Navigate to a job posting on<br>
    <em>LinkedIn</em> or <em>Workday</em><br>
    then open this popup.
  </div>`);
}

function showError(msg) {
  render(`<div class="body"><div class="box box-error">${msg}</div></div>`);
}

function showSuccess(title, company) {
  render(`<div class="body"><div class="box box-success">
    <strong>Saved!</strong><br>
    ${esc(title)}${company ? ` at <strong>${esc(company)}</strong>` : ""}
    has been added to your job tracker.
  </div></div>`);
}

function buildCard(data) {
  const metaParts = [data.location, data.workType, data.salary].filter(Boolean);
  return `
    <div class="card">
      ${data.company ? `<div class="card-company">${esc(data.company)}</div>` : ""}
      <div class="card-title">${esc(data.title || "(no title found)")}</div>
      ${metaParts.length ? `<div class="card-meta">${metaParts.map((p) => `<span>${esc(p)}</span>`).join("")}</div>` : ""}
    </div>`;
}

async function sendToTracker(data) {
  const now = new Date();
  const body = {
    id:              `ext-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    company:         data.company     || "",
    title:           data.title       || "",
    description:     data.description || "",
    link:            data.url         || "",
    location:        data.location    || "",
    salary:          data.salary      || "",
    workType:        data.workType    || "",
    applicationDate: now.toISOString().slice(0, 10),
    status:          "Applied",
    statusUpdate:    "",
    lastUpdated:     now.toISOString(),
    extractionSource: "extension",
  };

  const res = await fetch(`${SERVER}/api/jobs/manual`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server returned ${res.status}`);
  }
  return res.json();
}

async function main() {
  render(`<div class="body"><div class="box box-info">Detecting page…</div></div>`);

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    showError(`Could not query tabs: ${esc(e.message)}`);
    return;
  }

  if (!tab?.id || !tab?.url) { showIdle(); return; }

  const hostname = (() => { try { return new URL(tab.url).hostname; } catch { return ""; } })();
  const isWorkday  = /\.(myworkdayjobs|workdayjobs)\.com$/.test(hostname);
  const isLinkedIn = hostname === "www.linkedin.com" && (tab.url || "").includes("/jobs/");
  if (!isWorkday && !isLinkedIn) { showIdle(); return; }

  const subEl = document.getElementById("header-sub");
  if (subEl) subEl.textContent = isLinkedIn ? "LinkedIn" : "Workday";

  // Ask the content script to scrape the page
  let scraped;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: "scrape" });
    if (!resp?.ok) throw new Error(resp?.error || "Scrape returned no data");
    scraped = resp.data;
  } catch (e) {
    showError(
      `Could not read the page.<br>` +
      `Try refreshing it, then re-opening this popup.<br>` +
      `<small style="opacity:.7">${esc(e.message)}</small>`
    );
    return;
  }

  // Preview + send button
  render(`<div class="body">
    ${buildCard(scraped)}
    <button class="btn" id="send-btn">Send to Job Tracker</button>
  </div>`);

  document.getElementById("send-btn").addEventListener("click", async () => {
    const btn = document.getElementById("send-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Saving…`;

    try {
      await sendToTracker(scraped);
      showSuccess(scraped.title, scraped.company);
    } catch (e) {
      showError(
        `Failed to save.<br>` +
        `<strong>Is the Job Tracker server running?</strong><br>` +
        `<small style="opacity:.7">${esc(e.message)}</small>`
      );
    }
  });
}

main().catch((e) => showError(`Extension error: ${esc(e.message)}`));
