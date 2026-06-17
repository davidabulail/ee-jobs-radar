// Workday scraper. Workday is the BIGGEST and HARDEST of the providers.
// Most aerospace/defense/auto giants use Workday: Boeing, Lockheed, RTX, GE,
// NVIDIA, Intel, Ford, GM, etc.
//
// Workday doesn't have a single public API — each customer (tenant) hosts its
// own job board on a URL like:
//   https://<host>/wday/cxs/<tenant>/<site>/jobs
// where host/tenant/site are specific to the company.
//
// We POST a search query (Workday wants POST, not GET) with pagination.
// The schema below is what Workday uniformly returns across tenants.

import type { Company, Posting, Sector } from "../types";

type WorkdayJobPosting = {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  // Workday uses bigInt-as-string ids in some places; we normalize to string.
  bulletFields?: string[];
};

type WorkdayResponse = {
  jobPostings?: WorkdayJobPosting[];
  total?: number;
};

export async function fetchWorkday(company: Company): Promise<Posting[]> {
  if (
    company.ats !== "workday" ||
    !company.host ||
    !company.tenant ||
    !company.site
  ) {
    return [];
  }

  const url = `https://${company.host}/wday/cxs/${company.tenant}/${company.site}/jobs`;
  const all: WorkdayJobPosting[] = [];

  // Workday paginates. We pull up to 5 pages (5 * 20 = 100 jobs) per company.
  // Filter "intern" via searchText so we don't waste budget on full-time roles.
  for (let offset = 0; offset < 100; offset += 20) {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "ee-jobs-radar (personal-tracker)",
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: 20,
        offset,
        searchText: "intern",
      }),
    });

    if (!res.ok) {
      throw new Error(`Workday ${company.name}: HTTP ${res.status} (offset ${offset})`);
    }

    const data = (await res.json()) as WorkdayResponse;
    const jobs = data.jobPostings ?? [];
    all.push(...jobs);

    // Stop early if this page wasn't full (no more results).
    if (jobs.length < 20) break;
  }

  const now = new Date().toISOString();

  return all.map((job) => {
    // Workday's externalPath is relative; build the full applicant URL.
    const fullUrl = `https://${company.host}${job.externalPath}`;
    // Use the URL itself as a stable id since Workday doesn't expose
    // a separate id field consistently across tenants.
    const id = `workday:${company.tenant}:${job.externalPath}`;
    return {
      id,
      company: company.name,
      sector: company.sector as Sector,
      title: job.title,
      location: job.locationsText ?? "",
      url: fullUrl,
      // Workday's `postedOn` is a relative string like "Posted Yesterday" or
      // "Posted 30+ Days Ago". Not ideal, but better than nothing.
      postedAt: job.postedOn ?? "",
      isSummer2027: false,
      isEE: false,
      firstSeenAt: now,
    };
  });
}
