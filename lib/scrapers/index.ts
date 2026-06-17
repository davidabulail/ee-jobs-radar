// Orchestrator that fans out to every per-ATS scraper.
// Single import for callers (the cron script and the validation script).

import type { Browser } from "playwright";
import type { Company, Posting } from "../types";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import { fetchWorkday } from "./workday";
import { fetchAshby } from "./ashby";
import { fetchLockheed } from "./playwright/lockheed";
import { fetchNorthrop } from "./playwright/northrop";
import { withBrowser } from "./playwright/browser";

// Dispatch one company to the right per-ATS function.
// HTTP-only scrapers (greenhouse/lever/workday/ashby) take just a Company.
// Playwright scrapers also take a shared Browser instance so we don't pay
// the Chromium-launch cost per company.
//
// We don't yet support tesla/apple/google careers (those need custom code);
// for now we skip them with a warning so the run doesn't fail.
async function fetchCompany(
  company: Company,
  browser: Browser | null
): Promise<Posting[]> {
  switch (company.ats) {
    case "greenhouse":
      return fetchGreenhouse(company);
    case "lever":
      return fetchLever(company);
    case "workday":
      return fetchWorkday(company);
    case "ashby":
      return fetchAshby(company);
    case "playwright-lockheed":
      if (!browser) throw new Error("Playwright not available");
      return fetchLockheed(browser, company);
    case "playwright-northrop":
      if (!browser) throw new Error("Playwright not available");
      return fetchNorthrop(browser, company);
    case "tesla":
    case "apple":
    case "google":
      // TODO: these companies don't use a standard ATS. Custom scrapers
      // needed. For now we surface a warning and return empty so the
      // overall scraper run keeps going.
      console.warn(`No scraper yet for ${company.ats}: ${company.name}`);
      return [];
    default:
      return [];
  }
}

// Public entry — for the validation script and any one-off testing.
// Launches its own browser so callers don't have to think about lifecycle.
export async function fetchOne(company: Company): Promise<Posting[]> {
  const needsBrowser = company.ats.startsWith("playwright-");
  if (!needsBrowser) return fetchCompany(company, null);
  return withBrowser((browser) => fetchCompany(company, browser));
}

// Run every company in parallel. HTTP scrapers run with concurrency 8;
// Playwright scrapers run sequentially within ONE shared browser so we
// only pay the Chromium-launch cost once.
//
// We split the company list by scraper type and run the two groups in
// parallel: HTTP scrapers go fast and finish first, Playwright scrapers
// take longer but only block the run by the slowest single Playwright
// company.
//
// Returns an object with both successful postings and errors so the
// caller can log failures clearly.
export async function fetchAll(
  companies: Company[]
): Promise<{ postings: Posting[]; errors: { company: string; error: string }[] }> {
  const errors: { company: string; error: string }[] = [];
  const postings: Posting[] = [];

  const httpCompanies = companies.filter((c) => !c.ats.startsWith("playwright-"));
  const pwCompanies = companies.filter((c) => c.ats.startsWith("playwright-"));

  // Worker pool helper used for both groups.
  async function runPool(items: Company[], concurrency: number, browser: Browser | null) {
    const queue = [...items];
    async function worker() {
      while (queue.length > 0) {
        const company = queue.shift();
        if (!company) return;
        try {
          const result = await fetchCompany(company, browser);
          postings.push(...result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ company: company.name, error: msg });
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  // Run the two pipelines side-by-side. Promise.all waits for both
  // before returning the combined result.
  await Promise.all([
    runPool(httpCompanies, 8, null),
    pwCompanies.length === 0
      ? Promise.resolve()
      : withBrowser((browser) => runPool(pwCompanies, 2, browser)),
  ]);

  return { postings, errors };
}

// Backwards-compatible name kept for the validation script.
export { fetchOne as fetchCompany };
