// Lever scraper. Lever exposes a public JSON endpoint per company:
//   https://api.lever.co/v0/postings/<slug>?mode=json
// No auth required. Schema is stable but slightly different from Greenhouse.

import type { Company, Posting, Sector } from "../types";

// Shape of one job in the Lever JSON response. Trimmed to fields we use.
type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt: number;
  // Lever nests the location inside `categories`. Companies vary in how
  // they fill this in — sometimes blank, sometimes "San Francisco, CA".
  categories?: { location?: string };
};

export async function fetchLever(company: Company): Promise<Posting[]> {
  if (company.ats !== "lever" || !company.slug) return [];

  const url = `https://api.lever.co/v0/postings/${company.slug}?mode=json`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "ee-jobs-radar (personal-tracker)" },
  });

  if (!res.ok) {
    throw new Error(`Lever ${company.name}: HTTP ${res.status}`);
  }

  // Lever returns a top-level array (not wrapped in `{jobs: [...]}` like Greenhouse).
  const jobs = (await res.json()) as LeverJob[];
  const now = new Date().toISOString();

  return jobs.map((job) => ({
    id: `lever:${company.slug}:${job.id}`,
    company: company.name,
    sector: company.sector as Sector,
    title: job.text,
    location: job.categories?.location ?? "",
    url: job.hostedUrl,
    // Lever uses unix-epoch milliseconds. Convert to ISO for consistency.
    postedAt: job.createdAt
      ? new Date(job.createdAt).toISOString()
      : "",
    isSummer2027: false,
    isEE: false,
    firstSeenAt: now,
  }));
}
