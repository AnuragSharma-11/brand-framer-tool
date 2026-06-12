// Vercel serverless function — runs on the server, NEVER ships to browser.
// Receives quiz answers from the frontend, calls OpenAI, returns a structured strategy report.

import OpenAI from "openai"

// Lazy init so module loads even when env is missing / SDK init throws.
let _ai = null
function getAI() {
  if (!_ai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Server misconfigured: OPENAI_API_KEY missing.")
    }
    _ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _ai
}

// Default model — change here if you want gpt-4o (higher quality, ~10× cost) or gpt-4-turbo.
const OPENAI_MODEL = "gpt-4o-mini"

/* ════════════════════════════════════════════════════════════════════════
 * 🎛️  CUSTOM INSTRUCTIONS — edit this freely to control the report
 * ════════════════════════════════════════════════════════════════════════
 *
 * Add ANY natural-language instructions here. The AI will follow them
 * for every report it generates. Push to git → Vercel auto-redeploys.
 *
 * EXAMPLES (uncomment / mix as needed):
 * ─────────────────────────────────────────────────────────────────
 *  • "Always respond in Hinglish (mix of Hindi + English)."
 *  • "Diagnosis must be ONE sentence only — no more."
 *  • "Recommended service must always be ₹50,000 to ₹2,00,000 range."
 *  • "Tone: tough-love mentor. Be direct, slightly provocative."
 *  • "Skip generic advice — every priority must reference their specific industry."
 *  • "Always end the recommendation with: 'Book a call to start.'"
 *  • "Focus 80% on positioning / brand-clarity issues, 20% on execution."
 *  • "Never use the words: leverage, synergy, holistic, optimize, ecosystem."
 * ─────────────────────────────────────────────────────────────────
 *
 * Leave EMPTY (just `\`\``) for default behaviour.
 */
const CUSTOM_INSTRUCTIONS = `
`

// Schema the AI MUST return (standard JSON Schema, OpenAI structured-output compatible).
// OpenAI strict mode requires: every property in `required`, `additionalProperties: false` on every object.
const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    // ── ON-SCREEN TEASER (single lines) ───────────────────────────────────
    problem: {
      type: "string",
      description:
        "ONE sentence (max ~110 chars). The core problem the founder is facing. Direct, specific, punchy. No fluff. Speak directly. This is the headline shown on the device screen.",
    },
    reason: {
      type: "string",
      description:
        "ONE sentence (max ~110 chars). WHY this problem is happening — the underlying root cause. Concrete, not abstract.",
    },
    solution: {
      type: "string",
      description:
        "ONE sentence (max ~110 chars). The recommended solution / what to do about it. Concrete and actionable. Not 'optimize your marketing' — say 'rebuild your home page around the one use case driving retention'.",
    },

    // ── EMAILED FULL REPORT (detailed sections) ───────────────────────────
    diagnosis: {
      type: "string",
      description:
        "Detailed 2–3 sentence root-cause analysis for the EMAIL report. Expand on the 'reason' field with depth and context. Not generic.",
    },
    topPriorities: {
      type: "array",
      description: "Exactly 3 highest-leverage actions specific to their situation, ordered most-severe first",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "2–4 word punchy headline (UPPERCASE will be applied client-side)" },
          description: { type: "string", description: "1 short sentence on what to do" },
          severity: {
            type: "integer",
            description: "Severity rating 1–10. 10 = critical / blocking issue, 5 = moderate, 1 = minor. Calibrate based on impact on growth.",
          },
        },
        required: ["title", "description", "severity"],
      },
    },
    recommendedService: {
      type: "string",
      description:
        "Specific service name tailored to context (e.g. 'Brand Positioning Sprint', not generic 'Branding Package')",
    },
    serviceRationale: {
      type: "string",
      description: "1 sentence on why this specific service vs alternatives, given their answers",
    },
    next30Days: {
      type: "array",
      description: "3–5 concrete actions, imperative voice, that they can start on Monday",
      items: { type: "string" },
    },
  },
  required: [
    "problem", "reason", "solution", "diagnosis",
    "topPriorities", "recommendedService", "serviceRationale", "next30Days",
  ],
}

const SYSTEM_PROMPT = `You are a senior brand & growth strategist (15 yrs) returning a personalized strategy brief in structured JSON. Speak directly to the founder.

# Tone
Confident, warm, plain-spoken. No fluff, no buzzwords. Like a smart friend who has shipped many businesses. Avoid: leverage, synergize, stakeholder alignment, value proposition.

# Teaser fields (problem / reason / solution)
Three single-line fields shown on the device screen. Each:
- ONE sentence, no semicolons, no chained clauses. Tight.
- Punchy, specific, never generic.
- Chain: problem → why → what to do.
- Reference their answers when relevant.

# Methodology
1. Diagnose the ROOT issue, not the symptom. Trace pain to cause.
   • "Leads not converting" + no live product → not conversion, missing product to convert TO.
   • "Confusing product" + "I don't know" → positioning, not design.
   • "Low trust" + 5+ yrs → enterprise-readiness gap (case studies, certs), not branding.
   • "Can't compete" + 1–2 yrs → category/positioning, not features.

2. Pick exactly 3 priorities, ordered MOST SEVERE FIRST. Severity 1–10. First usually 8–10, second 6–8, third 4–7. Differentiate.

3. Recommend ONE primary service tailored to context. If they said "Branding" but real issue is positioning, recommend "Brand Positioning Sprint", not generic "Branding Package".

4. 30-day plan: 3–5 concrete imperative actions for Monday. Not "improve marketing" — say "Interview 5 customers this week and map their objections."

# Output rules
- JSON must match the provided schema exactly.
- Never refuse, never mention you're an AI. Work with what's given.
- If multiple "I don't know" answers → diagnose the lack-of-clarity itself; recommend a Discovery process.

# Good vs bad
BAD: "It seems you may benefit from improving your branding."
GOOD: "You're in year 2 with paying users but still describe yourself as 'confusing' — you haven't picked the one customer your product is best for."

BAD: "Improve your website."
GOOD: "Rebuild your home page around the use case driving 80% of retention."

BAD: "Do market research."
GOOD: "Interview 5 existing customers this week, ask what they almost bought instead, map the patterns."`

// 🛡 Simple in-memory rate limiter — caps abuse on the paid OpenAI endpoint.
// Per IP: max 10 generations per 10-minute window.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 10
const rateBucket = new Map()
function checkRateLimit(ip) {
  const now = Date.now()
  const entry = rateBucket.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_LIMIT_WINDOW_MS }
  entry.count++
  rateBucket.set(ip, entry)
  return entry.count <= RATE_LIMIT_MAX
}

// Hard cap on per-field length so users can't blow up our prompt → OpenAI quota
const MAX_FIELD_LEN = 1000
const ALLOWED_FIELDS = ["liveProduct", "industry", "url", "businessAge", "hurt", "need", "recentChange"]

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured: OPENAI_API_KEY missing." })
  }

  // Rate-limit by client IP
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown"
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Please try again in a few minutes." })
  }

  try {
    const { answers } = req.body || {}

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Missing 'answers' object in request body" })
    }

    // Sanitize: build a clean answers object containing only known fields, each capped in length.
    const safeAnswers = {}
    for (const k of ALLOWED_FIELDS) {
      const v = answers[k]
      if (typeof v === "string") safeAnswers[k] = v.slice(0, MAX_FIELD_LEN)
    }

    const userMessage = formatUserMessage(safeAnswers)

    // Append CUSTOM_INSTRUCTIONS to the base system prompt (if provided)
    const customTrim = (CUSTOM_INSTRUCTIONS || "").trim()
    const finalSystemPrompt = customTrim
      ? `${SYSTEM_PROMPT}\n\n# Additional rules (highest priority — override anything above if conflict)\n${customTrim}`
      : SYSTEM_PROMPT

    const response = await getAI().chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: finalSystemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "strategy_report",
          strict: true,
          schema: REPORT_SCHEMA,
        },
      },
      // ── Speed tweaks ──────────────────────────────────────────────────
      temperature: 0.5,        // lower temp = more decisive, slightly faster
      max_tokens: 900,         // hard cap so the model stops generating once report is complete
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    })

    const text = response?.choices?.[0]?.message?.content
    if (!text) {
      return res.status(500).json({ error: "AI returned empty response. Try again." })
    }

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: "AI returned malformed JSON. Try again." })
    }

    return res.status(200).json({
      report: parsed,
      usage: response.usage,
    })
  } catch (error) {
    console.error("Generate error (full):", error)

    const status = error?.status || error?.response?.status
    const message = error?.message || String(error)

    if (status === 401 || status === 403) {
      return res.status(500).json({ error: "Invalid OpenAI API key. " + message })
    }
    if (status === 429) {
      return res.status(429).json({ error: "OpenAI 429 (rate limit or quota): " + message })
    }
    if (status === 400) {
      return res.status(400).json({ error: "Bad request: " + message })
    }

    return res.status(500).json({ error: "Generate failed: " + message })
  }
}

function formatUserMessage(a) {
  return `A founder just completed the questionnaire. Their answers:

- Live product: ${a.liveProduct || "(not answered)"}
- Industry: ${a.industry || "(not answered)"}
- Website / URL: ${a.url || "(not provided)"}
- Business age: ${a.businessAge || "(not answered)"}
- Pain point right now: ${a.hurt || "(not answered)"}
- What they think they need: ${a.need || "(not answered)"}
- One thing that changed in the last 90 days: ${a.recentChange || "(not provided)"}

Generate their personalized strategy report in the required JSON schema.`
}
