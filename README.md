# EE Jobs Radar

Tracks Summer 2027 electrical-engineering internships across aero, defense,
chips, auto, marine, and big engines. Hourly cron polls every target
company's job board, classifies the postings, and emails me when a new
match shows up.

Built to keep working free, indefinitely, with minimal maintenance. URL
will live at `https://<your-vercel-name>.vercel.app`.

## Coverage today (v1.1)

**Active: 18 companies** — pulling ~3,600 postings per cycle:

- **Aero**: SpaceX, Blue Origin, Boeing
- **Defense**: Lockheed Martin (Playwright), Northrop Grumman (Playwright),
  Palantir, Epirus
- **Chips**: NVIDIA, Intel, Broadcom, Marvell, Analog Devices, Micron,
  Applied Materials, KLA
- **Auto**: Aurora, Zoox
- **Marine**: Saronic

Sixteen companies use standard ATS JSON APIs (Greenhouse, Lever, Workday,
Ashby) — fast, ~5 seconds total. Two more (Lockheed, Northrop) use
Playwright headless Chromium because their ATSes (BrassRing, Eightfold)
have no public JSON. The Playwright pair adds about 8 seconds.

**Deferred: ~43 companies** in `data/companies-future.json` — RTX, AMD,
Qualcomm, Ford, GM, Cummins, etc. RTX is behind Cloudflare's bot challenge;
others use anti-scraped ATSes (Phenom, iCIMS, TalentBrew, Beamery). Plan:
add an "email-bridge" in v2 — sign up for each company's free job-alert
emails, forward to a special inbox, parse the HTML into postings.

## Architecture (one paragraph)

A scheduled GitHub Action runs `scripts/poll.ts` hourly. The script reads
`data/companies.json` (the target list), fetches each company's public
ATS feed (Greenhouse / Lever / Workday / Ashby), normalizes results into
a `Posting` shape, runs each title through `lib/classify.ts` to flag
"Summer 2027" and "EE-relevant", diffs against the previous run stored
in `data/postings.json`, sends an email digest of NEW matches via
Resend, and commits the updated `postings.json` back to `main`. Vercel
redeploys on each commit, so the dashboard at `/` always shows the
latest data straight from the JSON file.

## Local setup

```bash
# Inside ~/personal/ee-jobs-radar/
npm install                                # installs deps (one-time)
npx playwright install chromium            # downloads headless Chrome (~250MB, one-time)
cp .env.local.example .env.local           # then fill in RESEND_API_KEY + ALERT_EMAIL_TO
```

## Common commands

```bash
# Start the dev server to see the dashboard:
npm run dev
# then open http://localhost:3000

# Validate every company's ATS endpoint (run after editing companies.json):
npx tsx scripts/validate-companies.ts

# Run the polling script once locally (writes to data/postings.json):
npx tsx scripts/poll.ts
```

## Deploying (one-time, ~20 min)

### 1. GitHub
1. Sign up at [github.com](https://github.com) with a personal account.
2. Create a new repository called `ee-jobs-radar` (private is fine).
3. From this directory:
   ```bash
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/<your-username>/ee-jobs-radar.git
   git branch -M main
   git push -u origin main
   ```

### 2. Resend (for email alerts)
1. Sign up at [resend.com](https://resend.com) — no credit card.
2. Create an API key from the dashboard.
3. In the GitHub repo: Settings → Secrets and variables → Actions →
   add these two secrets:
   - `RESEND_API_KEY` — the key you just created
   - `ALERT_EMAIL_TO` — your email address
4. Resend will email that address a verification link. Click it.

### 3. Vercel (for the dashboard URL)
1. Sign up at [vercel.com](https://vercel.com) with the same GitHub account.
2. Click "Add New… → Project", import the `ee-jobs-radar` repo.
3. Defaults work — no env vars needed for the dashboard itself.
4. After deploy, your URL is `https://ee-jobs-radar-<hash>.vercel.app`.
   In Vercel settings you can give it a cleaner name.

### 4. First run
1. In GitHub → Actions → "poll" → "Run workflow" → confirm it succeeds.
2. Visit your Vercel URL; the dashboard will show the empty state until
   real Summer 2027 postings start landing (typically Aug-Oct 2026).

## Editing the target company list

Edit `data/companies.json`. Each entry needs:

- **Greenhouse / Lever / Ashby**: just `name`, `sector`, `ats`, `slug`.
- **Workday**: `name`, `sector`, `ats: "workday"`, plus `host`, `tenant`,
  and `site`. The site name varies per company — Boeing uses
  `EXTERNAL_CAREERS`, NVIDIA uses `NVIDIAExternalCareerSite`. These come
  from the public Workday URL.

After editing, run `npx tsx scripts/validate-companies.ts` to see which
URLs return 200 and which need fixing.

## Maintenance reality check

ATS feed formats drift over time. Realistic touch-up: a couple of hours
once or twice a year when something breaks. The validation script will
tell you exactly which company to fix.

## v2 plan — email-bridge for protected ATS

Companies in `data/companies-future.json` use ATS systems with anti-bot
protection. Approach: sign up for their free email job alerts, forward
those emails to a special address, parse the HTML into Postings.

Rough plan:
1. Buy a cheap domain or use a Gmail filter that forwards to a webhook.
2. Add an `app/api/inbound/route.ts` endpoint that receives forwarded
   emails (via Resend Inbound or webhook).
3. Per-company HTML parsers in `lib/email-parsers/` (one per company —
   ~30 lines each).
4. Same Posting shape, same classifier, same dashboard.

Sign up for alerts on each company's careers site (linked in
`companies-future.json`).
