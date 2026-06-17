// Greenhouse scraper. Greenhouse exposes a public JSON endpoint per company:
//   https://boards-api.greenhouse.io/v1/boards/<slug>/jobs
// No auth required, generous rate limits, very stable schema.
// This is the easiest of the three providers and will cover the most companies.

import type { Company, Posting, Sector } from "../types";

// Shape of one job in the Greenhouse JSON response.
// We only pull the fields we need; ignore the rest to stay resilient
// to schema additions.
type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  location: { name: string };
};

type GreenhouseResponse = {
  jobs: GreenhouseJob[];
};

export async function fetchGreenhouse(company: Company): Promise<Posting[]> {
  // Sanity check: the caller should only pass us greenhouse companies.
  if (company.ats !== "greenhouse" || !company.slug) return [];

  const url = `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`;

  // 15-second timeout. If a board is slow, we'd rather skip it for this
  // run than block the whole hourly job.
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "ee-jobs-radar (personal-tracker)" },
  });

  if (!res.ok) {
    // Don't throw — we want one bad company to fail without killing
    // the whole scraper run. The orchestrator logs and moves on.
    throw new Error(`Greenhouse ${company.name}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as GreenhouseResponse;
  const now = new Date().toISOString();

  return data.jobs.map((job) => ({
    id: `greenhouse:${company.slug}:${job.id}`,
    company: company.name,
    sector: company.sector as Sector,
    title: job.title,
    location: job.location?.name ?? "",
    url: job.absolute_url,
    postedAt: job.updated_at ?? "",
    // Classifier flags get filled in by the orchestrator, not here.
    isSummer2027: false,
    isEE: false,
    firstSeenAt: now,
  }));
}
