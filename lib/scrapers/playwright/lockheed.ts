// Lockheed Martin Playwright scraper.
//
// Background: Lockheed uses BrassRing/IBM Kenexa as its ATS, which has no
// public JSON API. The careers site at lockheedmartinjobs.com renders
// everything server-side though, so we don't need to wait for JS to load
// the data — we just need to fetch the HTML and parse it.
//
// We could in theory use plain `fetch`, but Lockheed sometimes adds bot
// detection that flips on for non-browser user agents. Playwright with a
// real browser is more reliable long-term.
//
// Strategy:
//   1. Navigate to /search-jobs/intern (URL-form keyword search)
//   2. The HTML contains the result list with `data-total-pages` so we know
//      how many pages to walk.
//   3. For each page, query `a[href*="/job/"]` for the listing rows and
//      pull title/location/url out of nested spans.

import type { Browser } from "playwright";
import type { Company, Posting, Sector } from "../../types";
import { makeContext } from "./browser";

// Lockheed search-results layout (from probe):
//   <li>
//     <a href="/job/..." data-job-id="...">
//       <span class="job-title">...</span>
//       <span class="job-location">...</span>
//       <span class="job-date-posted">Date Posted: MM/DD/YYYY</span>
//       <span class="job-id">Job ID: 731234BR</span>
//     </a>
//   </li>
//
// data-total-pages on #search-results tells us how many pages exist.

const BASE = "https://www.lockheedmartinjobs.com";
// Search by URL keyword: /search-jobs/<keyword>. We use "intern" to narrow
// from ~5000 jobs to ~50, since we only care about internship roles anyway.
const KEYWORD_PATH = "/search-jobs/intern";

export async function fetchLockheed(
  browser: Browser,
  company: Company
): Promise<Posting[]> {
  const context = await makeContext(browser);
  const page = await context.newPage();
  const all: Posting[] = [];
  const now = new Date().toISOString();

  try {
    // Load the first page to discover the total page count.
    await page.goto(BASE + KEYWORD_PATH, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    // Wait for the results container to be present in the DOM.
    await page.waitForSelector("#search-results", { timeout: 30_000 });

    const totalPages = await page.evaluate(() => {
      const el = document.querySelector("#search-results");
      const v = el?.getAttribute("data-total-pages");
      return v ? parseInt(v, 10) : 1;
    });

    // Cap at 5 pages (75 results) to bound runtime and avoid hitting them
    // too aggressively. Lockheed's Summer 2027 EE listings will be a small
    // subset of this anyway.
    const pages = Math.min(totalPages, 5);

    for (let p = 1; p <= pages; p++) {
      // The first page is already loaded; only navigate for p >= 2.
      if (p > 1) {
        await page.goto(`${BASE}${KEYWORD_PATH}?p=${p}`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await page.waitForSelector("#search-results-list", { timeout: 30_000 });
      }

      // Extract every listing in one page.evaluate so we don't pay
      // per-element round-trip cost.
      const rows = await page.evaluate(() => {
        const out: { id: string; title: string; location: string; href: string }[] = [];
        const anchors = document.querySelectorAll<HTMLAnchorElement>(
          "#search-results-list a[href*='/job/']"
        );
        for (const a of Array.from(anchors)) {
          const id = a.getAttribute("data-job-id") ?? "";
          const title =
            a.querySelector(".job-title")?.textContent?.trim() ?? "";
          const location =
            a.querySelector(".job-location")?.textContent?.trim() ?? "";
          if (!id || !title) continue;
          out.push({ id, title, location, href: a.href });
        }
        return out;
      });

      for (const r of rows) {
        all.push({
          id: `lockheed:${r.id}`,
          company: company.name,
          sector: company.sector as Sector,
          title: r.title,
          location: r.location,
          url: r.href,
          // Lockheed shows "Date Posted: MM/DD/YYYY" as plain text; not
          // worth parsing each row's date when firstSeenAt does the job.
          postedAt: "",
          isSummer2027: false,
          isEE: false,
          firstSeenAt: now,
        });
      }
    }
  } finally {
    await context.close();
  }

  return all;
}
