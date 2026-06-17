// Shared headless-browser singleton for the Playwright-based scrapers.
//
// Why a singleton: launching Chromium takes 1-2 seconds per launch. If every
// per-company scraper launched its own browser, we'd waste minutes on cold
// starts. We launch once at the start of the cron run and tear down at the end.
//
// This is a small DX wrapper around Playwright's native API. The orchestrator
// calls `withBrowser(async (browser) => { ... use it ... })` and the lifecycle
// is managed for it.

import { chromium, type Browser, type BrowserContext } from "playwright";

// Caller passes in a function that takes a browser and returns its result.
// We launch, run, and tear down once. The single browser can host many pages
// in parallel via different contexts.
export async function withBrowser<T>(
  fn: (browser: Browser) => Promise<T>
): Promise<T> {
  // headless: true is the default but explicit for clarity. We pass --no-sandbox
  // because GitHub Actions runners run as root inside containers, and Chromium
  // refuses to start without it under root. Local Macs ignore the flag.
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

// Create a fresh browser context with sensible defaults that mimic a real
// desktop browser. We use one context per company so cookies and storage
// don't bleed between sites.
export async function makeContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
}
