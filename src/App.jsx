import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Html, useGLTF, Center, Environment, ContactShadows, RoundedBox, Text } from "@react-three/drei"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"

/* ---------------- AUDIO (Web Audio API — no files needed) ---------------- */
let _audioCtx = null
function getAudioCtx() {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      return null
    }
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume()
  return _audioCtx
}

function playTone({ freq, type = "sine", volume = 0.08, attack = 0.005, duration = 0.08, startOffset = 0 }) {
  const ctx = getAudioCtx()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t = ctx.currentTime + startOffset
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

// Subtle high-pitched tick — feels light, non-intrusive
function playHover() {
  playTone({ freq: 1200, type: "sine", volume: 0.025, duration: 0.04 })
}

// 2-note rising arpeggio (A5 → E6) — pleasant confirmation chime
function playSelect() {
  playTone({ freq: 880, type: "triangle", volume: 0.09, duration: 0.08, startOffset: 0 })
  playTone({ freq: 1320, type: "triangle", volume: 0.08, duration: 0.1, startOffset: 0.045 })
}

// 2-note descending — "going back" feel
function playBack() {
  playTone({ freq: 660, type: "triangle", volume: 0.07, duration: 0.07, startOffset: 0 })
  playTone({ freq: 440, type: "triangle", volume: 0.06, duration: 0.09, startOffset: 0.04 })
}

/* ---------------- CINEMATIC SCROLL ---------------- */
// Custom smooth scroll with easeInOutCubic — slower, more deliberate than native.
// `target` can be a DOM element OR a function returning one (lets ref settle after mount).
function smoothScrollToElement(target, { duration = 2000, delay = 0, offset = 0 } = {}) {
  setTimeout(() => {
    const el = typeof target === "function" ? target() : target
    if (!el) return
    const startY = window.scrollY || document.documentElement.scrollTop
    const targetY = el.getBoundingClientRect().top + startY + offset
    const distance = targetY - startY
    if (Math.abs(distance) < 1) return
    const startTime = performance.now()

    // easeInOutCubic — slow start, fast middle, gentle settle
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

    function step(now) {
      const elapsed = now - startTime
      const p = Math.min(elapsed / duration, 1)
      // behavior: "auto" bypasses CSS scroll-behavior: smooth (which would fight our easing)
      window.scrollTo({ top: startY + distance * ease(p), behavior: "auto" })
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, delay)
}

/* ---------------- QUIZ UI ---------------- */
const ACCENT = "#b46cff"
const BG = "#0d0d0d"
const TEXT_PRIMARY = "#ffffff"
const TEXT_MUTED = "#888888"
const TEXT_DIM = "#5a5a5a"

// 🟢 Diagnostic mode (Step 8 only) — lime/mono cyberpunk dashboard
const LIME = "#b4f03d"
const LIME_DIM = "#5a7a1f"
const PURE_BLACK = "#000000"
const MONO = '"Space Mono", "JetBrains Mono", "Courier New", monospace'

const STEPS_META = [
  { num: "01", title: "LIVE PRODUCT", question: "Do you have a live product?" },
  { num: "02", title: "INDUSTRY", question: "What is your industry type?" },
  { num: "03", title: "WEBSITE URL", question: "What is your URL?" },
  { num: "04", title: "BUSINESS AGE", question: "How old is your business?" },
  { num: "05", title: "PAIN POINT", question: "Where does it hurt most right away?" },
  { num: "06", title: "WHAT YOU NEED", question: "What do you think you need?" },
  { num: "07", title: "RECENT CHANGE", question: "If one thing changed in the last 90 days, what is it?" },
  { num: "08", title: "YOUR REPORT", question: "Your personalized strategy" },
]

const LIVE_PRODUCT_OPTS = ["Yes", "No"]
const INDUSTRY_OPTS = ["Technology", "Healthcare", "Finance", "Education", "Retail", "Manufacturing", "Other"]
const BUSINESS_AGE_OPTS = ["Less than 1 year", "1–2 years", "3–5 years", "5+ years"]
const HURT_OPTS = ["Leads not converting", "Low trust", "Confusing product", "Can't compete", "I don't know"]
const NEED_OPTS = ["Branding", "Website", "Marketing", "Product Design", "Not sure — tell me"]

function BatteryIcon({ color = "#cccccc" }) {
  return (
    <svg width="18" height="10" viewBox="0 0 22 12" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="18" height="10" rx="2" stroke={color} strokeWidth="1.2" />
      <rect x="3" y="3" width="14" height="6" rx="0.5" fill={color} />
      <rect x="20" y="4" width="2" height="4" rx="0.5" fill={color} />
    </svg>
  )
}

function Chevron({ color = TEXT_DIM }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M3 1.5L7 5L3 8.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: TEXT_DIM, flexShrink: 0 }}>{label}</span>
      <span style={{ color: TEXT_PRIMARY, fontWeight: 500, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value || "—"}
      </span>
    </div>
  )
}

/* ---- Diagnostic-mode (Step 8) helpers ---- */
function DiagSectionLabel({ children }) {
  return (
    <div style={{ fontSize: 9, color: LIME_DIM, letterSpacing: "0.12em", marginTop: 4 }}>
      {`> ${children}`}
    </div>
  )
}

function DiagCard({ children }) {
  return (
    <div style={{ border: `1px solid ${LIME_DIM}`, borderRadius: 6, padding: "8px 10px" }}>
      {children}
    </div>
  )
}

function IssueRow({ num, title, description, severity }) {
  // severity 1–10 → bar fill 10–100%
  const fill = Math.min(Math.max(severity * 10, 10), 100)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          background: LIME, color: PURE_BLACK, fontWeight: 700,
          fontSize: 10, padding: "2px 5px", borderRadius: 3, letterSpacing: "0.04em",
          minWidth: 22, textAlign: "center", flexShrink: 0,
        }}>
          {String(num).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 11, color: LIME, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", flex: 1 }}>
          {title}
        </span>
        <span style={{ fontSize: 9, color: LIME_DIM, flexShrink: 0 }}>{severity}/10</span>
      </div>
      {/* severity bar */}
      <div style={{ height: 4, background: "rgba(180, 240, 61, 0.15)", borderRadius: 2, overflow: "hidden", marginLeft: 30 }}>
        <div style={{ height: "100%", width: `${fill}%`, background: LIME, transition: "width 0.4s ease-out" }} />
      </div>
      <div style={{ fontSize: 10, color: LIME_DIM, lineHeight: 1.4, marginLeft: 30 }}>
        {description}
      </div>
    </div>
  )
}

const diagInputStyle = {
  width: "100%",
  background: "transparent",
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 6,
  padding: "9px 12px",
  color: LIME,
  fontSize: 11,
  outline: "none",
  boxSizing: "border-box",
  cursor: "text",
  userSelect: "auto",
  WebkitUserSelect: "auto",
  fontFamily: MONO,
  letterSpacing: "0.04em",
  transition: "border-color 0.15s",
}

function OptionRow({ label, selected, onClick }) {
  const [hover, setHover] = useState(false)

  // Color resolution priority: selected > hover > default
  const textColor = selected ? ACCENT : hover ? "#cccccc" : TEXT_MUTED
  const bgColor = selected
    ? hover ? "rgba(180, 108, 255, 0.10)" : "rgba(180, 108, 255, 0.05)"
    : hover ? "rgba(255, 255, 255, 0.04)" : "transparent"
  const borderColor = selected
    ? "rgba(180, 108, 255, 0.5)"
    : hover ? "rgba(255, 255, 255, 0.08)" : "transparent"
  const chevColor = selected ? ACCENT : hover ? "#aaaaaa" : TEXT_DIM

  return (
    <div
      onClick={() => { playSelect(); onClick() }}
      onMouseEnter={() => { setHover(true); playHover() }}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 12px",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 13,
        color: textColor,
        border: `1px solid ${borderColor}`,
        background: bgColor,
        fontWeight: selected ? 500 : 400,
        transition: "color 0.15s, background 0.15s, border-color 0.15s, transform 0.15s",
        transform: hover && !selected ? "translateX(2px)" : "translateX(0)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {selected && <span style={{ width: 5, height: 5, borderRadius: "50%", background: ACCENT }} />}
        {label}
      </span>
      <Chevron color={chevColor} />
    </div>
  )
}

const TOTAL_STEPS = 8   // 7 questions + 1 result

function QuizUI({ onAdvance, onGenerate, loading = false }) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState({
    liveProduct: "",   // Q1: Yes / No
    industry: "",   // Q2
    url: "",   // Q3 (input)
    businessAge: "",   // Q4
    hurt: "",   // Q5
    need: "",   // Q6
    recentChange: "",   // Q7 (input)
  })

  const next = () => {
    setStep((s) => {
      // 🔄 Spin only after Q1 answer (1→2) and Q4 answer (4→5)
      if (s === 1 || s === 4) onAdvance?.()
      return Math.min(s + 1, TOTAL_STEPS)
    })
  }
  const back = () => {
    setStep((s) => Math.max(s - 1, 1))
  }
  const handleSelect = (key, value) => {
    setData((d) => ({ ...d, [key]: value }))
    next()
  }

  // Trigger AI generation in the parent (Scene), then advance to "transmitted" screen
  const submitAndAdvance = () => {
    onGenerate?.(data)
    setStep(8)
  }

  const meta = STEPS_META[step - 1]

  // Reusable styles for input + Continue button (Q3 and Q7)
  const inputStyle = {
    width: "100%",
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    padding: "11px 14px",
    color: TEXT_PRIMARY,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    cursor: "text",            // text cursor inside input only
    userSelect: "auto",        // allow typing/selecting input text
    WebkitUserSelect: "auto",
  }
  const continueBtnStyle = {
    marginTop: 10, background: ACCENT, border: "none", color: BG,
    padding: "11px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
  }

  return (
    <div style={{
      width: 364,
      height: 400,
      background: BG,
      color: TEXT_PRIMARY,
      padding: "18px 20px",
      borderRadius: 20,
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: 13,
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      cursor: "default",
      userSelect: "none",
      WebkitUserSelect: "none",
      boxShadow: `0 0 ${SCREEN_GLOW.haloBlur}px rgba(180, 108, 255, ${SCREEN_GLOW.haloAlpha}), 0 0 8px rgba(180, 108, 255, 0.3) inset`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, letterSpacing: "0.04em" }}>
          <span style={{ color: ACCENT, fontWeight: 600 }}>{meta.num}</span>
          <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>{meta.title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#cccccc" }}>
          <BatteryIcon />
          <span>100%</span>
        </div>
      </div>

      {/* Question */}
      <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25, marginBottom: 14, color: TEXT_PRIMARY }}>
        {meta.question}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
        {/* Q1 — Live product (spin trigger after select) */}
        {step === 1 && LIVE_PRODUCT_OPTS.map((o) => (
          <OptionRow key={o} label={o} selected={data.liveProduct === o} onClick={() => handleSelect("liveProduct", o)} />
        ))}

        {/* Q2 — Industry */}
        {step === 2 && INDUSTRY_OPTS.map((o) => (
          <OptionRow key={o} label={o} selected={data.industry === o} onClick={() => handleSelect("industry", o)} />
        ))}

        {/* Q3 — URL input */}
        {step === 3 && (
          <>
            <input
              placeholder="https://yoursite.com"
              value={data.url}
              onChange={(e) => setData((d) => ({ ...d, url: e.target.value }))}
              style={inputStyle}
            />
            <button onClick={() => { playSelect(); next() }} style={continueBtnStyle}>Continue</button>
          </>
        )}

        {/* Q4 — Business age (spin trigger after select) */}
        {step === 4 && BUSINESS_AGE_OPTS.map((o) => (
          <OptionRow key={o} label={o} selected={data.businessAge === o} onClick={() => handleSelect("businessAge", o)} />
        ))}

        {/* Q5 — Pain point */}
        {step === 5 && HURT_OPTS.map((o) => (
          <OptionRow key={o} label={o} selected={data.hurt === o} onClick={() => handleSelect("hurt", o)} />
        ))}

        {/* Q6 — What do you need */}
        {step === 6 && NEED_OPTS.map((o) => (
          <OptionRow key={o} label={o} selected={data.need === o} onClick={() => handleSelect("need", o)} />
        ))}

        {/* Q7 — Recent change input */}
        {step === 7 && (
          <>
            <input
              placeholder="e.g. launched a new feature, lost a key client…"
              value={data.recentChange}
              onChange={(e) => setData((d) => ({ ...d, recentChange: e.target.value }))}
              style={inputStyle}
            />
            <button
              onClick={() => { playSelect(); submitAndAdvance() }}
              style={continueBtnStyle}
              disabled={loading}
            >
              {loading ? "Generating…" : "Generate Report"}
            </button>
          </>
        )}

        {/* Step 8 — Quiz complete, result is now on the SECOND device */}
        {step === 8 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 50, height: 50, borderRadius: "50%",
              border: `2px solid ${ACCENT}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, color: ACCENT,
            }}>
              ✓
            </div>
            <div style={{ fontSize: 11, color: ACCENT, letterSpacing: "0.08em", fontWeight: 600 }}>
              REPORT TRANSMITTED
            </div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.04em", textAlign: "center", lineHeight: 1.5 }}>
              View your personalized strategy<br />on the next device →
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        paddingTop: 12,
      }}>
        <div>
          {step > 1 && (
            <button
              onClick={() => { playBack(); back() }}
              style={{
                background: "transparent",
                border: "none",
                color: TEXT_MUTED,
                cursor: "pointer",
                padding: 0,
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                letterSpacing: "0.04em",
              }}
            >
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
                <Chevron color={TEXT_MUTED} />
              </span>
              BACK
            </button>
          )}
        </div>

        {/* Page dots — 8 dots total */}
        <div style={{ display: "flex", gap: 5 }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              style={{
                width: step === n ? 12 : 4,
                height: 4,
                borderRadius: 3,
                background: step === n ? ACCENT : "#333",
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>

        <div />
      </div>
    </div>
  )
}

/* ---------------- MODEL ---------------- */
const QUIZ_UI_W = 340
const QUIZ_UI_H = 420
const SCREEN_FILL = 50   // 👈 isko badhao: 1 = exact fit, 2 = 2x bada, 5 = 5x, etc.

/* 👇 MODEL APPEARANCE — Titanium Gray (iPhone Pro vibes) */
const MODEL_LOOK = {
  color: "#2a2c30",   // cool dark gray with slight blue undertone
  metalness: 0.85,        // strong metallic sheen — real titanium feel
  roughness: 0.32,        // satin-shiny (not full mirror, premium feel)
  envIntensity: 1.5,         // visible reflections that shimmer on rotate
  envPreset: "studio",    // clean white-light softbox reflections
}

/* 👇 SCREEN GLOW — makes the display feel lit/active */
const SCREEN_GLOW = {
  color: "#b46cff",   // glow tint (matches UI accent purple)
  intensity: 1.2,         // point-light strength near the screen
  emissive: 0.6,         // 0–1, how strongly the screen mesh self-glows
  haloBlur: 60,          // CSS halo blur radius (px)
  haloAlpha: 0.55,        // CSS halo strength 0–1
}

/* ---------------- RESULT UI (rendered on the SECOND device) ---------------- */
// Landscape dimensions of the OUTPUT device's screen — must match TabletDevice's screen geometry
const RESULT_UI_W = 600
const RESULT_UI_H = 366

// 👇 Controls how big the Html overlay appears INSIDE the TabletDevice's screen.
// Increase if Html is too small; decrease if it overflows the screen.
// Sweet spot for SCREEN_W=3.2 / SCREEN_H=1.95: around 18–25
const TABLET_SCREEN_FILL = 40

// Priority row in primary (purple) theme — used inside ResultUI
function PriorityRow({ num, title, description, severity }) {
  const fill = Math.min(Math.max(severity * 10, 10), 100)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          background: ACCENT, color: BG, fontWeight: 700,
          fontSize: 9, padding: "2px 5px", borderRadius: 3, letterSpacing: "0.04em",
          minWidth: 20, textAlign: "center", flexShrink: 0,
        }}>
          {String(num).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 10, color: TEXT_PRIMARY, fontWeight: 600, flex: 1 }}>{title}</span>
        <span style={{ fontSize: 9, color: TEXT_DIM, flexShrink: 0 }}>{severity}/10</span>
      </div>
      <div style={{ height: 3, background: "rgba(180, 108, 255, 0.15)", borderRadius: 2, overflow: "hidden", marginLeft: 28 }}>
        <div style={{ height: "100%", width: `${fill}%`, background: ACCENT, transition: "width 0.4s ease-out" }} />
      </div>
      {description && (
        <div style={{ fontSize: 9, color: TEXT_MUTED, lineHeight: 1.4, marginLeft: 28 }}>
          {description}
        </div>
      )}
    </div>
  )
}

function ResultUI({ report, loading, error, onRetry, contact, setContact, sent, sending, sendError, onSendEmail }) {
  const isStandby = !report && !loading && !error
  // Truncate long text to keep layout clean
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trim() + "…" : s)

  return (
    <div style={{
      width: RESULT_UI_W,
      height: RESULT_UI_H,
      background: BG,
      color: TEXT_PRIMARY,
      padding: "14px 18px",
      borderRadius: 12,
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: 12,
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      cursor: "default",
      userSelect: "none",
      WebkitUserSelect: "none",
      overflow: "hidden",
      boxShadow: `0 0 ${SCREEN_GLOW.haloBlur}px rgba(180, 108, 255, ${SCREEN_GLOW.haloAlpha}), 0 0 8px rgba(180, 108, 255, 0.3) inset`,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes shimmer { 0%,100% { opacity: 0.3 } 50% { opacity: 0.6 } }
        .result-input { transition: border-color 0.15s; }
        .result-input::placeholder { color: ${TEXT_DIM}; }
        .result-input:focus { border-color: ${ACCENT}; }
        /* Custom scrollbar — subtle, premium */
        .result-scroll::-webkit-scrollbar { width: 4px; }
        .result-scroll::-webkit-scrollbar-track { background: transparent; }
        .result-scroll::-webkit-scrollbar-thumb { background: rgba(180, 108, 255, 0.3); border-radius: 2px; }
        .result-scroll::-webkit-scrollbar-thumb:hover { background: rgba(180, 108, 255, 0.5); }
        .result-scroll { scrollbar-width: thin; scrollbar-color: rgba(180, 108, 255, 0.3) transparent; }
      `}</style>

      {/* Header — same style as QuizUI */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, letterSpacing: "0.04em" }}>
          <span style={{ color: ACCENT, fontWeight: 600 }}>OUT</span>
          <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>
            {isStandby && "STANDBY"}
            {loading && "ANALYZING"}
            {error && "ERROR"}
            {report && "REPORT READY"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#cccccc" }}>
          <BatteryIcon />
          <span>100%</span>
        </div>
      </div>

      {/* STANDBY */}
      {isStandby && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: TEXT_DIM, animation: "pulse 2s ease-in-out infinite" }} />
          <div style={{ fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.04em" }}>Awaiting input</div>
          <div style={{ fontSize: 10, color: TEXT_DIM, textAlign: "center", lineHeight: 1.4 }}>
            Complete the questionnaire above
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${TEXT_DIM}`, borderTopColor: ACCENT, animation: "spin 0.9s linear infinite" }} />
          <div style={{ fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.04em", animation: "pulse 1.2s ease-in-out infinite" }}>
            Analyzing your answers
          </div>
        </div>
      )}

      {/* ERROR */}
      {error && !loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#ff6b6b", letterSpacing: "0.04em" }}>Something went wrong</div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.4, textAlign: "center", maxWidth: "85%" }}>
            {truncate(error, 90)}
          </div>
          <button
            onClick={onRetry}
            style={{ background: ACCENT, border: "none", color: BG, padding: "7px 16px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      )}

      {/* REPORT — full layout in primary theme */}
      {report && !loading && !error && (
        <div className="result-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, overflow: "auto", paddingRight: 4 }}>
          {/* Diagnosis */}
          <div>
            <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: "0.08em", marginBottom: 3, textTransform: "uppercase", fontWeight: 600 }}>
              Diagnosis
            </div>
            <div style={{ fontSize: 11, color: TEXT_PRIMARY, lineHeight: 1.45 }}>
              {report.diagnosis}
            </div>
          </div>

          {/* Top priorities — compact list with severity dots */}
          {report.topPriorities && report.topPriorities.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>
                Top priorities
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {report.topPriorities.map((p, i) => (
                  <PriorityRow key={i} num={i + 1} title={p.title} description={p.description} severity={p.severity || 5} />
                ))}
              </div>
            </div>
          )}

          {/* Hero — recommendation card with rationale */}
          <div style={{
            border: `1px solid rgba(180, 108, 255, 0.5)`,
            background: "rgba(180, 108, 255, 0.07)",
            borderRadius: 8,
            padding: "10px 12px",
          }}>
            <div style={{ fontSize: 9, color: ACCENT, letterSpacing: "0.08em", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>
              Recommended for you
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.2, marginBottom: report.serviceRationale ? 5 : 0 }}>
              {report.recommendedService}
            </div>
            {report.serviceRationale && (
              <div style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.4 }}>
                {report.serviceRationale}
              </div>
            )}
          </div>

          {/* Next 30 days — numbered list */}
          {report.next30Days && report.next30Days.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>
                Next 30 days
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {report.next30Days.map((step, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, fontSize: 10, color: TEXT_PRIMARY, lineHeight: 1.4 }}>
                    <span style={{ color: ACCENT, fontWeight: 700, flexShrink: 0, minWidth: 14 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Inline email form */}
          {!sent ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <form onSubmit={onSendEmail} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                <input
                  className="result-input"
                  type="email"
                  placeholder="you@example.com"
                  value={contact.email}
                  onChange={(e) => setContact((c) => ({ ...c, email: e.target.value, name: c.name || "User" }))}
                  required
                  disabled={sending}
                  style={{
                    flex: 1,
                    background: "#1a1a1a",
                    border: `1px solid #2a2a2a`,
                    borderRadius: 6,
                    padding: "8px 11px",
                    color: TEXT_PRIMARY,
                    fontSize: 11,
                    outline: "none",
                    boxSizing: "border-box",
                    cursor: "text",
                    userSelect: "auto",
                    WebkitUserSelect: "auto",
                    fontFamily: "inherit",
                    opacity: sending ? 0.6 : 1,
                  }}
                />
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    background: ACCENT,
                    border: "none",
                    color: BG,
                    padding: "0 16px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: sending ? "wait" : "pointer",
                    whiteSpace: "nowrap",
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  {sending ? "Sending…" : "Send report →"}
                </button>
              </form>
              {sendError && (
                <div style={{ fontSize: 10, color: "#ff6b6b", lineHeight: 1.3 }}>
                  {sendError}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "8px 0", border: `1px dashed ${ACCENT}`, borderRadius: 6, fontSize: 10, color: ACCENT, letterSpacing: "0.04em" }}>
              ✓ Sent — check your inbox
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------- TABLET DEVICE (landscape, built with Three.js primitives) ---------------- */
// A different shape from the imported GLB — wider tablet for the diagnostic readout.
function TabletDevice({
  position = [0, 0, 0],
  children,
  glowColor = "#b46cff",
  glowIntensity = 1.4,
}) {
  // Gentle floating + tilt animation, plus entrance scale-up
  const groupRef = useRef()
  const mountTimeRef = useRef(null)
  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime

    // Capture mount time on first frame
    if (mountTimeRef.current === null) mountTimeRef.current = t

    // Entrance: 1.4s elastic-ease scale-up from 0.6 → 1
    const elapsed = t - mountTimeRef.current
    const ENTRANCE_DUR = 1.4
    const p = Math.min(elapsed / ENTRANCE_DUR, 1)
    // easeOutBack — overshoot slightly then settle (cinematic feel)
    const overshoot = 1.4
    const eased = 1 + overshoot * Math.pow(p - 1, 3) + overshoot * Math.pow(p - 1, 2)
    const entranceScale = 0.6 + (1 - 0.6) * eased
    groupRef.current.scale.setScalar(entranceScale)

    // Floating + tilt (kicks in after entrance completes)
    if (p >= 1) {
      groupRef.current.position.y = position[1] + Math.sin(t * 0.6) * 0.025
      groupRef.current.rotation.x = Math.sin(t * 0.4) * 0.015
      groupRef.current.rotation.y = Math.sin(t * 0.3) * 0.02
    }
  })
  // 📐 Body dimensions (world units) — physical tablet shape
  const BODY_W = 3.6      // 👈 tablet body WIDTH
  const BODY_H = 2.3      // 👈 tablet body HEIGHT
  const BODY_D = 0.18     // 👈 tablet body DEPTH (thickness)

  // 📐 Screen plane (the lime/glow rectangle) — should be smaller than body to show bezel
  const SCREEN_W = 3.2    // 👈 screen WIDTH
  const SCREEN_H = 1.95   // 👈 screen HEIGHT

  // 📐 Z offsets — how far in front of the body face elements sit
  const SCREEN_Z = BODY_D / 12 + 0.001   // 👈 screen mesh Z (positive = forward / sticks out, negative = recessed into body)
  const HTML_Z = BODY_D / 2 + 0.012     // 👈 Html overlay Z (must be > SCREEN_Z so it's in front of screen mesh)

  // 📐 Screen border (rounded corners on the lime/glow plane)
  const SCREEN_RADIUS = 0.02         // 👈 corner radius (0 = sharp corners, 0.1 = very rounded)
  const SCREEN_THICKNESS = 0.006        // 👈 screen plane thickness (kept tiny so it looks flat)

  return (
    <group ref={groupRef} position={position}>
      {/* Body — rounded box, premium dark titanium */}
      <RoundedBox args={[BODY_W, BODY_H, BODY_D]} radius={0.06} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#1a1c20" metalness={0.9} roughness={0.32} envMapIntensity={1.6} />
      </RoundedBox>

      {/* Inner bezel frame — thin lighter ring around the screen for premium definition */}
      <RoundedBox
        args={[SCREEN_W + 0.06, SCREEN_H + 0.06, 0.005]}
        radius={SCREEN_RADIUS + 0.01}
        smoothness={3}
        position={[0, 0, SCREEN_Z - 0.001]}
      >
        <meshStandardMaterial color="#2a2c32" metalness={0.7} roughness={0.4} envMapIntensity={1.2} />
      </RoundedBox>

      {/* Screen — rounded thin slab */}
      <RoundedBox
        args={[SCREEN_W, SCREEN_H, SCREEN_THICKNESS]}
        radius={SCREEN_RADIUS}
        smoothness={3}
        position={[0, 0, SCREEN_Z]}
      >
        <meshStandardMaterial
          color="#050505"
          metalness={0}
          roughness={0.05}
          emissive={glowColor}
          emissiveIntensity={0.5}
          envMapIntensity={1}
        />
      </RoundedBox>

      {/* Glass reflection layer — very thin, slightly transparent (suggests glass screen) */}
      <RoundedBox
        args={[SCREEN_W, SCREEN_H, 0.002]}
        radius={SCREEN_RADIUS}
        smoothness={3}
        position={[0, 0, SCREEN_Z + SCREEN_THICKNESS / 2 + 0.0005]}
      >
        <meshPhysicalMaterial
          color="#000000"
          metalness={0}
          roughness={0.02}
          transmission={0.9}
          thickness={0.05}
          opacity={0.15}
          transparent
          clearcoat={1}
          clearcoatRoughness={0.05}
        />
      </RoundedBox>

      {/* Side buttons — volume rocker (top + bottom) on right edge */}
      <RoundedBox args={[0.04, 0.22, 0.11]} radius={0.015} position={[BODY_W / 2 + 0.015, 0.42, 0]}>
        <meshStandardMaterial color="#0a0b0e" metalness={0.7} roughness={0.45} />
      </RoundedBox>
      <RoundedBox args={[0.04, 0.22, 0.11]} radius={0.015} position={[BODY_W / 2 + 0.015, 0.12, 0]}>
        <meshStandardMaterial color="#0a0b0e" metalness={0.7} roughness={0.45} />
      </RoundedBox>

      {/* Power/X button — small square on right edge below volume */}
      <RoundedBox args={[0.06, 0.06, 0.13]} radius={0.012} position={[BODY_W / 2 + 0.02, -0.4, 0]}>
        <meshStandardMaterial color="#0a0b0e" metalness={0.65} roughness={0.5} />
      </RoundedBox>

      {/* Bottom mic/RESET-style detail — small pill */}
      <RoundedBox args={[0.4, 0.14, 0.12]} radius={0.035} position={[0, -BODY_H / 2 - 0.04, 0]}>
        <meshStandardMaterial color="#0a0b0e" metalness={0.55} roughness={0.55} />
      </RoundedBox>

      {/* Speaker grille — 6 small holes on bottom-right */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={`grille-${i}`} position={[BODY_W / 2 - 0.32 + i * 0.045, -BODY_H / 2 + 0.12, BODY_D / 2 + 0.002]}>
          <circleGeometry args={[0.012, 12]} />
          <meshStandardMaterial color="#000000" metalness={0.4} roughness={0.7} />
        </mesh>
      ))}

      {/* Camera/sensor lens — top-center small dot */}
      <mesh position={[0, BODY_H / 2 - 0.08, BODY_D / 2 + 0.003]}>
        <circleGeometry args={[0.022, 24]} />
        <meshStandardMaterial color="#000000" metalness={0.95} roughness={0.05} envMapIntensity={2} />
      </mesh>
      {/* Tiny status LED next to camera */}
      <mesh position={[0.07, BODY_H / 2 - 0.08, BODY_D / 2 + 0.003]}>
        <circleGeometry args={[0.005, 8]} />
        <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={2} />
      </mesh>

      {/* Subtle decorative screws at corners — smaller, refined */}
      {[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sy], i) => (
        <mesh key={`screw-${i}`} position={[sx * (BODY_W / 2 - 0.1), sy * (BODY_H / 2 - 0.1), BODY_D / 2 + 0.002]}>
          <circleGeometry args={[0.018, 16]} />
          <meshStandardMaterial color="#4a4c52" metalness={0.95} roughness={0.35} />
        </mesh>
      ))}

      {/* Brand wordmark — etched-look text on bottom-left of body */}
      <Text
        position={[-BODY_W / 2 + 0.2, -BODY_H / 2 + 0.12, BODY_D / 2 + 0.001]}
        fontSize={0.07}
        color="#3a3c42"
        anchorX="left"
        anchorY="middle"
        letterSpacing={0.15}
        fontWeight={600}
      >
        PIXEL-01
      </Text>

      {/* Screen glow light — main */}
      <pointLight
        position={[0, 0, BODY_D / 2 + 0.6]}
        color={glowColor}
        intensity={glowIntensity}
        distance={4}
        decay={2}
      />
      {/* Subtle accent fill light from below */}
      <pointLight
        position={[0, -BODY_H, BODY_D / 2 + 0.4]}
        color={glowColor}
        intensity={glowIntensity * 0.4}
        distance={3}
        decay={2.5}
      />

      {/* Html overlay — sits in front of glass layer */}
      <Html
        transform
        occlude
        position={[0, 0, HTML_Z]}
        scale={Math.min(SCREEN_W / RESULT_UI_W, SCREEN_H / RESULT_UI_H) * TABLET_SCREEN_FILL}
      >
        {children}
      </Html>
    </group>
  )
}

/* 👇 SPIN ANIMATION — controls 360° rotation on selection */
const SPIN_DURATION = 1.6   // seconds for full 360° (badhao = slower spin)

/* Reusable Device — renders the GLB at a position with arbitrary HTML overlay on its screen.
 * Each instance gets its OWN cloned scene + materials so they don't share state. */
function Device({
  position = [0, 0, 0],
  children,
  glowColor = SCREEN_GLOW.color,
  glowIntensity = SCREEN_GLOW.intensity,
  glowEmissive = SCREEN_GLOW.emissive,
  spinRef,
}) {
  const { scene } = useGLTF("/models/model.glb")

  // Each Device gets a deep clone of the GLB scene + cloned materials
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material = obj.material.clone()
      }
    })
    return c
  }, [scene])

  const [info, setInfo] = useState(null)
  const groupRef = useRef()
  const animRef = useRef({ active: false, startY: 0, targetY: 0, startTime: 0, pendingDir: 0 })

  // Expose spin trigger to parent via ref
  useEffect(() => {
    if (spinRef) spinRef.current = (direction) => { animRef.current.pendingDir = direction }
  }, [spinRef])

  useFrame((state) => {
    if (!groupRef.current) return
    const a = animRef.current
    if (a.pendingDir !== 0) {
      a.startY = groupRef.current.rotation.y
      a.targetY = a.startY + Math.PI * 2 * a.pendingDir
      a.startTime = state.clock.elapsedTime
      a.active = true
      a.pendingDir = 0
    }
    if (!a.active) return
    const t = state.clock.elapsedTime - a.startTime
    const p = Math.min(t / SPIN_DURATION, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    groupRef.current.rotation.y = a.startY + (a.targetY - a.startY) * eased
    if (p >= 1) {
      a.active = false
      groupRef.current.rotation.y = a.targetY % (Math.PI * 2)
    }
  })

  useEffect(() => {
    cloned.updateMatrixWorld(true)
    const modelBox = new THREE.Box3().setFromObject(cloned)
    const modelCenter = new THREE.Vector3()
    modelBox.getCenter(modelCenter)

    let screenMesh = null

    cloned.traverse((obj) => {
      if (obj.isMesh) {
        const name = obj.name.toLowerCase()
        const isScreen = !screenMesh && (
          name.includes("screen") || name.includes("display") ||
          name.includes("glass") || name.includes("panel")
        )
        if (isScreen) screenMesh = obj

        if (obj.material) {
          const m = obj.material
          if (isScreen) {
            m.color?.set("#050505")
            if ("metalness" in m) m.metalness = 0
            if ("roughness" in m) m.roughness = 0.05
            if (m.emissive) m.emissive.set(glowColor)
            if ("emissiveIntensity" in m) m.emissiveIntensity = glowEmissive
            if ("envMapIntensity" in m) m.envMapIntensity = 1
          } else {
            if (MODEL_LOOK.color !== null && m.color) m.color.set(MODEL_LOOK.color)
            if (MODEL_LOOK.metalness !== null && "metalness" in m) m.metalness = MODEL_LOOK.metalness
            if (MODEL_LOOK.roughness !== null && "roughness" in m) m.roughness = MODEL_LOOK.roughness
            if ("envMapIntensity" in m) m.envMapIntensity = MODEL_LOOK.envIntensity
          }
          m.needsUpdate = true
        }
      }
    })

    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    if (screenMesh) {
      const box = new THREE.Box3().setFromObject(screenMesh)
      box.getSize(size)
      box.getCenter(center)
    } else {
      const fallback = new THREE.Box3().setFromObject(cloned)
      fallback.getSize(size)
      fallback.getCenter(center)
      size.multiplyScalar(0.6)
    }
    const offset = new THREE.Vector3().subVectors(center, modelCenter)
    setInfo({ size, offset })
  }, [cloned, glowColor, glowEmissive])

  return (
    <group ref={groupRef} position={position}>
      <Center>
        <primitive object={cloned} scale={1.8} />
      </Center>

      {info && (
        <>
          <pointLight
            position={[
              info.offset.x,
              info.offset.y + 0.27,
              info.offset.z + info.size.z / 13 + 0.3,
            ]}
            color={glowColor}
            intensity={glowIntensity}
            distance={3}
            decay={2}
          />
          <Html
            transform
            occlude
            position={[
              info.offset.x,
              info.offset.y + 0.27,
              info.offset.z + info.size.z / 13 + 0.1,
            ]}
            scale={Math.min(
              info.size.x / QUIZ_UI_W,
              info.size.y / QUIZ_UI_H
            ) * SCREEN_FILL}
          >
            {children}
          </Html>
        </>
      )}
    </group>
  )
}

/* ---------------- FALLBACK ---------------- */
function FallbackBox() {
  return (
    <mesh>
      <boxGeometry args={[2, 3, 0.5]} />
      <meshStandardMaterial color="red" />
    </mesh>
  )
}

/* ---------------- INPUT SCENE — single GLB device with QuizUI ---------------- */
function InputScene({ onGenerate, loading, spinRef }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 6, 5]} intensity={1.1} castShadow />
      <directionalLight position={[-5, 4, 4]} intensity={0.5} />
      <directionalLight position={[0, 3, -5]} intensity={1.5} color="#a78bff" />

      <Environment preset={MODEL_LOOK.envPreset} />

      <Suspense fallback={<FallbackBox />}>
        <Device
          position={[0, 0, 0]}
          glowColor="#b46cff"
          spinRef={spinRef}
        >
          <QuizUI
            onAdvance={() => spinRef?.current?.(1)}
            onGenerate={onGenerate}
            loading={loading}
          />
        </Device>
      </Suspense>

      <ContactShadows
        position={[0, -1.4, 0]}
        opacity={0.55}
        scale={8}
        blur={2.4}
        far={2}
        resolution={1024}
        color="#000000"
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        minPolarAngle={Math.PI / 3.5}
        maxPolarAngle={Math.PI / 1.8}
      />
    </>
  )
}

/* ---------------- OUTPUT SCENE — TabletDevice with ResultUI ---------------- */
function OutputScene({ report, loading, error, onRetry, contact, setContact, sent, sending, sendError, onSendEmail }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 6, 5]} intensity={1.1} castShadow />
      <directionalLight position={[-5, 4, 4]} intensity={0.5} />
      {/* Rim/back light — purple to match primary theme */}
      <directionalLight position={[0, 3, -5]} intensity={1.5} color="#a78bff" />

      <Environment preset={MODEL_LOOK.envPreset} />

      <TabletDevice position={[0, 0, 0]} glowColor="#b46cff">
        <ResultUI
          report={report}
          loading={loading}
          error={error}
          onRetry={onRetry}
          contact={contact}
          setContact={setContact}
          sent={sent}
          sending={sending}
          sendError={sendError}
          onSendEmail={onSendEmail}
        />
      </TabletDevice>

      <ContactShadows
        position={[0, -1.3, 0]}
        opacity={0.55}
        scale={10}
        blur={2.6}
        far={2}
        resolution={1024}
        color="#000000"
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        minPolarAngle={Math.PI / 3.5}
        maxPolarAngle={Math.PI / 1.8}
      />
    </>
  )
}

/* ---------------- APP — two stacked sections, reveals OUTPUT after submit ---------------- */
export default function App() {
  // Lifted report state
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastAnswers, setLastAnswers] = useState(null)
  const [showResult, setShowResult] = useState(false)

  // Email-form state on output device
  const [contact, setContact] = useState({ name: "", email: "" })
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  // Spin trigger for INPUT device
  const inputSpinRef = useRef(null)
  const outputSectionRef = useRef(null)

  const handleGenerate = useCallback(async (answers) => {
    setLastAnswers(answers)
    setLoading(true)
    setError(null)
    setReport(null)
    setSent(false)
    setContact({ name: "", email: "" })
    setShowResult(true)

    // Cinematic scroll: brief beat (so user sees "REPORT TRANSMITTED ✓") then a slow eased glide.
    // Pass a getter so the ref resolves AFTER React has mounted Section 2.
    smoothScrollToElement(() => outputSectionRef.current, {
      delay: 700,        // wait so the transmission confirmation registers visually
      duration: 2200,    // ~2.2s — slow, deliberate
    })

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setReport(json.report)
    } catch (e) {
      setError(e.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRetry = useCallback(() => {
    if (lastAnswers) handleGenerate(lastAnswers)
  }, [lastAnswers, handleGenerate])

  const handleSendEmail = useCallback(async (e) => {
    e?.preventDefault?.()
    if (!contact.email.trim() || !report) return
    if (sending) return
    playSelect()
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch("/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contact.email.trim(),
          name: (contact.name || "").trim() || "there",
          report,
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      setSent(true)
    } catch (err) {
      setSendError(err.message || "Failed to send")
    } finally {
      setSending(false)
    }
  }, [contact, report, sending])

  const canvasGl = {
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.15,
    antialias: true,
  }

  return (
    <>
      {/* SECTION 1: INPUT device (always visible at top) */}
      <section className="scene-section is-input">
        <Canvas shadows camera={{ position: [0.6, 0.4, 5], fov: 42 }} gl={canvasGl} dpr={[1, 2]}>
          <InputScene
            onGenerate={handleGenerate}
            loading={loading}
            spinRef={inputSpinRef}
          />
        </Canvas>
      </section>

      {/* SECTION 2: OUTPUT device (mounts after first Generate Report click) */}
      {showResult && (
        <section className="scene-section is-output" ref={outputSectionRef}>
          <Canvas shadows camera={{ position: [0, 0.2, 5.2], fov: 50 }} gl={canvasGl} dpr={[1, 2]}>
            <OutputScene
              report={report}
              loading={loading}
              error={error}
              onRetry={handleRetry}
              contact={contact}
              setContact={setContact}
              sent={sent}
              sending={sending}
              sendError={sendError}
              onSendEmail={handleSendEmail}
            />
          </Canvas>
        </section>
      )}
    </>
  )
}

/* ---------------- PRELOAD ---------------- */
useGLTF.preload("/models/model.glb")