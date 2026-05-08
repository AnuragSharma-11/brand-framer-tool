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
const ACCENT = "#e63d2b"
const BG = "#fafaf7"
const CARD_BG = "#ffffff"
const TEXT = "#1a1a1a"
const TEXT_MUTED = "#6b6b6b"
const TEXT_DIM = "#aaaaaa"

// 📞 CONTACT INFO — edit these to your real details
const CONTACT = {
  callLink: "https://cal.com/your-handle/discovery-15min",   // 👈 Calendly / Cal.com link
  email:    "hello@brandhero.com",                            // 👈 your reply email
  phone:    "+91 98765 43210",                                // 👈 your phone (display)
  phoneTel: "+919876543210",                                  // 👈 same number, no spaces (for tel: link)
}

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
  const problem = escapeHtml(report.problem || "")
  const reason = escapeHtml(report.reason || "")
  const solution = escapeHtml(report.solution || "")
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
          <!-- Hero header — branded purple band -->
          <tr>
            <td style="padding:0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(135deg,#1a0808 0%,#3a1a1a 60%,#5a2820 100%);">
                <tr>
                  <td style="padding:36px 32px 32px;">
                    <div style="font-size:10px;color:rgba(255,255,255,0.55);letter-spacing:0.18em;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Brand Framer · Diagnostic Report</div>
                    <div style="font-size:28px;font-weight:700;color:#ffffff;line-height:1.2;letter-spacing:-0.01em;">Hi ${safeName},</div>
                    <div style="font-size:14px;color:rgba(255,255,255,0.75);margin-top:8px;line-height:1.55;max-width:480px;">Here's your full strategic readout. The on-screen view gave you the headline — this is the deep dive.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- THE 3 LINES — same teaser the user saw on screen, but framed clearly -->
          <tr>
            <td style="padding:32px 32px 8px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding:14px 18px;border-left:3px solid #d63b3b;background:#fef6f6;border-radius:6px;">
                    <div style="font-size:10px;color:#d63b3b;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Problem</div>
                    <div style="font-size:15px;color:${TEXT};line-height:1.45;font-weight:500;">${problem || diagnosis}</div>
                  </td>
                </tr>
                <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding:14px 18px;border-left:3px solid #c89020;background:#fff9eb;border-radius:6px;">
                    <div style="font-size:10px;color:#c89020;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Reason</div>
                    <div style="font-size:15px;color:${TEXT};line-height:1.45;font-weight:500;">${reason}</div>
                  </td>
                </tr>
                <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding:14px 18px;border-left:3px solid ${ACCENT};background:#f6f0ff;border-radius:6px;">
                    <div style="font-size:10px;color:${ACCENT};letter-spacing:0.14em;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Solution</div>
                    <div style="font-size:15px;color:${TEXT};line-height:1.45;font-weight:500;">${solution}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Section divider with title — start of detailed report -->
          <tr>
            <td style="padding:36px 32px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="border-top:1px solid #ebe7f3;padding-top:8px;">
                    <div style="font-size:11px;color:${TEXT_DIM};letter-spacing:0.18em;text-transform:uppercase;font-weight:600;text-align:center;">— Full Diagnostic Below —</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Diagnosis (detailed) -->
          <tr>
            <td style="padding:28px 32px 8px;">
              <div style="font-size:11px;color:${ACCENT};letter-spacing:0.1em;text-transform:uppercase;font-weight:600;margin-bottom:8px;">The Full Diagnosis</div>
              <div style="font-size:15px;color:${TEXT};line-height:1.65;">${diagnosis}</div>
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
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(135deg,#fff0ec 0%,#fff7f4 100%);border:1px solid rgba(230,61,43,0.3);border-radius:12px;">
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

          <!-- 📞 CONTACT CTA section — book a call (primary) + email + phone -->
          <tr>
            <td style="padding:32px 32px 8px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(135deg,#1a0808 0%,#3a1a1a 100%);border-radius:14px;">
                <tr>
                  <td style="padding:28px 28px 22px;text-align:center;">
                    <div style="font-size:11px;color:rgba(255,255,255,0.55);letter-spacing:0.18em;text-transform:uppercase;font-weight:600;margin-bottom:8px;">Ready to act on this?</div>
                    <div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.25;margin-bottom:6px;letter-spacing:-0.01em;">Talk it through with a strategist</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.55;margin-bottom:18px;max-width:420px;margin-left:auto;margin-right:auto;">15-minute call. No commitment. We'll go deeper on your specific situation.</div>

                    <!-- Primary CTA — Book a Call -->
                    <a href="${CONTACT.callLink}" target="_blank" style="display:inline-block;background:${ACCENT};color:#1a0808;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(230,61,43,0.4);">
                      Book a 15-min call →
                    </a>

                    <!-- Secondary contacts — email + phone -->
                    <div style="margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.1);font-size:12px;color:rgba(255,255,255,0.55);line-height:1.7;">
                      Or reach out directly:<br />
                      <a href="mailto:${CONTACT.email}" style="color:#d9c0ff;text-decoration:none;font-weight:500;">${CONTACT.email}</a>
                      &nbsp;·&nbsp;
                      <a href="tel:${CONTACT.phoneTel}" style="color:#d9c0ff;text-decoration:none;font-weight:500;">${CONTACT.phone}</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;color:${TEXT_DIM};font-size:11px;line-height:1.6;text-align:center;">
              You received this email because you completed the Brand Framer diagnostic questionnaire.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
