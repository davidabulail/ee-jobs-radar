// One-shot script to sanity-check every company's ATS endpoint.
// Run this after adding/editing data/companies.json:
//   npx tsx scripts/validate-companies.ts
//
// Reports which companies' feeds return 200 (good), which 404 (typo in slug
// or wrong host/tenant/site), and which throw other errors.
//
// This is the primary tool for fixing Workday entries — those are guesses
// until proven, and this script tells you which ones are wrong.

import { loadCompanies } from "../lib/storage";
import { fetchCompany } from "../lib/scrapers";

async function main() {
  const companies = await loadCompanies();
  console.log(`Validating ${companies.length} companies...\n`);

  const results: { name: string; ok: boolean; count: number; error?: string }[] = [];

  // Sequential, not parallel, so console output stays readable.
  for (const company of companies) {
    process.stdout.write(`  ${company.name.padEnd(36)} `);
    try {
      const postings = await fetchCompany(company);
      results.push({ name: company.name, ok: true, count: postings.length });
      console.log(`OK (${postings.length} postings)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: company.name, ok: false, count: 0, error: msg });
      console.log(`FAIL — ${msg}`);
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nSummary: ${ok} OK, ${fail} FAIL`);
  if (fail > 0) {
    console.log("\nFailing companies (fix data/companies.json):");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
