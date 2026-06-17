// Email sender via Resend. We use Resend (not SendGrid/Mailgun) because:
//   - 3,000 emails/month free, no card on file
//   - Single API call, no SMTP plumbing
//   - 1-line setup: just the API key
//
// Required env vars (set both locally in .env.local and in GitHub Actions secrets):
//   RESEND_API_KEY  — get from resend.com after signup
//   ALERT_EMAIL_TO  — your email
//   ALERT_EMAIL_FROM — sender address; with no custom domain, use
//                      "EE Jobs Radar <onboarding@resend.dev>" (Resend's
//                      free shared sender, only delivers to verified addresses)
//
// On verification: Resend free requires verifying ALERT_EMAIL_TO once
// (link they email you). This is a one-time setup step, not per email.

import type { Posting } from "./types";

export async function sendDigest(newMatches: Posting[]): Promise<void> {
  // Don't send empty emails; nothing more annoying than "0 new jobs!" spam.
  if (newMatches.length === 0) return;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM ?? "EE Jobs Radar <onboarding@resend.dev>";

  // If env isn't configured, log loudly but don't fail the cron run —
  // the dashboard still works without email.
  if (!apiKey || !to) {
    console.warn("Email skipped: RESEND_API_KEY or ALERT_EMAIL_TO not set");
    return;
  }

  const html = renderHtml(newMatches);
  const subject = `[EE Radar] ${newMatches.length} new Summer 2027 posting${newMatches.length === 1 ? "" : "s"}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed: HTTP ${res.status} ${body}`);
  }
}

// Build a simple, scannable HTML email. Plain inline styles only —
// no Tailwind here because email clients hate stylesheets.
function renderHtml(matches: Posting[]): string {
  const rows = matches
    .map(
      (p) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top;">
        <div style="font-weight:600;font-size:15px;">
          <a href="${escape(p.url)}" style="color:#0b5cad;text-decoration:none;">
            ${escape(p.title)}
          </a>
        </div>
        <div style="color:#555;font-size:13px;margin-top:2px;">
          ${escape(p.company)} · ${escape(p.sector)} · ${escape(p.location || "—")}
        </div>
      </td>
    </tr>`
    )
    .join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="font-size:18px;margin:0 0 12px;">${matches.length} new Summer 2027 EE posting${matches.length === 1 ? "" : "s"}</h2>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="color:#888;font-size:12px;margin-top:16px;">
        Sent by ee-jobs-radar. Reply STOP to ignore (or just unstar).
      </p>
    </div>
  `;
}

// Minimal HTML escape — covers the characters that matter for the fields
// we emit (titles, company names, locations).
function escape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
