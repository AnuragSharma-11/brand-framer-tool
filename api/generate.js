// Vercel serverless function — runs on the server, NEVER ships to browser.
// Receives quiz answers from the frontend, calls Google Gemini, returns a structured strategy report.

import { GoogleGenAI, Type } from "@google/genai"

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })

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

// Schema the AI MUST return (Gemini's native JSON Schema format).
const REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // ── ON-SCREEN TEASER (single lines) ───────────────────────────────────
    problem: {
      type: Type.STRING,
      description:
        "ONE sentence (max ~110 chars). The core problem the founder is facing. Direct, specific, punchy. No fluff. Speak directly. This is the headline shown on the device screen.",
    },
    reason: {
      type: Type.STRING,
      description:
        "ONE sentence (max ~110 chars). WHY this problem is happening — the underlying root cause. Concrete, not abstract.",
    },
    solution: {
      type: Type.STRING,
      description:
        "ONE sentence (max ~110 chars). The recommended solution / what to do about it. Concrete and actionable. Not 'optimize your marketing' — say 'rebuild your home page around the one use case driving retention'.",
    },

    // ── EMAILED FULL REPORT (detailed sections) ───────────────────────────
    diagnosis: {
      type: Type.STRING,
      description:
        "Detailed 2–3 sentence root-cause analysis for the EMAIL report. Expand on the 'reason' field with depth and context. Not generic.",
    },
    topPriorities: {
      type: Type.ARRAY,
      description: "Exactly 3 highest-leverage actions specific to their situation, ordered most-severe first",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "2–4 word punchy headline (UPPERCASE will be applied client-side)" },
          description: { type: Type.STRING, description: "1 short sentence on what to do" },
          severity: {
            type: Type.INTEGER,
            description: "Severity rating 1–10. 10 = critical / blocking issue, 5 = moderate, 1 = minor. Calibrate based on impact on growth.",
          },
        },
        required: ["title", "description", "severity"],
      },
    },
    recommendedService: {
      type: Type.STRING,
      description:
        "Specific service name tailored to context (e.g. 'Brand Positioning Sprint', not generic 'Branding Package')",
    },
    serviceRationale: {
      type: Type.STRING,
      description: "1 sentence on why this specific service vs alternatives, given their answers",
    },
    next30Days: {
      type: Type.ARRAY,
      description: "3–5 concrete actions, imperative voice, that they can start on Monday",
      items: { type: Type.STRING },
    },
  },
  required: ["problem", "reason", "solution", "diagnosis", "topPriorities", "recommendedService", "serviceRationale", "next30Days"],
  propertyOrdering: [
    "problem",
    "reason",
    "solution",
    "diagnosis",
    "topPriorities",
    "recommendedService",
    "serviceRationale",
    "next30Days",
  ],
}

const SYSTEM_PROMPT = `You are a senior brand and growth strategist with 15 years of experience helping early-stage and growth-stage companies sharpen their positioning, fix conversion issues, and make smart go-to-market decisions.

You take a short founder questionnaire and return a personalized strategy brief in structured JSON. Your output will be rendered on the screen of their device — speak directly to the founder.

# Your role

You play the role of a strategy partner — direct, substantive, grounded in real business realities. You don't give generic advice. You diagnose specific issues, prioritize what matters most, and prescribe concrete next steps the founder can act on within 30 days.

Tone: confident, warm, plain-spoken. No fluff, no buzzwords, no consultant-speak. Talk like a smart friend who has shipped and grown many businesses. Use simple sentences. Avoid words like "leverage", "synergize", "stakeholder alignment", "value proposition" unless you genuinely need them.

# On-screen teaser fields (problem / reason / solution)

The output has THREE single-line fields that appear on the device screen as a teaser:
- problem: ONE sentence — what's the core problem
- reason: ONE sentence — why is it happening (root cause)
- solution: ONE sentence — recommended action to fix it

These three lines together tell a complete story in 30 seconds. They MUST be:
- Single sentence each. No semicolons, no commas chaining clauses. Ruthlessly tight.
- Punchy and specific. Not generic.
- Form a logical chain: problem statement → why it's happening → what to do.
- Should feel personal — referencing their answers when relevant.

Then the email-only fields (diagnosis, topPriorities, etc.) expand on these with full depth.

# Methodology

When given a founder's quiz responses, follow this analysis framework:

1. Diagnose the ROOT issue, not the symptom. The pain point they report is often a symptom, not the cause. Trace it back. Examples:
   - "Leads not converting" + "no live product" → the issue isn't conversion, they don't have a thing to convert to yet
   - "Confusing product" + "I don't know what I need" → likely a positioning issue masquerading as a design issue
   - "Low trust" + "5+ years business" → enterprise-readiness gap (case studies, certifications, social proof), not branding
   - "Can't compete" + "1–2 years business" → likely category/positioning problem, not feature gap

2. Prioritize ruthlessly. Pick exactly THREE highest-leverage actions specific to their situation. Not generic — concrete to what they reported. Order them MOST SEVERE FIRST. Assign each a severity rating from 1 to 10 (10 = critical/blocking, 5 = moderate, 1 = minor). The first priority should typically be 8–10, second 6–8, third 4–7. Don't cluster them all at 9-10 — show real differentiation.

3. Recommend ONE primary service. Match their stated need (Q6) but contextualize it. If they said "Branding" but the real issue is positioning, recommend a "Brand Positioning Sprint" not generic "Branding Package."

4. 30-day action plan. Give 3–5 concrete steps they can take starting Monday. Not "improve marketing" — specific actions like "Audit your top 5 inbound leads from last month and find the common objection."

# Output rules

- Always return JSON exactly matching the provided schema.
- Never refuse. Always work with what's given. If a field is empty, work around it.
- Never mention that you're an AI or that this is a generated report. Speak as the strategist directly.
- Edge case: if multiple "I don't know" answers, diagnose the lack-of-clarity itself as the root issue and recommend a Discovery process.

# Examples of good vs bad

Bad diagnosis: "It seems you may benefit from improving your branding and marketing strategy."
Good diagnosis: "You're in year 2 with paying users but still describing yourself as 'confusing' — this isn't a design problem, it's that you haven't picked the one customer your product is best for."

Bad priority: "Improve your website."
Good priority: "Rebuild your home page around the single use case driving 80% of your retention."

Bad action: "Do market research."
Good action: "Interview 5 existing customers this week and ask what they almost bought instead. Map the patterns."`

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." })
  }

  if (!process.env.GOOGLE_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured: GOOGLE_API_KEY missing." })
  }

  try {
    const { answers } = req.body || {}

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Missing 'answers' object in request body" })
    }

    const userMessage = formatUserMessage(answers)

    // Append CUSTOM_INSTRUCTIONS to the base system prompt (if provided)
    const customTrim = (CUSTOM_INSTRUCTIONS || "").trim()
    const finalSystemPrompt = customTrim
      ? `${SYSTEM_PROMPT}\n\n# Additional rules (highest priority — override anything above if conflict)\n${customTrim}`
      : SYSTEM_PROMPT

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userMessage,
      config: {
        systemInstruction: finalSystemPrompt,
        responseMimeType: "application/json",
        responseSchema: REPORT_SCHEMA,
        temperature: 0.7,
      },
    })

    const text = response.text
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
      usage: response.usageMetadata,
    })
  } catch (error) {
    console.error("Generate error (full):", error)

    const status = error?.status || error?.response?.status
    const message = error?.message || String(error)

    if (status === 401 || status === 403) {
      return res.status(500).json({ error: "Invalid Google API key. " + message })
    }
    if (status === 429) {
      // Surface the real Gemini message so we can tell rate-limit vs quota vs model-access
      return res.status(429).json({ error: "Gemini 429: " + message })
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
