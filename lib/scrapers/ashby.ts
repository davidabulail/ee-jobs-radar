// Ashby scraper. Ashby is the new wave (Anduril-tier defense startups, etc.).
// Public endpoint:
//   https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true

import type { Company, Posting, Sector } from "../types";

// Trimmed shape of one job in the Ashby response.
type AshbyJob = {
  id: string;
  title: string;
  jobUrl: string;
  publishedAt: string;
  locationName?: string;
};

type AshbyResponse = {
  jobs: AshbyJob[];
};

export async function fetchAshby(company: Company): Promise<Posting[]> {
  if (company.ats !== "ashby" || !company.slug) return [];

  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "ee-jobs-radar (personal-tracker)" },
  });

  if (!res.ok) {
    throw new Error(`Ashby ${company.name}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as AshbyResponse;
  const now = new Date().toISOString();

  return data.jobs.map((job) => ({
    id: `ashby:${company.slug}:${job.id}`,
    company: company.name,
    sector: company.sector as Sector,
    title: job.title,
    location: job.locationName ?? "",
    url: job.jobUrl,
    postedAt: job.publishedAt ?? "",
    isSummer2027: false,
    isEE: false,
    firstSeenAt: now,
  }));
}
