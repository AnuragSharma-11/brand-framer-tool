import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Html, useGLTF, Center, Environment, ContactShadows, RoundedBox, Text } from "@react-three/drei"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"

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

/* ---------------- AMBIENT MUSIC (HTML5 audio file) ---------------- */
// Path of the music file inside /public — change to your own track if you like.
const AMBIENT_MUSIC_SRC = "/audio/tunetank-vlog-beat-background-349853.mp3"
const AMBIENT_MUSIC_VOLUME = 0.25

/* ---------------- CINEMATIC SCROLL ---------------- */
// Custom luxury smooth scroll. `target` can be a DOM element OR a function returning one.
function smoothScrollToElement(target, { duration = 3000, delay = 0, offset = 0 } = {}) {
  setTimeout(() => {
    const el = typeof target === "function" ? target() : target
    if (!el) return
    const startY = window.scrollY || document.documentElement.scrollTop
    const targetY = el.getBoundingClientRect().top + startY + offset
    const distance = targetY - startY
    if (Math.abs(distance) < 1) return
    const startTime = performance.now()

    // easeInOutQuint — softer, more luxurious than cubic. Very slow start AND end.
    const ease = (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2)

    function step(now) {
      const elapsed = now - startTime
      const p = Math.min(elapsed / duration, 1)
      window.scrollTo({ top: startY + distance * ease(p), behavior: "auto" })
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, delay)
}

/* ---------------- MUSIC TOGGLE BUTTON (fixed top-right) ---------------- */
function MusicToggle() {
  const audioRef = useRef(null)
  // Default ON. Browser autoplay policy means actual playback waits for first user
  // interaction (handled below), but the toggle reflects the user's preference.
  const [playing, setPlaying] = useState(true)

  // Set initial volume + loop once the element mounts
  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = AMBIENT_MUSIC_VOLUME
    audioRef.current.loop = true
  }, [])

  // Reflect playing state into the audio element
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.play().catch(() => {
        // Autoplay blocked — will retry on first user interaction below
      })
    } else {
      a.pause()
    }
  }, [playing])

  // Bootstrap autoplay: try once on first user click anywhere on the page
  useEffect(() => {
    const tryStart = () => {
      const a = audioRef.current
      if (!a) return
      if (playing && a.paused) a.play().catch(() => {})
    }
    document.addEventListener("click", tryStart, { once: true, capture: true })
    document.addEventListener("touchstart", tryStart, { once: true, capture: true })
    document.addEventListener("keydown", tryStart, { once: true, capture: true })
    return () => {
      document.removeEventListener("click", tryStart, { capture: true })
      document.removeEventListener("touchstart", tryStart, { capture: true })
      document.removeEventListener("keydown", tryStart, { capture: true })
    }
  }, [playing])

  const toggle = useCallback(() => {
    setPlaying((p) => !p)
  }, [])

  return (
    <>
      {/* Hidden audio element — actual sound source */}
      <audio ref={audioRef} src={AMBIENT_MUSIC_SRC} preload="auto" />

      <motion.button
        onClick={toggle}
        aria-label={playing ? "Pause ambient music" : "Play ambient music"}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "fixed",
          top: 18,
          right: 18,
          zIndex: 1000,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: `1px solid ${playing ? "rgba(180, 108, 255, 0.6)" : "rgba(255, 255, 255, 0.15)"}`,
          background: playing
            ? "rgba(180, 108, 255, 0.18)"
            : "rgba(0, 0, 0, 0.35)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: playing
            ? "0 0 18px rgba(180, 108, 255, 0.35)"
            : "0 1px 3px rgba(0, 0, 0, 0.3)",
          color: playing ? "#b46cff" : "rgba(255, 255, 255, 0.55)",
          padding: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)" }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)" }}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        )}
      </motion.button>
    </>
  )
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

// 📞 Call booking link (Calendly / Cal.com / mailto / tel — change to your real link)
const CALL_BOOKING_LINK = "https://cal.com/your-handle/discovery-15min"

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
    hurt: [],   // Q5 — multi-select array
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

  // Toggle a Q5 (hurt) option. Picking "I don't know" selects EVERYTHING (auto-select-all).
  // Picking it again clears all. Picking any other option while all-selected drops "I don't know".
  const toggleHurt = (option) => {
    setData((d) => {
      const cur = Array.isArray(d.hurt) ? d.hurt : []
      if (option === "I don't know") {
        // If already on, deselect all. Otherwise, select every option.
        return { ...d, hurt: cur.includes(option) ? [] : [...HURT_OPTS] }
      }
      // Standard toggle for other options
      let next = cur.includes(option)
        ? cur.filter((x) => x !== option)
        : [...cur, option]
      // If "I don't know" is set but not every option is selected, remove it
      if (next.includes("I don't know") && next.length < HURT_OPTS.length) {
        next = next.filter((x) => x !== "I don't know")
      }
      return { ...d, hurt: next }
    })
  }

  // Trigger AI generation in the parent (Scene), then advance to "transmitted" screen
  const submitAndAdvance = () => {
    const cleaned = {
      ...data,
      // Backend expects a string — join multi-select array
      hurt: Array.isArray(data.hurt) ? data.hurt.join(", ") : data.hurt,
    }
    onGenerate?.(cleaned)
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

      {/* Body — re-keyed on step change so transitions trigger fresh fade-in */}
      <div key={step} className="quiz-step-body" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
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

        {/* Q5 — Pain point (MULTI-SELECT). NEXT button lives in the footer (mirrors BACK). */}
        {step === 5 && (
          <>
            <div style={{
              fontSize: 10,
              color: TEXT_DIM,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 2,
            }}>
              Select all that apply
            </div>
            {HURT_OPTS.map((o) => (
              <OptionRow
                key={o}
                label={o}
                selected={(data.hurt || []).includes(o)}
                onClick={() => toggleHurt(o)}
              />
            ))}
          </>
        )}

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

        {/* Right slot — only used by Q5 multi-select to advance */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {step === 5 && (
            <button
              onClick={() => {
                if (!(data.hurt || []).length) return
                playSelect()
                next()
              }}
              disabled={!(data.hurt || []).length}
              style={{
                background: "transparent",
                border: "none",
                color: (data.hurt || []).length ? ACCENT : TEXT_DIM,
                cursor: (data.hurt || []).length ? "pointer" : "not-allowed",
                padding: 0,
                fontSize: 11,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                letterSpacing: "0.04em",
                opacity: (data.hurt || []).length ? 1 : 0.5,
                transition: "color 0.15s, opacity 0.15s",
              }}
            >
              NEXT
              <Chevron color={(data.hurt || []).length ? ACCENT : TEXT_DIM} />
            </button>
          )}
        </div>
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
  metalness: 0.92,        // bumped — sharper metallic sheen
  roughness: 0.22,        // smoother → cleaner highlights & reflections
  envIntensity: 2.1,         // stronger env reflections that shimmer on rotate
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

// Single-line teaser block (PROBLEM / REASON / SOLUTION) — main on-screen content
function TeaserLine({ label, text, accent = false }) {
  return (
    <div style={{
      borderLeft: `2px solid ${accent ? ACCENT : TEXT_DIM}`,
      paddingLeft: 12,
      paddingTop: 2,
      paddingBottom: 2,
    }}>
      <div style={{
        fontSize: 9,
        color: accent ? ACCENT : TEXT_DIM,
        letterSpacing: "0.12em",
        fontWeight: 700,
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: accent ? 13 : 12,
        color: accent ? TEXT_PRIMARY : "#dadada",
        lineHeight: 1.4,
        fontWeight: accent ? 600 : 400,
      }}>
        {text || "—"}
      </div>
    </div>
  )
}

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

      {/* Header — minimal "Book a call" pill on top-right when report is ready */}
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10 }}>
          {/* Minimal Book a Call pill — only visible when report is ready */}
          {report && (
            <a
              href={CALL_BOOKING_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playSelect()}
              style={{
                fontSize: 9,
                color: ACCENT,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 700,
                textDecoration: "none",
                padding: "3px 8px",
                border: `1px solid rgba(180, 108, 255, 0.4)`,
                borderRadius: 999,
                transition: "all 0.15s",
                background: "rgba(180, 108, 255, 0.06)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(180, 108, 255, 0.18)"
                e.currentTarget.style.borderColor = "rgba(180, 108, 255, 0.7)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(180, 108, 255, 0.06)"
                e.currentTarget.style.borderColor = "rgba(180, 108, 255, 0.4)"
              }}
            >
              Book Call ↗
            </a>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#cccccc" }}>
            <BatteryIcon />
            <span>100%</span>
          </div>
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

      {/* REPORT — clean 3-line teaser (problem / reason / solution) + email CTA pinned to bottom */}
      {report && !loading && !error && (
        <div className="result-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflow: "auto", paddingRight: 4 }}>
          {/* TOP block — teasers + call CTA group together at the top */}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <TeaserLine label="PROBLEM"  text={report.problem || report.diagnosis} />
            <TeaserLine label="REASON"   text={report.reason} />
            <TeaserLine label="SOLUTION" text={report.solution || report.recommendedService} accent />
          </div>

          {/* Flexible spacer — pushes the email CTA card to the BOTTOM no matter how short the top content is */}
          <div style={{ flex: 1, minHeight: 8 }} />

          {/* Subtle divider just above the email card */}
          <div style={{ height: 1, background: "rgba(255, 255, 255, 0.06)" }} />

          {/* BOTTOM CTA card — wraps tagline + form together, pinned to bottom via spacer above */}
          <div style={{
            background: "rgba(180, 108, 255, 0.05)",
            border: "1px solid rgba(180, 108, 255, 0.18)",
            borderRadius: 10,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 9,
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 10, color: ACCENT, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 3, display: "flex", alignItems: "center", gap: 5 }}>
                <span>✦</span> Get full report
              </div>
              <div style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.45 }}>
                Detailed diagnosis, top 3 priorities with severity, recommended service, and a 30-day action plan — delivered to your inbox.
              </div>
            </div>

            {/* Inline email form */}
            {!sent ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                      background: "rgba(0, 0, 0, 0.4)",
                      border: `1px solid rgba(180, 108, 255, 0.25)`,
                      borderRadius: 6,
                      padding: "9px 12px",
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
                      fontWeight: 700,
                      cursor: sending ? "wait" : "pointer",
                      whiteSpace: "nowrap",
                      opacity: sending ? 0.7 : 1,
                      letterSpacing: "0.02em",
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

      {/* Bottom USB-C / charge port — small pill */}
      <RoundedBox args={[0.32, 0.06, 0.12]} radius={0.025} position={[0, -BODY_H / 2 - 0.005, 0]}>
        <meshStandardMaterial color="#000000" metalness={0.4} roughness={0.7} />
      </RoundedBox>

      {/* Bottom mic/RESET-style detail — small dot to the left of port */}
      <mesh position={[-0.32, -BODY_H / 2 - 0.005, BODY_D / 2 + 0.002]}>
        <circleGeometry args={[0.012, 16]} />
        <meshStandardMaterial color="#000000" metalness={0.4} roughness={0.7} />
      </mesh>

      {/* Speaker grille — 8 small holes on bottom-right (denser, more detail) */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <mesh key={`grille-${i}`} position={[BODY_W / 2 - 0.4 + i * 0.04, -BODY_H / 2 + 0.12, BODY_D / 2 + 0.002]}>
          <circleGeometry args={[0.011, 12]} />
          <meshStandardMaterial color="#000000" metalness={0.4} roughness={0.7} />
        </mesh>
      ))}

      {/* Antenna line — thin recessed strip on top edge (premium phone detail) */}
      <mesh position={[0, BODY_H / 2 - 0.025, BODY_D / 2 + 0.0015]}>
        <planeGeometry args={[BODY_W * 0.65, 0.008]} />
        <meshStandardMaterial color="#0a0b0e" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Decorative ventilation slit — left side */}
      <mesh position={[-BODY_W / 2 - 0.005, 0.4, 0]}>
        <planeGeometry args={[0.008, 0.45]} />
        <meshStandardMaterial color="#0a0b0e" metalness={0.5} roughness={0.5} />
      </mesh>

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
        BRANDHERO
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
  const restingYRef = useRef(0)

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
    const tNow = state.clock.elapsedTime
    // Gentle idle float — subtle vertical bob + tiny tilt drift
    groupRef.current.position.y = position[1] + Math.sin(tNow * 0.6) * 0.045
    if (a.active) {
      const t = tNow - a.startTime
      const p = Math.min(t / SPIN_DURATION, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      groupRef.current.rotation.y = a.startY + (a.targetY - a.startY) * eased
      if (p >= 1) {
        a.active = false
        const settled = a.targetY % (Math.PI * 2)
        groupRef.current.rotation.y = settled
        restingYRef.current = settled
      }
      return
    }
    // Subtle mouse tracking when idle — very minimal pointer follow
    const px = state.pointer.x
    const py = state.pointer.y
    const driftY = Math.sin(tNow * 0.3) * 0.012
    const driftX = Math.sin(tNow * 0.45) * 0.008
    const targetY = restingYRef.current + px * 0.06 + driftY
    const targetX = py * 0.04 + driftX
    groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * 0.04
    groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * 0.04
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

/* Orbiting accent light — slow circular motion creates moving highlights on the device */
function OrbitingAccentLight({ radius = 3.2, height = 1.2, speed = 0.25, color = "#b46cff", intensity = 2.4 }) {
  const ref = useRef()
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime * speed
    ref.current.position.x = Math.cos(t) * radius
    ref.current.position.z = Math.sin(t) * radius
    ref.current.position.y = height + Math.sin(t * 0.7) * 0.4
  })
  return <pointLight ref={ref} color={color} intensity={intensity} distance={8} decay={2} />
}

/* ---------------- INPUT SCENE — single GLB device with QuizUI ---------------- */
function InputScene({ onGenerate, loading, spinRef, quizKey = 0 }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 6, 5]} intensity={1.1} castShadow />
      <directionalLight position={[-5, 4, 4]} intensity={0.5} />
      <directionalLight position={[0, 3, -5]} intensity={1.5} color="#a78bff" />

      {/* Slow-moving purple accent — catches the device edges as it orbits */}
      <OrbitingAccentLight />
      {/* Rim light from behind for edge separation */}
      <pointLight position={[0, 0.4, -3]} color="#d9b8ff" intensity={1.6} distance={6} decay={2} />

      <Environment preset={MODEL_LOOK.envPreset} />

      <Suspense fallback={<FallbackBox />}>
        <Device
          position={[0, 0, 0]}
          glowColor="#b46cff"
          spinRef={spinRef}
        >
          <QuizUI
            key={quizKey}
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
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        minPolarAngle={Math.PI / 3.5}
        maxPolarAngle={Math.PI / 1.8}
      />
    </>
  )
}

/* Camera dolly-in on mount — cinematic intro for the output scene */
function CameraIntro({ from = [0, 0.4, 7.5], to = [0, 0.1, 4.0], duration = 1.8 }) {
  const startTimeRef = useRef(null)
  useFrame((state) => {
    const cam = state.camera
    if (startTimeRef.current === null) {
      startTimeRef.current = state.clock.elapsedTime
      cam.position.set(...from)
    }
    const elapsed = state.clock.elapsedTime - startTimeRef.current
    const p = Math.min(elapsed / duration, 1)
    // easeOutQuint — fast start, very gentle settle
    const eased = 1 - Math.pow(1 - p, 5)
    cam.position.x = from[0] + (to[0] - from[0]) * eased
    cam.position.y = from[1] + (to[1] - from[1]) * eased
    cam.position.z = from[2] + (to[2] - from[2]) * eased
    cam.lookAt(0, 0, 0)
  })
  return null
}

/* ---------------- OUTPUT SCENE — TabletDevice with ResultUI ---------------- */
function OutputScene({ report, loading, error, onRetry, contact, setContact, sent, sending, sendError, onSendEmail }) {
  return (
    <>
      {/* Camera intro — dollies from far → close on mount for cinematic reveal */}
      <CameraIntro from={[0, 0.6, 7.5]} to={[0, 0.1, 4.0]} duration={1.8} />

      {/* Layered atmospheric lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 6, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-5, 4, 4]} intensity={0.55} />
      {/* Top fill — soft purple wash */}
      <directionalLight position={[0, 8, 2]} intensity={0.4} color="#c89cff" />
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

      {/* Output scene is non-interactive — locked camera, no zoom / drag / pan */}
    </>
  )
}

/* ---------------- PROJECTS DATA ---------------- */
// Edit / add projects here. Image is optional — falls back to gradient initial.
const PROJECTS = [
  {
    title: "Lumen Health",
    category: "Brand Positioning",
    description: "Repositioned a 4-yr healthcare SaaS from 'compliance tool' to 'clinical workflow OS' — won 3 enterprise deals in Q1.",
    tag: "Healthcare",
    color: "#b46cff",
  },
  {
    title: "Cinder & Co.",
    category: "Website + Identity",
    description: "Rebuilt e-commerce home page around the single bestseller — conversion lifted from 1.2% to 3.4% in 6 weeks.",
    tag: "E-commerce",
    color: "#ff7eb3",
  },
  {
    title: "Vault Studios",
    category: "Growth Strategy",
    description: "Designed inbound funnel for B2B agency that reduced sales-call dependency 60% — 14 inbound demos / month.",
    tag: "B2B Agency",
    color: "#7eb3ff",
  },
]

/* ---------------- PROJECTS SECTION (Section 3) ---------------- */
function ProjectsSection() {
  return (
    <div style={{
      width: "100%",
      height: "100%",
      maxWidth: 1100,
      margin: "0 auto",
      padding: "60px 32px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 40,
      position: "relative",
      zIndex: 3,
    }}>
      {/* Hero header */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 11,
          color: "#b46cff",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 12,
        }}>
          ✦ While you read your report
        </div>
        <div style={{
          fontSize: 36,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          marginBottom: 12,
        }}>
          Here's what we've shipped<br />for founders like you.
        </div>
        <div style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.55)",
          lineHeight: 1.55,
          maxWidth: 560,
          margin: "0 auto",
        }}>
          Three recent engagements. Each one started exactly where you are now.
        </div>
      </div>

      {/* Project cards grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 18,
      }}>
        {PROJECTS.map((p, i) => (
          <ProjectCard key={i} project={p} index={i} />
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{ textAlign: "center", color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.6 }}>
        Want to be next?{" "}
        <a
          href={CALL_BOOKING_LINK}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#b46cff", textDecoration: "none", fontWeight: 600, borderBottom: "1px solid rgba(180,108,255,0.4)" }}
        >
          Book a call →
        </a>
      </div>
    </div>
  )
}

function ProjectCard({ project, index }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        background: "linear-gradient(180deg, rgba(180,108,255,0.06) 0%, rgba(0,0,0,0.4) 100%)",
        border: `1px solid ${hover ? "rgba(180,108,255,0.4)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 14,
        padding: "20px 22px",
        cursor: "pointer",
        transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1), border-color 0.3s, box-shadow 0.3s",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hover ? "0 16px 40px rgba(180, 108, 255, 0.15)" : "0 2px 8px rgba(0,0,0,0.3)",
        animation: `result-block-in 0.7s cubic-bezier(0.22,1,0.36,1) ${index * 0.12}s both`,
      }}
    >
      {/* Tag pill */}
      <div style={{
        display: "inline-block",
        padding: "3px 10px",
        background: `${project.color}1a`,
        border: `1px solid ${project.color}55`,
        borderRadius: 999,
        fontSize: 9,
        color: project.color,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontWeight: 700,
        marginBottom: 14,
      }}>
        {project.tag}
      </div>

      {/* Category label */}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
        {project.category}
      </div>

      {/* Title */}
      <div style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 10 }}>
        {project.title}
      </div>

      {/* Description */}
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>
        {project.description}
      </div>

      {/* Subtle "View" hint on hover */}
      <div style={{
        marginTop: 14,
        fontSize: 11,
        color: hover ? project.color : "rgba(255,255,255,0.3)",
        letterSpacing: "0.04em",
        fontWeight: 600,
        transition: "color 0.3s",
      }}>
        View case study →
      </div>
    </div>
  )
}

/* ---------------- SERVICES SECTION — "What We Do" grid (Section 4) ---------------- */
const SERVICES = {
  brand: {
    title: "Brand Intelligence",
    tags: ["POSITIONING", "NARRATIVE", "STRATEGY", "BRAND ARCHITECTURE"],
    description: "We decode your business, audience, and positioning to build a foundation rooted in insight and clarity.",
  },
  experience: {
    title: "Experience Design",
    tags: ["UX STRATEGY", "UI SYSTEMS", "PROTOTYPING", "INTERACTION DESIGN"],
    description: "We design intuitive, conversion-driven experiences that guide users effortlessly and drive action.",
  },
  digital: {
    title: "Digital Product",
    tags: ["WEB DEVELOPMENT", "CMS SYSTEMS", "PERFORMANCE OPTIMIZATION", "INTEGRATIONS"],
    description: "We build fast, scalable, and reliable products engineered for real-world performance.",
  },
  visual: {
    title: "Visual Systems",
    tags: ["LOGO", "TYPOGRAPHY", "COLOUR SYSTEMS", "MOTION & ASSETS"],
    description: "We craft cohesive visual languages that scale across platforms and create lasting recognition.",
  },
}

function ServiceTag({ children, light = false }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "7px 14px",
      borderRadius: 999,
      background: light ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.06)",
      border: `1px solid ${light ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.08)"}`,
      color: light ? "rgba(255, 255, 255, 0.92)" : "rgba(255, 255, 255, 0.78)",
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      backdropFilter: "blur(2px)",
      WebkitBackdropFilter: "blur(2px)",
    }}>
      {children}
    </span>
  )
}

function ServicesSection() {
  // Reusable card visual base
  const cardBaseStyle = {
    position: "relative",
    borderRadius: 22,
    overflow: "hidden",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
  }
  const titleLg = {
    margin: 0,
    fontSize: "clamp(24px, 2.1vw, 32px)",
    fontWeight: 500,
    color: "#ffffff",
    fontFamily: "'Inter Tight', system-ui, sans-serif",
    letterSpacing: "-0.025em",
    lineHeight: 1.05,
  }
  const titleMd = {
    ...titleLg,
    fontSize: "clamp(20px, 1.7vw, 26px)",
  }
  const descStyle = {
    margin: 0,
    color: "rgba(255, 255, 255, 0.82)",
    fontSize: 13,
    lineHeight: 1.55,
    fontFamily: "'Inter Tight', system-ui, sans-serif",
    fontWeight: 400,
  }

  return (
    <div style={{
      width: "100%",
      maxWidth: 1100,
      margin: "0 auto",
      padding: "80px 32px 60px",
      boxSizing: "border-box",
      position: "relative",
      zIndex: 3,
    }}>
      {/* ─── HEADER ─── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{ textAlign: "center", marginBottom: 56 }}
      >
        <div style={{
          color: "#e63d2b",
          fontSize: 11,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 22,
          fontFamily: "'Inter Tight', system-ui, sans-serif",
        }}>
          What We Do
        </div>
        <h2 style={{
          margin: 0,
          fontSize: "clamp(36px, 5vw, 76px)",
          fontWeight: 500,
          color: "#ffffff",
          lineHeight: 1.02,
          letterSpacing: "-0.03em",
          fontFamily: "'Inter Tight', system-ui, sans-serif",
        }}>
          We Engineer{" "}
          <em style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 400,
          }}>
            High-Performance Design
          </em>
        </h2>
      </motion.div>

      {/* ─── TOP ROW: Brand Intelligence (wide) + Experience Design ─── */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8%" }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: "grid",
          gridTemplateColumns: "1.45fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* ━━━ BRAND INTELLIGENCE — large red card with 3D logo ━━━ */}
        <div style={{
          ...cardBaseStyle,
          background: "radial-gradient(ellipse 95% 110% at 80% 20%, #db302a 0%, #b22420 30%, #761816 60%, #480d0d 100%)",
          minHeight: 320,
          padding: "32px 36px",
          justifyContent: "space-between",
        }}>
          {/* Bottom-left dot pattern */}
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.10) 1.2px, transparent 1.4px)",
            backgroundSize: "12px 12px",
            maskImage: "radial-gradient(ellipse 60% 70% at 0% 100%, rgba(0,0,0,0.85) 0%, transparent 60%)",
            WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 0% 100%, rgba(0,0,0,0.85) 0%, transparent 60%)",
            pointerEvents: "none",
            zIndex: 1,
          }} />

          {/* 3D logo — top-right corner, slightly extending past edges */}
          <img
            src="/services/service-brand-logo.png"
            alt=""
            style={{
              position: "absolute",
              right: -10,
              top: -20,
              width: "38%",
              maxWidth: 280,
              height: "auto",
              pointerEvents: "none",
              userSelect: "none",
              zIndex: 2,
              filter: "drop-shadow(-8px 14px 24px rgba(0,0,0,0.45))",
            }}
          />

          <div style={{ position: "relative", zIndex: 3, maxWidth: "72%" }}>
            <h3 style={{ ...titleLg, marginBottom: 18 }}>{SERVICES.brand.title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SERVICES.brand.tags.map((t) => <ServiceTag key={t} light>{t}</ServiceTag>)}
            </div>
          </div>

          <p style={{
            ...descStyle,
            position: "relative",
            zIndex: 3,
            maxWidth: 380,
            color: "rgba(255, 255, 255, 0.94)",
          }}>
            {SERVICES.brand.description}
          </p>
        </div>

        {/* ━━━ EXPERIENCE DESIGN — dark card with phone mockup ━━━ */}
        <div style={{
          ...cardBaseStyle,
          background: "#0c0c0c",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          minHeight: 320,
          padding: "32px 32px",
          justifyContent: "space-between",
        }}>
          {/* Subtle checkered/grid background — visible on left side */}
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
            backgroundPosition: "left center",
            maskImage: "radial-gradient(ellipse 70% 80% at 25% 50%, rgba(0,0,0,1) 0%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 80% at 25% 50%, rgba(0,0,0,1) 0%, transparent 80%)",
            pointerEvents: "none",
            zIndex: 1,
          }} />

          {/* Phone mockup — right side, no rotation, slightly off bottom-right */}
          <img
            src="/services/service-phone-mockup.png"
            alt=""
            style={{
              position: "absolute",
              right: -25,
              bottom: -30,
              width: 200,
              height: "auto",
              pointerEvents: "none",
              userSelect: "none",
              zIndex: 2,
              filter: "drop-shadow(-15px 22px 32px rgba(0,0,0,0.55))",
            }}
          />

          {/* Top: description */}
          <p style={{
            ...descStyle,
            position: "relative",
            zIndex: 3,
            maxWidth: 280,
          }}>
            {SERVICES.experience.description}
          </p>

          {/* Bottom: title + tags */}
          <div style={{ position: "relative", zIndex: 3, maxWidth: 290 }}>
            <h3 style={{ ...titleMd, marginBottom: 16 }}>{SERVICES.experience.title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SERVICES.experience.tags.map((t) => <ServiceTag key={t}>{t}</ServiceTag>)}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── BOTTOM ROW: Digital Product + Visual Systems + All Services ─── */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8%" }}
        transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        {/* ━━━ DIGITAL PRODUCT — orange/yellow glow ━━━ */}
        <div style={{
          ...cardBaseStyle,
          background: "#0a0907",
          minHeight: 280,
          padding: "28px 26px",
          justifyContent: "space-between",
        }}>
          {/* Yellow/orange glow from bottom area */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse 130% 95% at 35% 110%, #f0a81c 0%, #c87014 22%, #4a230a 50%, #100805 78%, transparent 100%)",
            pointerEvents: "none",
            zIndex: 1,
          }} />
          {/* Subtle grain */}
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 0.5px, transparent 0.6px)",
            backgroundSize: "3px 3px",
            opacity: 0.5,
            pointerEvents: "none",
            zIndex: 2,
          }} />

          <div style={{ position: "relative", zIndex: 3 }}>
            <h3 style={{ ...titleMd, marginBottom: 18 }}>{SERVICES.digital.title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SERVICES.digital.tags.map((t) => <ServiceTag key={t} light>{t}</ServiceTag>)}
            </div>
          </div>
          <p style={{ ...descStyle, position: "relative", zIndex: 3, maxWidth: 280 }}>
            {SERVICES.digital.description}
          </p>
        </div>

        {/* ━━━ VISUAL SYSTEMS — dark + topographic pattern ━━━ */}
        <div style={{
          ...cardBaseStyle,
          background: "#0a0a0a",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          minHeight: 280,
          padding: "28px 26px",
          justifyContent: "space-between",
        }}>
          {/* Topo pattern overlay — slightly more subtle */}
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url(/services/service-topo-pattern.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.5,
            pointerEvents: "none",
            zIndex: 1,
          }} />

          <div style={{ position: "relative", zIndex: 3 }}>
            <h3 style={{ ...titleMd, marginBottom: 18 }}>{SERVICES.visual.title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SERVICES.visual.tags.map((t) => <ServiceTag key={t}>{t}</ServiceTag>)}
            </div>
          </div>
          <p style={{ ...descStyle, position: "relative", zIndex: 3, maxWidth: 280 }}>
            {SERVICES.visual.description}
          </p>
        </div>

        {/* ━━━ ALL SERVICES — wave at top + title + CTA ━━━ */}
        <div style={{
          ...cardBaseStyle,
          background: "#0a0a0a",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          minHeight: 280,
          padding: 0,
        }}>
          {/* Wave at top */}
          <div style={{
            width: "100%",
            height: 130,
            backgroundImage: "url(/services/service-wave.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, transparent 55%, #0a0a0a 100%)",
              pointerEvents: "none",
            }} />
          </div>

          {/* Lower content */}
          <div style={{
            flex: 1,
            padding: "0 24px 22px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 20,
          }}>
            <h3 style={{ ...titleMd, marginTop: 8 }}>All Services</h3>
            <a
              href={CALL_BOOKING_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fce5d8"; playHover() }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#f4dbcd" }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: "#f4dbcd",
                color: "#0e0e0e",
                padding: "16px 24px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                textDecoration: "none",
                fontFamily: "'Inter Tight', system-ui, sans-serif",
                transition: "background 0.25s",
              }}
            >
              <span style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#0e0e0e",
                display: "inline-block",
              }} />
              Talk to us
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ---------------- ANIMATED HEADLINE — character-by-character reveal on mount ---------------- */
function AnimatedHeadline() {
  const lines = [
    {
      text: "Creative strategy,",
      color: "#ffffff",
      fontFamily: "'Inter Tight', system-ui, sans-serif",
      fontStyle: "normal",
      fontWeight: 300,
      letterSpacing: "-0.04em",
    },
    {
      text: "decoded.",
      color: "#b46cff",
      fontFamily: "'Fraunces', Georgia, serif",
      fontStyle: "italic",
      fontWeight: 300,
      letterSpacing: "-0.02em",
    },
  ]

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.045, delayChildren: 0.35 } },
  }
  const child = {
    hidden: { opacity: 0, y: 28, filter: "blur(10px)" },
    show:   {
      opacity: 1, y: 0, filter: "blur(0px)",
      transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] },
    },
  }

  return (
    <motion.h1
      variants={container}
      initial="hidden"
      animate="show"
      style={{
        margin: 0,
        fontSize: "clamp(40px, 5.5vw, 72px)",
        lineHeight: 1.05,
      }}
    >
      {lines.map((line, li) => (
        <span
          key={li}
          style={{
            display: "block",
            color: line.color,
            fontFamily: line.fontFamily,
            fontStyle: line.fontStyle,
            fontWeight: line.fontWeight,
            letterSpacing: line.letterSpacing,
          }}
        >
          {line.text.split(" ").map((word, wi) => (
            <span
              key={wi}
              style={{ display: "inline-block", whiteSpace: "nowrap", marginRight: "0.25em" }}
            >
              {Array.from(word).map((ch, ci) => (
                <motion.span
                  key={ci}
                  variants={child}
                  style={{ display: "inline-block" }}
                >
                  {ch}
                </motion.span>
              ))}
            </span>
          ))}
        </span>
      ))}
    </motion.h1>
  )
}

/* ---------------- ANIMATED TAGLINE — word-by-word reveal (longer text, slower stagger) ---------------- */
function AnimatedTagline({ text, delay = 0.5, style = {} }) {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.025, delayChildren: delay } },
  }
  const child = {
    hidden: { opacity: 0, x: 24, filter: "blur(5px)" },
    show:   {
      opacity: 1, x: 0, filter: "blur(0px)",
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
    },
  }

  return (
    <motion.p
      variants={container}
      initial="hidden"
      animate="show"
      style={{ margin: 0, ...style }}
    >
      {text.split(" ").map((word, wi) => (
        <motion.span
          key={wi}
          variants={child}
          style={{ display: "inline-block", whiteSpace: "nowrap", marginRight: "0.28em" }}
        >
          {word}
        </motion.span>
      ))}
    </motion.p>
  )
}

/* ---------------- HERO PARTICLES — ambient drifting dots (Section 1 background) ---------------- */
function HeroParticles({ count = 36 }) {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 1 + Math.random() * 2.2,
      duration: 9 + Math.random() * 11,
      delay: Math.random() * 8,
      opacity: 0.18 + Math.random() * 0.32,
      drift: -8 + Math.random() * 16,
    }))
  }, [count])

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 1,
      overflow: "hidden",
    }}>
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "#b46cff",
            boxShadow: `0 0 ${p.size * 3}px rgba(180, 108, 255, 0.6)`,
            opacity: p.opacity,
            animation: `particle-float ${p.duration}s ease-in-out ${p.delay}s infinite`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
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
  const [showProjects, setShowProjects] = useState(false)

  // Email-form state on output device
  const [contact, setContact] = useState({ name: "", email: "" })
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  // Spin trigger for INPUT device
  const inputSpinRef = useRef(null)
  const outputSectionRef = useRef(null)
  const projectsSectionRef = useRef(null)

  // Increment to force a fresh QuizUI mount (clears internal step state)
  const [quizKey, setQuizKey] = useState(0)

  // 🔒 Lock body scroll at the deepest revealed section. Re-locks on each new section reveal.
  // NOTE: explicit "auto" (not "") is required to override the CSS `body { overflow: hidden }`
  // rule that prevents the scrollbar-flash on initial load.
  useEffect(() => {
    if (showProjects) {
      // Once projects + services reveal, leave scroll permanently unlocked so user
      // can naturally scroll down to the services section.
      document.body.style.overflow = "auto"
      return
    }
    if (showResult) {
      // Unlock so the cinematic scroll can run
      document.body.style.overflow = "auto"
      // Re-lock once scroll animation finishes (900ms delay + 3000ms scroll + buffer)
      const timer = setTimeout(() => {
        document.body.style.overflow = "hidden"
      }, 4100)
      return () => clearTimeout(timer)
    }
    // Hero alone is 100vh — keep body locked so no phantom scrollbar appears on reload
    document.body.style.overflow = "hidden"
  }, [showResult, showProjects])

  const handleGenerate = useCallback(async (answers) => {
    setLastAnswers(answers)
    setLoading(true)
    setError(null)
    setReport(null)
    setSent(false)
    setContact({ name: "", email: "" })
    setShowResult(true)

    // Cinematic scroll: gentle beat (transmission confirmation) → very slow luxurious glide.
    smoothScrollToElement(() => outputSectionRef.current, {
      delay: 900,        // small breath so user reads "REPORT TRANSMITTED ✓"
      duration: 3000,    // 3s with easeInOutQuint — feels like a film cut
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

  const handleReset = useCallback(() => {
    playSelect()
    // Smooth scroll back to the top first
    smoothScrollToElement(() => document.body, { delay: 0, duration: 1800 })
    // Clear all state shortly after the scroll begins so the user sees the hero re-emerge clean
    setTimeout(() => {
      setReport(null)
      setLoading(false)
      setError(null)
      setLastAnswers(null)
      setShowResult(false)
      setShowProjects(false)
      setContact({ name: "", email: "" })
      setSent(false)
      setSending(false)
      setSendError(null)
      setQuizKey((k) => k + 1)   // remount QuizUI → resets to step 1
    }, 1900)
  }, [])

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

      // 🎬 Reveal Section 3 (Projects) and cinematic-scroll to it
      setShowProjects(true)
      smoothScrollToElement(() => projectsSectionRef.current, {
        delay: 900,
        duration: 3000,
      })
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
      {/* Floating music toggle — top-right corner, persists across all sections */}
      <MusicToggle />

      {/* SECTION 1: INPUT device (always visible at top) */}
      <section className="scene-section is-input">
        <HeroParticles />
        <Canvas shadows camera={{ position: [0.7, 0.35, 2.75], fov: 38 }} gl={canvasGl} dpr={[1, 2]}>
          <InputScene
            onGenerate={handleGenerate}
            loading={loading}
            spinRef={inputSpinRef}
            quizKey={quizKey}
          />
        </Canvas>

        {/* ─── HERO OVERLAYS (text + brand pill on top of the 3D canvas) ─── */}

        {/* Top-left brand pill */}
        <motion.div
          initial={{ opacity: 0, y: -12, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
          position: "absolute",
          top: 24,
          left: 32,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px 8px 12px",
          background: "rgba(255, 255, 255, 0.06)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 999,
          pointerEvents: "none",
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "linear-gradient(135deg, #b46cff 0%, #6e3fcc 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff",
            boxShadow: "0 0 12px rgba(180, 108, 255, 0.4)",
          }}>✦</div>
          <span style={{ fontSize: 13, color: "#ffffff", fontWeight: 500, letterSpacing: "0.01em" }}>
            BrandHero
          </span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>
            Strategy Diagnostic
          </span>
        </motion.div>

        {/* Bottom-left big headline + scroll hint */}
        <div style={{
          position: "absolute",
          bottom: 56,
          left: 32,
          zIndex: 10,
          maxWidth: "55%",
          pointerEvents: "none",
        }}>
          <AnimatedHeadline />

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
            style={{
              marginTop: 22,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.5)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#b46cff",
              boxShadow: "0 0 10px #b46cff",
              animation: "pulse 2s ease-in-out infinite",
            }} />
            Answer to discover
          </motion.div>
        </div>

        {/* Bottom-right tagline */}
        <div style={{
          position: "absolute",
          bottom: 56,
          right: 32,
          zIndex: 10,
          maxWidth: 480,
          pointerEvents: "none",
          textAlign: "right",
        }}>
          <AnimatedTagline
            text="Take the guesswork out of growing your brand. Identify what's blocking you, get a custom strategy, and move faster than ever."
            delay={0.5}
            style={{
              fontSize: 14,
              color: "rgba(255, 255, 255, 0.6)",
              lineHeight: 1.55,
              fontWeight: 400,
            }}
          />
        </div>
      </section>

      {/* SECTION 2: OUTPUT device (mounts after first Generate Report click) */}
      {showResult && (
        <section className="scene-section is-output" ref={outputSectionRef}>
          <Canvas shadows camera={{ position: [0, 0.1, 4.0], fov: 46 }} gl={canvasGl} dpr={[1, 2]}>
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

          {/* Reset button — DOM overlay (model untouched). Sends user back to step 1. */}
          <motion.button
            onClick={handleReset}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(180, 108, 255, 0.18)"; e.currentTarget.style.borderColor = "rgba(180, 108, 255, 0.5)"; e.currentTarget.style.color = "#ffffff"; playHover() }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"; e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)"; e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)" }}
            style={{
              position: "absolute",
              top: 24,
              left: 32,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderRadius: 999,
              fontSize: 12,
              fontFamily: "'Inter Tight', system-ui, sans-serif",
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "rgba(255, 255, 255, 0.7)",
              cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Start Over
          </motion.button>
        </section>
      )}

      {/* SECTION 3: PROJECTS showcase (mounts after email sent) */}
      {showProjects && (
        <section className="scene-section is-projects" ref={projectsSectionRef}>
          <ProjectsSection />
        </section>
      )}

      {/* SECTION 4: SERVICES (What We Do) — mounts together with projects */}
      {showProjects && (
        <section className="services-wrap is-services">
          <ServicesSection />
        </section>
      )}
    </>
  )
}

/* ---------------- PRELOAD ---------------- */
useGLTF.preload("/models/model.glb")