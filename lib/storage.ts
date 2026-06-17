// File-based storage. We keep state in JSON files committed to the repo.
//
// Why this design: this project must outlive the Amazon internship with
// zero ongoing cost. A real database would mean a managed service that
// could lapse, charge fees, or be shut down. Files in git are forever.
//
// The downside: every cron run produces a git commit. For an hourly job
// over a year, that's ~8,760 commits. That's totally fine for a personal
// repo. The history actually becomes a useful audit log: "when did this
// posting appear?" → look at git blame.

import fs from "node:fs/promises";
import path from "node:path";
import type { Posting, Company } from "./types";

// Use process.cwd() so this works both locally and inside Vercel's runtime.
// Both lib code and scripts run from the project root.
const DATA_DIR = path.join(process.cwd(), "data");
const POSTINGS_FILE = path.join(DATA_DIR, "postings.json");
const COMPANIES_FILE = path.join(DATA_DIR, "companies.json");

export async function loadCompanies(): Promise<Company[]> {
  const raw = await fs.readFile(COMPANIES_FILE, "utf-8");
  return JSON.parse(raw) as Company[];
}

export async function loadPostings(): Promise<Posting[]> {
  // Allow the file to not exist yet on first run.
  try {
    const raw = await fs.readFile(POSTINGS_FILE, "utf-8");
    return JSON.parse(raw) as Posting[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function savePostings(postings: Posting[]): Promise<void> {
  // Sort newest-firstSeen first so the JSON file diffs cleanly in git.
  const sorted = [...postings].sort((a, b) =>
    b.firstSeenAt.localeCompare(a.firstSeenAt)
  );
  await fs.writeFile(POSTINGS_FILE, JSON.stringify(sorted, null, 2) + "\n");
}
