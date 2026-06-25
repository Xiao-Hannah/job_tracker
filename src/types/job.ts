export type JobStatus =
  | "Saved"
  | "Applied"
  | "Interviewing"
  | "Rejected"
  | "Offer"
  | "Withdrawn";

export type ExtractionSource =
  | "json-ld"
  | "opengraph"
  | "html"
  | "manual"
  | "extension"
  | "failed";

export interface Job {
  id: string;
  company: string;
  title: string;
  description: string;
  link: string;
  applicationDate: string;
  interviewDate?: string;
  status: JobStatus;
  statusUpdate: string;
  lastUpdated: string;
  extractionSource?: ExtractionSource;
  location?: string;
  salary?: string;
  workType?: string;
}
