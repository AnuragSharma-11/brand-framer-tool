// Vercel serverless function — sends the AI-generated strategy report by email via Resend.
// Receives { email, name, report } from the frontend, formats an HTML email, dispatches it.

import { Resend } from "resend"

// Lazy init so the module doesn't crash if env is missing
let _resend = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

// Brand palette for the email body
const ACCENT = "#b46cff"
const BG = "#fafaf7"
const CARD_BG = "#ffffff"
const TEXT = "#1a1a1a"
const TEXT_MUTED = "#6b6b6b"
const TEXT_DIM = "#aaaaaa"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." })
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured: RESEND_API_KEY missing." })
  }

  try {
    const { email, name, report } = req.body || {}

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'email'" })
    }
    if (!report || typeof report !== "object") {
      return res.status(400).json({ error: "Missing 'report' object" })
    }

    const html = buildEmailHTML(report, name || "there")
    const subject = `Your Strategy Report — ${report.recommendedService || "Personalized recommendation"}`

    const result = await getResend().emails.send({
      // NOTE: `onboarding@resend.dev` is Resend's test address — works without domain verification.
      // For production / sending to anyone, verify your own domain in Resend dashboard and switch this.
      from: "Brand Framer <onboarding@resend.dev>",
      to: [email],
      subject,
      html,
    })

    if (result.error) {
      console.error("Resend error:", result.error)
      return res.status(500).json({ error: result.error.message || "Failed to send email" })
    }

    return res.status(200).json({ success: true, id: result.data?.id })
  } catch (e) {
    console.error("send-report error:", e)
    return res.status(500).json({ error: e.message || "Failed to send report" })
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function buildEmailHTML(report, name) {
  const diagnosis = escapeHtml(report.diagnosis)
  const recommendedService = escapeHtml(report.recommendedService)
  const serviceRationale = escapeHtml(report.serviceRationale)
  const safeName = escapeHtml(name)

  const prioritiesHTML = (report.topPriorities || [])
    .map(
      (p, i) => `
      <tr>
        <td style="padding:10px 14px;background:#f6f3fb;border-radius:8px;border-left:3px solid ${ACCENT};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="color:${TEXT};font-size:14px;">${String(i + 1).padStart(2, "0")} ${escapeHtml(p.title)}</strong>
            <span style="color:${ACCENT};font-size:12px;font-weight:700;">${p.severity || 5}/10</span>
          </div>
          <div style="color:${TEXT_MUTED};font-size:13px;line-height:1.5;">${escapeHtml(p.description)}</div>
        </td>
      </tr>
      <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
    `
    )
    .join("")

  const nextStepsHTML = (report.next30Days || [])
    .map(
      (step, i) => `
      <tr>
        <td style="padding:8px 0;color:${TEXT};font-size:13px;line-height:1.5;">
          <strong style="color:${ACCENT};display:inline-block;width:24px;">${String(i + 1).padStart(2, "0")}</strong>
          ${escapeHtml(step)}
        </td>
      </tr>
    `
    )
    .join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Strategy Report</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT};">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:${CARD_BG};border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 16px;border-bottom:1px solid #f0eef5;">
              <div style="font-size:11px;color:${TEXT_DIM};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Brand Framer · Strategy Report</div>
              <div style="font-size:22px;font-weight:700;color:${TEXT};line-height:1.25;">Hi ${safeName},</div>
              <div style="font-size:14px;color:${TEXT_MUTED};margin-top:4px;line-height:1.5;">Here's your personalized strategy based on the questionnaire you completed.</div>
            </td>
          </tr>

          <!-- Diagnosis -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <div style="font-size:11px;color:${ACCENT};letter-spacing:0.1em;text-transform:uppercase;font-weight:600;margin-bottom:6px;">Diagnosis</div>
              <div style="font-size:15px;color:${TEXT};line-height:1.55;">${diagnosis}</div>
            </td>
          </tr>

          <!-- Top priorities -->
          <tr>
            <td style="padding:20px 32px 8px;">
              <div style="font-size:11px;color:${ACCENT};letter-spacing:0.1em;text-transform:uppercase;font-weight:600;margin-bottom:10px;">Top Priorities</div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                ${prioritiesHTML}
              </table>
            </td>
          </tr>

          <!-- Recommended service hero -->
          <tr>
            <td style="padding:20px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(135deg,#f0e6ff 0%,#f7f0ff 100%);border:1px solid rgba(180,108,255,0.3);border-radius:12px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <div style="font-size:11px;color:${ACCENT};letter-spacing:0.1em;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Recommended for you</div>
                    <div style="font-size:20px;font-weight:700;color:${TEXT};line-height:1.2;margin-bottom:6px;">${recommendedService}</div>
                    <div style="font-size:13px;color:${TEXT_MUTED};line-height:1.5;">${serviceRationale}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Next 30 days -->
          <tr>
            <td style="padding:20px 32px 8px;">
              <div style="font-size:11px;color:${ACCENT};letter-spacing:0.1em;text-transform:uppercase;font-weight:600;margin-bottom:6px;">Next 30 days</div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                ${nextStepsHTML}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f0eef5;color:${TEXT_DIM};font-size:11px;line-height:1.6;">
              You received this email because you completed the Brand Framer diagnostic questionnaire.<br />
              Reply to this email if you want to chat about implementing this strategy.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
