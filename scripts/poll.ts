// The hourly cron entry point. GitHub Actions runs this script every hour.
// Flow:
//   1. Load list of target companies from data/companies.json
//   2. Load previously-seen postings from data/postings.json
//   3. Fetch every company's current postings via the right ATS scraper
//   4. Classify each posting (Summer 2027? EE-relevant?)
//   5. Diff against previous state — find postings we haven't seen before
//      that are also Summer 2027 + EE
//   6. Save the merged result back to data/postings.json
//   7. Email the new matches
//
// On commit: GitHub Actions stages and pushes data/postings.json after this
// runs, which triggers a Vercel redeploy with the latest data baked in.

import { loadCompanies, loadPostings, savePostings } from "../lib/storage";
import { fetchAll } from "../lib/scrapers";
import { isEE, isSummer2027 } from "../lib/classify";
import { sendDigest } from "../lib/email";
import type { Posting } from "../lib/types";

async function main() {
  const startedAt = Date.now();
  const companies = await loadCompanies();
  const previous = await loadPostings();
  console.log(`Polling ${companies.length} companies; ${previous.length} known postings`);

  const { postings, errors } = await fetchAll(companies);
  console.log(`Fetched ${postings.length} raw postings; ${errors.length} errors`);
  for (const e of errors) console.warn(`  - ${e.company}: ${e.error}`);

  // Classify each posting in-place.
  for (const p of postings) {
    p.isSummer2027 = isSummer2027(p.title);
    p.isEE = isEE(p.title);
  }

  // Build a lookup by id so we can detect "new" — postings we've never seen
  // before — vs. "still around" — known postings still listed.
  const previousById = new Map<string, Posting>();
  for (const p of previous) previousById.set(p.id, p);

  // For postings we've seen before, preserve their ORIGINAL firstSeenAt
  // so the dashboard sort stays stable. Only brand-new postings get a fresh
  // firstSeenAt from the scraper run.
  const merged: Posting[] = [];
  const newMatches: Posting[] = [];
  for (const p of postings) {
    const existing = previousById.get(p.id);
    if (existing) {
      merged.push({ ...p, firstSeenAt: existing.firstSeenAt });
    } else {
      merged.push(p);
      // Only alert on postings that actually match our criteria.
      if (p.isSummer2027 && p.isEE) newMatches.push(p);
    }
  }

  console.log(`${newMatches.length} NEW Summer 2027 EE matches this run`);
  for (const m of newMatches) {
    console.log(`  + ${m.company}: ${m.title}`);
  }

  await savePostings(merged);
  await sendDigest(newMatches);

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done in ${seconds}s`);
}

main().catch((err) => {
  console.error("Poll failed:", err);
  process.exit(1);
});
