// Northrop Grumman Playwright scraper.
//
// Background: Northrop's careers site (jobs.northropgrumman.com) is built
// on Eightfold AI. Eightfold's API returns 403 to non-browser requests, so
// we have to drive a real browser to get the data.
//
// Quirk: Eightfold's "keywords=intern" search does FUZZY relevance ranking,
// not strict filtering — so even with the keyword, we get back roles that
// don't have "intern" in the title. That's fine: our classifier in
// lib/classify.ts will filter to actual intern-relevant + EE-relevant
// + Summer-2027 postings downstream. We just want to surface candidates.
//
// Selector strategy: Eightfold uses CSS Modules with hashed class names
// (e.g. `card-F1ebU`, `title-1aNJK`) that change on redeploys. We anchor
// on stable attributes instead:
//   - <a id="job-card-XXXX-job-list">    -- the listing card itself
//   - aria-label="View job: <title>"     -- the title with stable prefix
//   - href="/careers/job/<id>"            -- the job ID and URL

import type { Browser } from "playwright";
import type { Company, Posting, Sector } from "../../types";
import { makeContext } from "./browser";

const BASE = "https://jobs.northropgrumman.com";
// Eightfold "keywords=intern" returns ~hundreds of fuzzy-matched results.
// We pull the first 4 pages (50/page * 4 = 200 candidates) which the
// classifier then narrows. start= and num= are Eightfold's pagination params.
const PAGE_SIZE = 50;
const MAX_PAGES = 4;

export async function fetchNorthrop(
  browser: Browser,
  company: Company
): Promise<Posting[]> {
  const context = await makeContext(browser);
  const page = await context.newPage();
  const all: Posting[] = [];
  const now = new Date().toISOString();
  // Track ids we've already added to dedupe across pages — Eightfold
  // sometimes shows the same job twice when results are < page-size.
  const seen = new Set<string>();

  try {
    for (let p = 0; p < MAX_PAGES; p++) {
      const start = p * PAGE_SIZE;
      const url = `${BASE}/careers?keywords=intern&start=${start}&num=${PAGE_SIZE}&sort_by=timestamp`;

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      // Eightfold renders client-side. Wait for at least one job card.
      // If we time out it's probably a "no results" page; break gracefully.
      try {
        await page.waitForSelector('a[id^="job-card-"]', { timeout: 30_000 });
      } catch {
        break;
      }

      const rows = await page.evaluate(() => {
        const out: { id: string; title: string; href: string; raw: string }[] = [];
        const anchors = document.querySelectorAll<HTMLAnchorElement>(
          'a[id^="job-card-"]'
        );
        for (const a of Array.from(anchors)) {
          // The id attribute looks like "job-card-1340071545358-job-list".
          // Pull the numeric id out for our internal posting id.
          const idMatch = a.id.match(/job-card-(\d+)/);
          const id = idMatch ? idMatch[1] : "";
          // aria-label is the most reliable title source — set by Eightfold's
          // accessibility code, format "View job: <title>".
          const aria = a.getAttribute("aria-label") ?? "";
          const title = aria.replace(/^View job:\s*/i, "").trim();
          // The card text smushes title + location + dept on one line; keep
          // it as `raw` for diagnostics. We don't try to split further here
          // because the formatting varies.
          const raw = (a.textContent ?? "").trim().slice(0, 200);
          if (!id || !title) continue;
          out.push({ id, title, href: a.href, raw });
        }
        return out;
      });

      // If we got nothing on this page, no point fetching more.
      if (rows.length === 0) break;

      let novel = 0;
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        novel++;
        // Try to pluck location out of the raw card text. Eightfold
        // formats location strings like "United States-Virginia-Falls Church"
        // or "Remote". Look for that anywhere after the title.
        const locMatch = r.raw.match(
          /(United States[^A-Z]{0,80}|Remote|United Kingdom[^A-Z]{0,60}|Australia[^A-Z]{0,60}|Canada[^A-Z]{0,60})/
        );
        const location = locMatch ? locMatch[1].trim() : "";
        all.push({
          id: `northrop:${r.id}`,
          company: company.name,
          sector: company.sector as Sector,
          title: r.title,
          location,
          url: r.href,
          postedAt: "",
          isSummer2027: false,
          isEE: false,
          firstSeenAt: now,
        });
      }
      // If this page was less than full or had no new ids, we're done.
      if (rows.length < PAGE_SIZE || novel === 0) break;
    }
  } finally {
    await context.close();
  }

  return all;
}
