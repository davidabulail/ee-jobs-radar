// One-shot probe to understand a site's structure for scraper-writing.
// Usage: npx tsx scripts/probe-site.ts <url>
//
// Loads the page in a real headless Chromium, waits for content, then prints:
//   - the rendered HTML structure summary (counts of common job-card patterns)
//   - the network requests it made (so we can spot internal JSON APIs)
//   - example text from each candidate job card
//
// This is a development tool only; not part of the production pipeline.

import { chromium } from "playwright";

async function probe(url: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Capture all network requests so we can spot internal JSON APIs.
  const apiHits: { url: string; method: string; status?: number }[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("api") || u.includes("/jobs") || u.endsWith(".json")) {
      apiHits.push({ url: u, method: req.method() });
    }
  });
  page.on("response", async (res) => {
    const u = res.url();
    if (u.includes("api") || u.includes("/jobs") || u.endsWith(".json")) {
      const hit = apiHits.find((h) => h.url === u);
      if (hit) hit.status = res.status();
    }
  });

  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // Wait a bit for client-side rendering to settle.
  await page.waitForTimeout(5_000);

  const title = await page.title();
  console.log(`\nTitle: ${title}`);
  console.log(`URL after load: ${page.url()}`);

  // Look for common job-card patterns and report counts.
  const patterns = [
    { name: "<a> with 'intern' in text", sel: "a" },
    { name: "elements with class containing 'job'", sel: "[class*=job i]" },
    { name: "elements with class containing 'card'", sel: "[class*=card i]" },
    { name: "elements with class containing 'posting'", sel: "[class*=posting i]" },
    { name: "<li> elements", sel: "li" },
    { name: "<article>", sel: "article" },
  ];

  console.log(`\nElement counts:`);
  for (const p of patterns) {
    const count = await page.locator(p.sel).count();
    console.log(`  ${p.name}: ${count}`);
  }

  // Sample text for any links that mention "intern".
  console.log(`\nLinks containing 'intern' (first 10):`);
  const internLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    return links
      .filter((a) => /intern/i.test(a.textContent ?? ""))
      .slice(0, 10)
      .map((a) => ({
        text: (a.textContent ?? "").trim().slice(0, 80),
        href: (a as HTMLAnchorElement).href,
      }));
  });
  for (const l of internLinks) {
    console.log(`  "${l.text}"  ->  ${l.href}`);
  }

  console.log(`\nAPI requests observed (first 20):`);
  for (const h of apiHits.slice(0, 20)) {
    console.log(`  ${h.method} ${h.status ?? "?"} ${h.url.slice(0, 130)}`);
  }

  await browser.close();
}

const url = process.argv[2];
if (!url) {
  console.error("Usage: npx tsx scripts/probe-site.ts <url>");
  process.exit(1);
}

probe(url).catch((err) => {
  console.error(err);
  process.exit(1);
});
