// Shared types used across scrapers, classifier, dashboard, and email job.
// Keeping all types in one file so changes ripple consistently.

export type Sector =
  | "aero"
  | "defense"
  | "chips"
  | "auto"
  | "marine"
  | "engines";

export type AtsProvider =
  | "greenhouse"
  | "lever"
  | "workday"
  | "ashby"
  | "tesla"
  | "apple"
  | "google"
  // Playwright-based scrapers for sites without a public JSON API.
  // These are slower (~10-30s per company), so we run them via the same
  // hourly cron but each in its own scraper module.
  | "playwright-lockheed"
  | "playwright-northrop";

// One company we want to monitor. The shape varies slightly per ATS:
// greenhouse/lever/ashby use a single `slug`, workday uses host+tenant+site.
export type Company = {
  name: string;
  sector: Sector;
  ats: AtsProvider;
  slug?: string;
  host?: string;
  tenant?: string;
  site?: string;
};

// One normalized job posting after we've fetched + parsed an ATS feed.
// Every scraper returns this shape so downstream code never branches per-ATS.
export type Posting = {
  // Stable id we generate ourselves: `${ats}:${company}:${externalId}`.
  // Used to detect "is this a new posting since last run?" via diff.
  id: string;
  company: string;
  sector: Sector;
  title: string;
  location: string;
  url: string;
  // ISO timestamp from the ATS, or empty string if not provided.
  postedAt: string;
  // Set by lib/classify.ts after the posting is fetched.
  // Both flags must be true for it to count as an alert-worthy match.
  isSummer2027: boolean;
  isEE: boolean;
  // ISO timestamp of when WE first saw it (for sorting in the dashboard).
  firstSeenAt: string;
};
