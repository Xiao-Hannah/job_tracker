/**
 * Gmail OAuth2 + auto-status scanner
 * ────────────────────────────────────
 * SETUP (one-time):
 *
 *  1. Open https://console.cloud.google.com
 *  2. Create or select a project → APIs & Services → Enable APIs → enable "Gmail API"
 *  3. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
 *     Application type: Web application
 *     Authorised redirect URI: http://localhost:3001/api/gmail/callback
 *  4. Download the JSON — copy the two values into your .env file:
 *
 *       GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
 *       GMAIL_CLIENT_SECRET=your-client-secret
 *
 *  5. Start the server, then open http://localhost:3001/api/gmail/auth in your browser
 *  6. Sign in and grant read-only Gmail access — you'll be redirected back automatically
 *
 * After step 6 the server will scan Gmail every hour and update job statuses.
 */

import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, "..", "data");
const TOKEN_PATH = join(DATA_DIR, "gmail_tokens.json");
const REDIRECT   = "http://localhost:3001/api/gmail/callback";
const SCOPES     = ["https://www.googleapis.com/auth/gmail.readonly"];

// ── Credentials: prefer .env vars, fall back to downloaded JSON file ────────

function makeClient() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (clientId && clientSecret) {
    return new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
  }

  // Legacy fallback: data/gmail_credentials.json downloaded from Google Cloud
  const legacyPath = join(DATA_DIR, "gmail_credentials.json");
  if (existsSync(legacyPath)) {
    const raw = JSON.parse(readFileSync(legacyPath, "utf8"));
    const cfg = raw.installed ?? raw.web;
    return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, REDIRECT);
  }

  return null;
}

export function isGmailConfigured(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID || existsSync(join(DATA_DIR, "gmail_credentials.json")));
}

export function isGmailAuthorized(): boolean {
  return isGmailConfigured() && existsSync(TOKEN_PATH);
}

export function getAuthUrl(): string {
  const client = makeClient();
  if (!client) throw new Error("Gmail not configured");
  return client.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });
}

export async function handleOAuthCallback(code: string): Promise<void> {
  const client = makeClient();
  if (!client) throw new Error("Gmail not configured");
  const { tokens } = await client.getToken(code);
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

// ── Keyword lists ──────────────────────────────────────────────────────────

const INTERVIEW_KW = [
  "interview", "schedule a call", "next steps", "move forward",
  "next round", "phone screen", "technical screen", "screening call",
  "invite you", "let's connect", "set up a time",
];
const REJECTION_KW = [
  "unfortunately", "not moving forward", "other candidates",
  "not selected", "not a fit", "decided to move", "we will not",
  "not be moving", "position has been filled", "no longer considering",
];
const OFFER_KW = [
  "offer", "congratulations", "pleased to inform", "excited to offer",
  "we'd like to offer", "formal offer", "offer letter",
];

export type GmailStatus = "Interviewing" | "Rejected" | "Offer";

// ── Domain helpers ─────────────────────────────────────────────────────────

function guessEmailDomain(company: string): string {
  return company
    .toLowerCase()
    .replace(/\s*[&+]\s*/g, "")
    .replace(/\s+(?:inc|llc|ltd|corp|co|group|corporation|technologies|technology|solutions|systems|services|global)\.?\s*$/gi, "")
    .replace(/[^a-z0-9]/g, "") + ".com";
}

function senderDomain(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+@([^>]+))>/) ?? fromHeader.match(/\S+@([\w.-]+)/);
  return (m ? (m[2] ?? m[1].split("@")[1]) : "").toLowerCase();
}

// ── Scanner ────────────────────────────────────────────────────────────────

export async function scanGmail(
  companies: string[]
): Promise<{ company: string; status: GmailStatus }[]> {
  if (!isGmailAuthorized()) return [];

  const client = makeClient()!;
  client.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf8")));
  const gmail  = google.gmail({ version: "v1", auth: client });
  const result: { company: string; status: GmailStatus }[] = [];

  for (const company of companies) {
    try {
      const companyDomain = guessEmailDomain(company);
      // Search emails from the likely company domain OR mentioning the company name
      const q = `(from:@${companyDomain} OR "${company}") newer_than:90d`;

      const list = await gmail.users.messages.list({ userId: "me", q, maxResults: 15 });

      for (const msg of list.data.messages ?? []) {
        if (!msg.id) continue;

        // metadata format gives us Subject + From headers AND the snippet (body preview)
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From"],
        });

        const headers  = detail.data.payload?.headers ?? [];
        const subject  = (headers.find((h) => h.name === "Subject")?.value ?? "").toLowerCase();
        const from     = (headers.find((h) => h.name === "From")?.value ?? "").toLowerCase();
        const snippet  = (detail.data.snippet ?? "").toLowerCase();

        // Require the email to actually be related to this company:
        // either the sender domain matches or the company name appears in subject/snippet
        const fromDomain   = senderDomain(from);
        const domainMatch  = fromDomain === companyDomain || fromDomain.endsWith("." + companyDomain);
        const nameInText   = subject.includes(company.toLowerCase()) || snippet.includes(company.toLowerCase());
        if (!domainMatch && !nameInText) continue;

        const haystack = subject + " " + snippet;

        if (OFFER_KW.some((k) => haystack.includes(k))) {
          result.push({ company, status: "Offer" }); break;
        }
        if (INTERVIEW_KW.some((k) => haystack.includes(k))) {
          result.push({ company, status: "Interviewing" }); break;
        }
        if (REJECTION_KW.some((k) => haystack.includes(k))) {
          result.push({ company, status: "Rejected" }); break;
        }
      }
    } catch (e) {
      console.error(`[Gmail] scan failed for "${company}":`, (e as Error).message);
    }
  }

  return result;
}
