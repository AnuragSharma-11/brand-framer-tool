import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Html, useGLTF, Center, Environment, ContactShadows, RoundedBox, Text } from "@react-three/drei"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

/* ---------------- VIEWPORT — responsive breakpoint hook ---------------- */
// Mobile breakpoint: < 768px (covers all phones)
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [breakpoint])
  return isMobile
}

/* ---------------- AUDIO (Web Audio API — no files needed) ---------------- */
let _audioCtx = null
function getAudioCtx() {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch {
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

// Mute every other audio source — used when the hero bg video starts so its
// own soundtrack plays cleanly. Pauses HTML <audio> elements (ambient music)
// AND suspends the Web Audio context (UI hover/select tones).
function muteOtherAudio() {
  document.querySelectorAll("audio").forEach((a) => { try { a.pause() } catch { /* ignore */ } })
  if (_audioCtx && _audioCtx.state === "running") {
    try { _audioCtx.suspend() } catch { /* ignore */ }
  }
}

// Re-enable the Web Audio context so UI sounds work again after the video ends.
// Ambient music stays paused — user can manually re-toggle via the MusicToggle button.
function resumeOtherAudio() {
  if (_audioCtx && _audioCtx.state === "suspended") {
    try { _audioCtx.resume() } catch { /* ignore */ }
  }
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
// Returns a cancel() function that aborts the scroll mid-flight — prevents competing
// RAF loops when two scrolls trigger back-to-back.
function smoothScrollToElement(target, { duration = 3000, delay = 0, offset = 0 } = {}) {
  let cancelled = false
  let rafId = 0
  const timeoutId = setTimeout(() => {
    if (cancelled) return
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
      if (cancelled) return
      const elapsed = now - startTime
      const p = Math.min(elapsed / duration, 1)
      window.scrollTo({ top: startY + distance * ease(p), behavior: "auto" })
      if (p < 1) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
  }, delay)

  return () => {
    cancelled = true
    clearTimeout(timeoutId)
    if (rafId) cancelAnimationFrame(rafId)
  }
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
      if (playing && a.paused) a.play().catch(() => { })
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
          bottom: 18,
          right: 18,
          zIndex: 1000,
          width: 44,
          height: 44,
          minWidth: 44,
          aspectRatio: "1 / 1",
          borderRadius: "50%",
          border: `1px solid ${playing ? "rgba(255, 82, 82, 0.6)" : "rgba(255, 255, 255, 0.15)"}`,
          background: playing
            ? "rgba(255, 82, 82, 0.18)"
            : "rgba(0, 0, 0, 0.35)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: playing
            ? "0 0 18px rgba(255, 82, 82, 0.35)"
            : "0 1px 3px rgba(0, 0, 0, 0.3)",
          color: playing ? "#FF5252" : "rgba(255, 255, 255, 0.55)",
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
const ACCENT = "#FF5252"
const BG = "#050810"
const TEXT_PRIMARY = "#ffffff"
const TEXT_MUTED = "#888888"
const TEXT_DIM = "#5a5a5a"

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
const BUSINESS_AGE_OPTS = ["Pre-launch", "Less than 1 year", "1–2 years", "3–5 years", "5+ years"]
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

function OptionRow({ label, selected, onClick, multiSelect = false }) {
  const [hover, setHover] = useState(false)

  // Color resolution priority: selected > hover > default
  const textColor = selected ? ACCENT : hover ? "#cccccc" : TEXT_MUTED
  const bgColor = selected
    ? hover ? "rgba(255, 82, 82, 0.10)" : "rgba(255, 82, 82, 0.05)"
    : hover ? "rgba(255, 255, 255, 0.04)" : "transparent"
  const borderColor = selected
    ? "rgba(255, 82, 82, 0.5)"
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
        fontFamily: "'Inter', system-ui, sans-serif",
        transition: "color 0.15s, background 0.15s, border-color 0.15s, transform 0.15s",
        transform: hover && !selected && !multiSelect ? "translateX(2px)" : "translateX(0)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {multiSelect ? (
          <span style={{
            width: 15,
            height: 15,
            borderRadius: 4,
            border: `1.5px solid ${selected ? ACCENT : "rgba(255, 255, 255, 0.25)"}`,
            background: selected ? ACCENT : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s",
            flexShrink: 0,
          }}>
            {selected && (
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
                <path
                  d="M1 4.6 L3.6 7 L8 1.6"
                  stroke={BG}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        ) : (
          selected && <span style={{ width: 5, height: 5, borderRadius: "50%", background: ACCENT }} />
        )}
        {label}
      </span>
      {!multiSelect && <Chevron color={chevColor} />}
    </div>
  )
}

const TOTAL_STEPS = 8   // 7 questions + 1 result

function QuizUI({ onAdvance, onGenerate, onStart, loading = false }) {
  const [step, setStep] = useState(1)
  const startedRef = useRef(false)

  // Fire onStart exactly once when user moves past Q1 (i.e. they've started answering)
  useEffect(() => {
    if (step > 1 && !startedRef.current) {
      startedRef.current = true
      onStart?.()
    }
  }, [step, onStart])
  const [data, setData] = useState({
    liveProduct: "",   // Q1: Yes / No
    industry: "",   // Q2
    url: "",   // Q3 (input)
    businessAge: "",   // Q4
    hurt: [],   // Q5 — multi-select array
    need: [],   // Q6 — multi-select array
    recentChange: "",   // Q7 (input)
  })

  const next = () => {
    setStep((s) => {
      // 🎯 Device choreography per step — values are FRACTIONS OF A FULL ROTATION (2π).
      // Each value is a RELATIVE delta from the device's current Y rotation.
      //   Q1 → tilt right (image 1 reference)
      //   Q2 → tilt slightly back-left (image 2) — if liveProduct === "No", skips Q3 (URL) entirely
      //   Q3 → more left rotation (image 3)
      //   Q4 → swing right with right-side vent showing (image 4)
      //   Q5 → moderate left tilt (image 5)
      //   Q6 → FULL ROTATION (360°)
      //   Q7 → final right-tilt pose (image 6)
      if (s === 1) onAdvance?.(0.07)        // ~25° right
      else if (s === 2) {
        // Skip Q3 (URL) if user said "No" to live product — no URL to ask for.
        const skipUrl = data.liveProduct === "No"
        onAdvance?.(skipUrl ? 0.01 : -0.04) // combined Q2→Q3 + Q3→Q4 motion if skipping
        return Math.min(s + (skipUrl ? 2 : 1), TOTAL_STEPS)
      }
      else if (s === 3) onAdvance?.(0.05)   // gentle right tilt — matches image 1 (Q4 Business Age view)
      else if (s === 4) onAdvance?.(-0.07)  // back to near-front-facing with very slight tilt — matches new Q5 image
      else if (s === 5) onAdvance?.(0.06)   // subtle right tilt — matches image 1 (Q6 view with right button visible)
      else if (s === 6) onAdvance?.(1.02)   // full 360° rotation + ~7° extra right tilt (matches Q7 image — subtle right pose after spin)
      else if (s === 7) onAdvance?.(0.08)   // ~29° right (settle pose)
      return Math.min(s + 1, TOTAL_STEPS)
    })
  }
  const back = () => {
    setStep((s) => {
      // Mirror the skip in reverse: if user said "No" to live product, Q4 ⇽ Q2 (skip Q3).
      if (s === 4 && data.liveProduct === "No") return 2
      return Math.max(s - 1, 1)
    })
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

  // Toggle a Q6 (need) option. Multi-select with same exclusivity pattern as Q5:
  // "Not sure — tell me" selects all when picked; picking another option clears it.
  const toggleNeed = (option) => {
    setData((d) => {
      const cur = Array.isArray(d.need) ? d.need : []
      if (option === "Not sure — tell me") {
        return { ...d, need: cur.includes(option) ? [] : [...NEED_OPTS] }
      }
      let next = cur.includes(option)
        ? cur.filter((x) => x !== option)
        : [...cur, option]
      if (next.includes("Not sure — tell me") && next.length < NEED_OPTS.length) {
        next = next.filter((x) => x !== "Not sure — tell me")
      }
      return { ...d, need: next }
    })
  }

  // Trigger AI generation in the parent (Scene), then advance to "transmitted" screen
  const submitAndAdvance = () => {
    const cleaned = {
      ...data,
      // Backend expects strings — join multi-select arrays
      hurt: Array.isArray(data.hurt) ? data.hurt.join(", ") : data.hurt,
      need: Array.isArray(data.need) ? data.need.join(", ") : data.need,
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
    marginTop: 10,
    background: "linear-gradient(135deg, #e63d2b 0%, #7a1810 60%, #1a0808 100%)",
    border: "1px solid rgba(230, 61, 43, 0.4)",
    color: "#ffffff",
    padding: "11px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(230, 61, 43, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
    transition: "all 0.2s ease",
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
      boxShadow: "0 0 20px rgba(255, 255, 255, 0.05), 0 0 8px rgba(255, 255, 255, 0.1) inset",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          letterSpacing: "0.12em",
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          textTransform: "uppercase",
        }}>
          <span style={{ color: ACCENT, fontWeight: 600 }}>{meta.num}</span>
          <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>{meta.title}</span>
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: "#cccccc",
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          letterSpacing: "0.06em",
        }}>
          <BatteryIcon />
          <span>100%</span>
        </div>
      </div>

      {/* Question */}
      <div style={{
        fontSize: 24,
        fontWeight: 400,
        lineHeight: 1.2,
        marginBottom: 14,
        color: TEXT_PRIMARY,
        fontFamily: "'Instrument Serif', Georgia, serif",
        letterSpacing: "-0.005em",
      }}>
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
                multiSelect
              />
            ))}
          </>
        )}

        {/* Q6 — What do you need (MULTI-SELECT). NEXT button lives in the footer. */}
        {step === 6 && (
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
            {NEED_OPTS.map((o) => (
              <OptionRow
                key={o}
                label={o}
                selected={(data.need || []).includes(o)}
                onClick={() => toggleNeed(o)}
                multiSelect
              />
            ))}
          </>
        )}

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

        {/* Right slot — used by Q5 + Q6 multi-select to advance */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {(step === 5 || step === 6) && (() => {
            const arr = step === 5 ? (data.hurt || []) : (data.need || [])
            const hasSelection = arr.length > 0
            return (
              <button
                onClick={() => {
                  if (!hasSelection) return
                  playSelect()
                  next()
                }}
                disabled={!hasSelection}
                style={{
                  background: "transparent",
                  border: "none",
                  color: hasSelection ? ACCENT : TEXT_DIM,
                  cursor: hasSelection ? "pointer" : "not-allowed",
                  padding: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  letterSpacing: "0.04em",
                  opacity: hasSelection ? 1 : 0.5,
                  transition: "color 0.15s, opacity 0.15s",
                }}
              >
                NEXT
                <Chevron color={hasSelection ? ACCENT : TEXT_DIM} />
              </button>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

/* ---------------- MODEL ---------------- */
const QUIZ_UI_W = 364
const QUIZ_UI_H = 400
const SCREEN_FILL = 30 // 👈 Fine-tuned for exact fit

/* 👇 MODEL APPEARANCE — Vibrant Classy Dark */
const MODEL_LOOK = {
  color: "#1c1c1c",       // very dark charcoal — matches reference (near-black with subtle grey)
  metalness: 0.6,         // moderate — allows subtle edge highlights like the reference
  roughness: 0.5,         // semi-matte — soft sheen on edges, no mirror-polish
  envIntensity: 1.6,      // moderate reflection — visible gradient on body surface
  envPreset: "studio",
}

/* 👇 SCREEN GLOW — neutralized */
const SCREEN_GLOW = {
  color: "#ffffff",
  intensity: 0,
  emissive: 0,
  haloBlur: 0,
  haloAlpha: 0,
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
function ResultUI({ report, loading, error, onRetry, contact, setContact, sent, sending, sendError, onSendEmail, isMobile = false }) {
  const isStandby = !report && !loading && !error
  // Truncate long text to keep layout clean
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trim() + "…" : s)

  // Portrait dimensions on mobile so the UI fills the portrait tablet screen
  const uiW = isMobile ? 480 : RESULT_UI_W
  const uiH = isMobile ? 600 : RESULT_UI_H

  return (
    <div style={{
      width: uiW,
      height: uiH,
      background: BG,
      color: TEXT_PRIMARY,
      padding: isMobile ? "20px 22px" : "14px 18px",
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
      boxShadow: "0 0 20px rgba(255, 255, 255, 0.05), 0 0 8px rgba(255, 255, 255, 0.1) inset",
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
        .result-scroll::-webkit-scrollbar-thumb { background: rgba(255, 82, 82, 0.3); border-radius: 2px; }
        .result-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 82, 82, 0.5); }
        .result-scroll { scrollbar-width: thin; scrollbar-color: rgba(255, 82, 82, 0.3) transparent; }
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
                border: `1px solid rgba(255, 82, 82, 0.4)`,
                borderRadius: 999,
                transition: "all 0.15s",
                background: "rgba(255, 82, 82, 0.06)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 82, 82, 0.18)"
                e.currentTarget.style.borderColor = "rgba(255, 82, 82, 0.7)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 82, 82, 0.06)"
                e.currentTarget.style.borderColor = "rgba(255, 82, 82, 0.4)"
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
            <TeaserLine label="PROBLEM" text={report.problem || report.diagnosis} />
            <TeaserLine label="REASON" text={report.reason} />
            <TeaserLine label="SOLUTION" text={report.solution || report.recommendedService} accent />
          </div>

          {/* Flexible spacer — pushes the email CTA card to the BOTTOM no matter how short the top content is */}
          <div style={{ flex: 1, minHeight: 8 }} />

          {/* Subtle divider just above the email card */}
          <div style={{ height: 1, background: "rgba(255, 255, 255, 0.06)" }} />

          {/* BOTTOM CTA card — wraps tagline + form together, pinned to bottom via spacer above */}
          <div style={{
            background: "rgba(255, 82, 82, 0.05)",
            border: "1px solid rgba(255, 82, 82, 0.18)",
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
                      border: `1px solid rgba(255, 82, 82, 0.25)`,
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
  glowColor = "#FF5252",
  glowIntensity = 1.4,
  isMobile = false,
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
  // On mobile: portrait-friendly aspect (taller, narrower) to fit phone viewport
  const BODY_W = isMobile ? 2.3 : 3.6      // 👈 tablet body WIDTH
  const BODY_H = isMobile ? 2.8 : 2.3      // 👈 tablet body HEIGHT
  const BODY_D = 0.18                       // 👈 tablet body DEPTH (thickness)

  // 📐 Screen plane (the lime/glow rectangle) — should be smaller than body to show bezel
  const SCREEN_W = isMobile ? 2.0 : 3.2    // 👈 screen WIDTH
  const SCREEN_H = isMobile ? 2.5 : 1.95   // 👈 screen HEIGHT

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

      {/* Html overlay — sits in front of glass layer.
          UI dimensions match what ResultUI renders (landscape vs portrait by isMobile). */}
      <Html
        transform
        occlude
        position={[0, 0, HTML_Z]}
        scale={Math.min(
          SCREEN_W / (isMobile ? 480 : RESULT_UI_W),
          SCREEN_H / (isMobile ? 600 : RESULT_UI_H)
        ) * TABLET_SCREEN_FILL}
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
  isMobile = false,
}) {
  const { scene } = useGLTF("/models/untitled.glb")
  const modelRef = useRef()

  // Red texture — applied to body
  const bodyTexture = useMemo(() => {
    const tex = new THREE.TextureLoader().load("/textures/red.jpeg")
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.repeat.set(1, 1)
    return tex
  }, [])

  // Each Device gets a deep clone of the GLB scene + cloned materials
  const cloned = useMemo(() => {
    const c = scene.clone(true)

    // Select the "last version" if there are multiple top-level objects.
    const versions = c.children.filter((child) => {
      let hasMesh = false
      child.traverse((o) => { if (o.isMesh) hasMesh = true })
      return hasMesh
    })
    if (versions.length > 1) {
      const lastVersion = versions[versions.length - 1]
      versions.forEach((v) => {
        if (v !== lastVersion) c.remove(v)
      })
    }

    // Auto-scale normalization
    c.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(c)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) c.scale.setScalar(1.0 / maxDim)

    // Replace materials — body meshes get a fresh MeshStandardMaterial with the texture
    c.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const name = obj.name.toLowerCase()
        const isScreen = name.includes("screen") || name.includes("display") || name.includes("glass") || name.includes("panel") || name.includes("front") || name.includes("plane")

        if (isScreen) {
          // Screen face — replace with glass-like MeshPhysicalMaterial so it picks up
          // env reflections + clearcoat specular for visible "shine" on the face.
          const m = new THREE.MeshPhysicalMaterial({
            color: 0x020202,
            metalness: 0,
            roughness: 0.04,           // very smooth — sharp reflections
            envMapIntensity: 1.8,      // picks up the env map prominently
            clearcoat: 1,              // glossy coat → crisp specular highlights
            clearcoatRoughness: 0.02,  // mirror-smooth clearcoat
            reflectivity: 0.6,
          })
          obj.material = m
          m.needsUpdate = true
        } else {
          // Body — MeshPhysicalMaterial with a SUBTLE clearcoat so the top edges catch
          // the spotLight + key directional as soft specular reflections, without losing
          // the underlying matte body look (base roughness stays 0.9).
          const bodyMat = new THREE.MeshPhysicalMaterial({
            map: bodyTexture,
            color: 0xffffff,                  // white — texture shows in true tones
            metalness: 0.0,
            roughness: 0.9,                   // matte base preserved
            envMapIntensity: 0.4,             // slight env pickup so top surfaces glow softly
            clearcoat: 0.45,                  // subtle glossy coat → light reflection on top
            clearcoatRoughness: 0.25,         // satin (not mirror) so it's a soft sheen
            reflectivity: 0.25,
          })

          if (name.includes("button") || name.includes("accent") || name.includes("led") || name.includes("light")) {
            bodyMat.emissive = new THREE.Color("#FF5252")
            bodyMat.emissiveIntensity = 2.5
          }

          obj.material = bodyMat
        }
      }
    })
    return c
  }, [scene, bodyTexture])

  const [info, setInfo] = useState(null)
  const [isBackFacing, setIsBackFacing] = useState(false)
  const groupRef = useRef()
  const htmlRef = useRef()
  const animRef = useRef({ active: false, startY: 0, targetY: 0, startTime: 0, pendingDir: 0 })
  // Initial pose — device rotated enough to clearly expose the right-side red panel
   // strips + button + corner detail. ~-0.35 rad ≈ -20°.
  const INITIAL_RESTING_Y = -0.35
  const restingYRef = useRef(INITIAL_RESTING_Y)
  const lastFaceRef = useRef(false)   // tracks previous facing state to avoid every-frame re-renders
  // Smoothed cursor — input stage of dual smoothing for jitter-free mouse tracking
  const smoothPointerRef = useRef({ x: 0, y: 0 })

  // Expose spin trigger to parent via ref
  useEffect(() => {
    if (spinRef) spinRef.current = (direction) => { animRef.current.pendingDir = direction }
  }, [spinRef])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    // Clamp delta so a tab-switch / long frame can't snap the device when focus returns
    const dt = Math.min(delta, 0.05)
    const a = animRef.current
    if (a.pendingDir !== 0) {
      a.startY = groupRef.current.rotation.y
      a.targetY = a.startY + Math.PI * 2 * a.pendingDir
      a.startTime = state.clock.elapsedTime
      a.active = true
      a.pendingDir = 0
    }
    const tNow = state.clock.elapsedTime
    // Gentle idle float — subtle vertical bob (absolute-time, FPS-independent already)
    groupRef.current.position.y = position[1] + Math.sin(tNow * 0.6) * 0.045
    // Smoothly lerp X toward target — exponential damping, frame-rate independent
    const posEase = 1 - Math.exp(-2.5 * dt)
    groupRef.current.position.x += (position[0] - groupRef.current.position.x) * posEase
    if (a.active) {
      // SPIN animation — drives rotation.y toward target
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
      // Keep cursor-smoothing in sync during spin so the device doesn't snap on exit
      const sp = smoothPointerRef.current
      const eIn = 1 - Math.exp(-10 * dt)
      sp.x += (state.pointer.x - sp.x) * eIn
      sp.y += (state.pointer.y - sp.y) * eIn
    } else if (isMobile) {
      // ── MOBILE: NO mouse-tracking. OrbitControls handles all touch rotation.
      // The device just sits at its resting Y rotation (set by spin choreography).
      // This avoids the "spinning" feel when touch + tracking compete.
      // No-op — restingYRef.current already drives groupRef.current.rotation.y via the spin code above.
    } else {
      // ── DESKTOP SLEEK MOUSE TRACKING — minimal, refined, never distracting ──
      // Stage 1: soft low-pass filter on cursor (lower stiffness → smoother input).
      const sp = smoothPointerRef.current
      const pointerEase = 1 - Math.exp(-6 * dt)
      sp.x += (state.pointer.x - sp.x) * pointerEase
      sp.y += (state.pointer.y - sp.y) * pointerEase

      // Tracking range (radians) — VERY subtle horizontal sway (~4.6°). Refined, not reactive.
      const Y_RANGE = 0.08

      // Micro-drift — barely perceptible, just keeps the device feeling alive.
      const driftY = Math.sin(tNow * 0.3) * 0.004

      // DEAD-ZONE — cursor in lower area below the device → tracking fades to 0.
      const rampStart = -0.1
      const rampEnd = -0.4
      let trackFactor = 1
      if (state.pointer.y < rampStart) {
        trackFactor = Math.max(0, (state.pointer.y - rampEnd) / (rampStart - rampEnd))
      }

      // Target rotation. Vertical (X) tilt locked at 0 — device always upright.
      const targetY = restingYRef.current + sp.x * Y_RANGE * trackFactor + driftY
      const targetX = 0

      // Stage 2: gentle damping (lower stiffness → slow, premium glide).
      const rotEase = 1 - Math.exp(-3 * dt)
      groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * rotEase
      groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * rotEase
    }

    // 🔄 Backface culling — runs EVERY frame (including during spin) so the
    // Html overlay properly hides as the device rotates past 90° toward its back.
    // Computes screen normal in world space vs direction to camera.
    const worldQuat = new THREE.Quaternion()
    groupRef.current.getWorldQuaternion(worldQuat)
    const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat)

    const worldPos = new THREE.Vector3()
    groupRef.current.getWorldPosition(worldPos)
    const toCamera = new THREE.Vector3().subVectors(state.camera.position, worldPos).normalize()

    // Small threshold (0.1 instead of 0) so screen doesn't flicker right at edge-on (90°)
    const isBack = screenNormal.dot(toCamera) < 0.1
    if (isBack !== lastFaceRef.current) {
      lastFaceRef.current = isBack
      setIsBackFacing(isBack)
    }
  })

  // ── Geometry effect — only recomputes when the cloned model changes (not on glow tweaks). ──
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
      center.z += size.z * 0.19
      center.y -= size.y * 0.18
      center.x += size.x * -0.02
      size.x *= 0.98
      size.y *= 1.26
    }
    const offset = new THREE.Vector3().subVectors(center, modelCenter)
    setInfo({ size, offset })
  }, [cloned])

  // ── Screen glow effect — only touches material props of the screen mesh, runs when glow values change. ──
  useEffect(() => {
    cloned.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const name = obj.name.toLowerCase()
        const isScreen =
          name.includes("screen") || name.includes("display") ||
          name.includes("glass") || name.includes("panel")
        if (isScreen) {
          const m = obj.material
          if (!m.map) m.color?.set("#050505")
          if ("metalness" in m) m.metalness = 0
          if ("roughness" in m) m.roughness = 0.04
          if (m.emissive) m.emissive.set(glowColor)
          if ("emissiveIntensity" in m) m.emissiveIntensity = glowEmissive
          // Preserve reflective glass settings from the initial material setup —
          // these make the face actually catch env reflections.
          if ("envMapIntensity" in m) m.envMapIntensity = 1.8
          if ("clearcoat" in m) m.clearcoat = 1
          if ("clearcoatRoughness" in m) m.clearcoatRoughness = 0.02
          m.needsUpdate = true
        }
      }
    })
  }, [cloned, glowColor, glowEmissive])

  return (
    <group ref={groupRef} position={position} rotation={[0, INITIAL_RESTING_Y, 0]}>
      <Center>
        <group ref={modelRef}>
          <primitive object={cloned} scale={1.8} />
        </group>
      </Center>

      {info && (
        <>
          <pointLight
            position={[
              info.offset.x,
              info.offset.y + 0.27,
              info.offset.z + 0.3,
            ]}
            color={glowColor}
            intensity={glowIntensity}
            distance={3}
            decay={2}
          />
          <Html
            ref={htmlRef}
            transform
            position={[
              info.offset.x,
              info.offset.y + 0.27,
              info.offset.z + 0.08,
            ]}
            scale={Math.min(
              info.size.x / QUIZ_UI_W,
              info.size.y / QUIZ_UI_H
            ) * SCREEN_FILL}
            zIndexRange={[100, 0]}
            style={{
              pointerEvents: isBackFacing ? "none" : "auto",
              opacity: isBackFacing ? 0 : 1,
              visibility: isBackFacing ? "hidden" : "visible",
              transition: "opacity 0.15s",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
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

/* ⚡ Lightning pulse — slow breathing brightness with occasional sharp flashes */
function LightningPulseLight({ position = [0, 1.5, 1.5], color = "#ff6645" }) {
  const ref = useRef()
  const flashRef = useRef({ until: 0 })
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    // Slow breathing pulse 0.6 ↔ 1.6
    const pulse = 1.1 + Math.sin(t * 0.7) * 0.5
    // Occasional bright flash (~every 6-10s)
    if (t > flashRef.current.until && Math.random() < 0.001) {
      flashRef.current.until = t + 0.18
    }
    const flashing = t < flashRef.current.until
    const flash = flashing ? 4.5 : 0
    ref.current.intensity = pulse + flash
  })
  return <pointLight ref={ref} position={position} color={color} distance={7} decay={2} />
}

/* Orbiting accent light — slow circular motion creates moving highlights on the device */
function OrbitingAccentLight({ radius = 3.2, height = 1.2, speed = 0.25, color = "#ff6645", intensity = 3.0 }) {
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
function InputScene({ onGenerate, onStart, loading, spinRef, quizKey = 0, isMobile = false }) {
  // On mobile, push the device DOWN so the heading on top has room above
  const deviceY = isMobile ? -0.35 : 0
  const deviceX = 0

  // ── Lights "boot-up" sequence — model emerges from darkness on load.
  // All lights start at intensity 0 and ramp up over ~1.8s with easeOutCubic.
  const lightRefs = useRef({
    ambient: null, dirKey: null, dirFill: null, dirLeft: null,
    spot: null, rim: null, wash: null, face: null, startTime: null,
  })
  // Full-strength intensities (the values lights settle to)
  const BOOT_TARGETS = {
    ambient: 1.6, dirKey: 4.5, dirFill: 2.6, dirLeft: 3.5,
    spot: 5, rim: 3, wash: 0.5, face: 0.6,
  }
  useFrame((state) => {
    const r = lightRefs.current
    if (r.startTime === null) r.startTime = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - r.startTime
    const DURATION = 1.8
    const p = Math.min(1, elapsed / DURATION)
    const eased = 1 - Math.pow(1 - p, 3)   // easeOutCubic — fast start, gentle settle
    if (r.ambient) r.ambient.intensity = BOOT_TARGETS.ambient * eased
    if (r.dirKey)  r.dirKey.intensity  = BOOT_TARGETS.dirKey  * eased
    if (r.dirFill) r.dirFill.intensity = BOOT_TARGETS.dirFill * eased
    if (r.dirLeft) r.dirLeft.intensity = BOOT_TARGETS.dirLeft * eased
    if (r.spot)    r.spot.intensity    = BOOT_TARGETS.spot    * eased
    if (r.rim)     r.rim.intensity     = BOOT_TARGETS.rim     * eased
    if (r.wash)    r.wash.intensity    = BOOT_TARGETS.wash    * eased
    if (r.face)    r.face.intensity    = BOOT_TARGETS.face    * eased
  })

  return (
    <>
      {/* ── Consolidated lighting — all start at intensity 0 and ramp up via boot useFrame above ── */}
      <ambientLight
        ref={(el) => { lightRefs.current.ambient = el }}
        intensity={0}
        color="#fff5ec"
      />
      {/* Key light — main illumination */}
      <directionalLight
        ref={(el) => { lightRefs.current.dirKey = el }}
        position={[3, 5, 4]}
        intensity={0}
        color="#ffffff"
      />
      {/* Warm fill from opposite side */}
      <directionalLight
        ref={(el) => { lightRefs.current.dirFill = el }}
        position={[-4, 3, 3]}
        intensity={0}
        color="#FF9080"
      />
      {/* Studio key spotlight — top-right-front focused beam */}
      <spotLight
        ref={(el) => { lightRefs.current.spot = el }}
        position={[3, 5, 2]}
        angle={Math.PI / 6}
        penumbra={0.5}
        intensity={0}
        distance={15}
        decay={1}
        color="#ffffff"
        target-position={[deviceX, deviceY, 0]}
      />
      {/* Left side directional — balances the spotlight */}
      <directionalLight
        ref={(el) => { lightRefs.current.dirLeft = el }}
        position={[-6, 2, 3]}
        intensity={0}
        color="#ffffff"
      />
      {/* Back rim — separates device silhouette from bg */}
      <pointLight
        ref={(el) => { lightRefs.current.rim = el }}
        position={[deviceX, 0.4, -3]}
        color="#FF5252"
        intensity={0}
        distance={7}
        decay={2}
      />
      {/* Front wash — eliminates dark voids on body */}
      <pointLight
        ref={(el) => { lightRefs.current.wash = el }}
        position={[deviceX, 1, 3.5]}
        color="#ffffff"
        intensity={0}
        distance={6}
        decay={1.8}
      />
      {/* Face light — pure directional from straight-front, lights the SCREEN face directly.
          Sits just above the camera line so it angles slightly down across the device face. */}
      <directionalLight
        ref={(el) => { lightRefs.current.face = el }}
        position={[deviceX, 0.4, 6]}
        intensity={0}
        color="#ffffff"
      />
      {/* Single orbiting accent — keeps the dynamic motion feel */}
      <OrbitingAccentLight color="#FF5252" intensity={3.5} />

      <Environment preset={MODEL_LOOK.envPreset} />

      <Suspense fallback={<FallbackBox />}>
        <Device
          position={[deviceX, deviceY, 0]}
          glowColor="#ffffff"
          spinRef={spinRef}
          isMobile={isMobile}
        >
          <QuizUI
            key={quizKey}
            onAdvance={(amount) => spinRef?.current?.(amount)}
            onGenerate={onGenerate}
            onStart={onStart}
            loading={loading}
          />
        </Device>
      </Suspense>

      {/* Primary tight contact shadow — closely hugs the device's footprint, no wide spread */}
      <ContactShadows
        position={[deviceX, -1.05 + deviceY, 0]}
        opacity={1.0}
        scale={3.5}
        blur={0.9}
        far={0.9}
        resolution={512}
        color="#000000"
      />
      {/* Secondary close halo — small soft falloff right around the device base for depth */}
      <ContactShadows
        position={[deviceX, -1.06 + deviceY, 0]}
        opacity={0.4}
        scale={5}
        blur={1.8}
        far={1.4}
        resolution={256}
        color="#000000"
      />

      <OrbitControls
        makeDefault
        enableZoom={false}
        enablePan={false}
        enableRotate={true}
        enableDamping
        /* Touch fast-spin fix:
           1. `dampingFactor: 0.25` on mobile → kills swipe momentum almost immediately,
              so the device stops as soon as the finger lifts.
           2. `rotateSpeed: 0.3` on mobile → halves single-finger sensitivity to match
              the larger arc a thumb naturally traces on a phone screen.
           3. `TWO: THREE.TOUCH.DOLLY_PAN` (was ROTATE) → standard two-finger value.
              With enableZoom + enablePan both false, this makes two-finger touches a no-op
              instead of triggering a second ROTATE algorithm that doubled the spin speed. */
        dampingFactor={isMobile ? 0.25 : 0.08}
        rotateSpeed={isMobile ? 0.3 : 0.7}
        minPolarAngle={isMobile ? Math.PI / 2.6 : Math.PI / 3.5}
        maxPolarAngle={isMobile ? Math.PI / 1.95 : Math.PI / 1.8}
        target={[deviceX, deviceY, 0]}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
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
function OutputScene({ report, loading, error, onRetry, contact, setContact, sent, sending, sendError, onSendEmail, isMobile = false }) {
  return (
    <>
      {/* Camera intro — dollies from far → close on mount for cinematic reveal */}
      <CameraIntro
        from={isMobile ? [0, 0.3, 8.5] : [0, 0.6, 7.5]}
        to={isMobile ? [0, 0.05, 5.4] : [0, 0.1, 4.0]}
        duration={1.8}
      />

      {/* Layered atmospheric lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 6, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-5, 4, 4]} intensity={0.55} />
      {/* Top fill — soft purple wash */}
      <directionalLight position={[0, 8, 2]} intensity={0.4} color="#ffaa9b" />
      {/* Rim/back light — purple to match primary theme */}
      <directionalLight position={[0, 3, -5]} intensity={1.5} color="#ff8576" />

      <Environment preset={MODEL_LOOK.envPreset} />

      <TabletDevice position={[0, 0, 0]} glowColor="#FF5252" isMobile={isMobile}>
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
          isMobile={isMobile}
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
    color: "#FF5252",
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
  const isMobile = useIsMobile()
  return (
    <div style={{
      width: "100%",
      height: "100%",
      maxWidth: 1100,
      margin: "0 auto",
      padding: isMobile ? "40px 18px" : "60px 32px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: isMobile ? 28 : 40,
      position: "relative",
      zIndex: 3,
    }}>
      {/* Hero header */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: isMobile ? 10 : 11,
          color: "#FF5252",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 12,
        }}>
          ✦ While you read your report
        </div>
        <div style={{
          fontSize: isMobile ? 24 : 36,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          marginBottom: 12,
        }}>
          Here's what we've shipped{!isMobile && <br />} for founders like you.
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
          style={{ color: "#FF5252", textDecoration: "none", fontWeight: 600, borderBottom: "1px solid rgba(230,61,43,0.4)" }}
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
        background: "linear-gradient(180deg, rgba(230,61,43,0.06) 0%, rgba(0,0,0,0.4) 100%)",
        border: `1px solid ${hover ? "rgba(230,61,43,0.4)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 14,
        padding: "20px 22px",
        cursor: "pointer",
        transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1), border-color 0.3s, box-shadow 0.3s",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hover ? "0 16px 40px rgba(255, 82, 82, 0.15)" : "0 2px 8px rgba(0,0,0,0.3)",
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
      padding: "5px 11px",
      borderRadius: 999,
      background: light ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.06)",
      border: `1px solid ${light ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.08)"}`,
      color: light ? "rgba(255, 255, 255, 0.92)" : "rgba(255, 255, 255, 0.78)",
      fontSize: 10,
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
  const isMobile = useIsMobile()
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
    fontSize: "clamp(20px, 1.7vw, 26px)",
    fontWeight: 500,
    color: "#ffffff",
    fontFamily: "'Inter', system-ui, sans-serif",
    letterSpacing: "-0.025em",
    lineHeight: 1.05,
  }
  const titleMd = {
    ...titleLg,
    fontSize: "clamp(17px, 1.35vw, 21px)",
  }
  const descStyle = {
    margin: 0,
    color: "rgba(255, 255, 255, 0.78)",
    fontSize: 12,
    lineHeight: 1.5,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 400,
  }

  return (
    <div style={{
      width: "100%",
      maxWidth: 1100,
      margin: "0 auto",
      padding: isMobile ? "56px 18px 120px" : "80px 32px 180px",
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
        style={{ textAlign: "center", marginBottom: isMobile ? 36 : 56 }}
      >
        <div style={{
          color: ACCENT,
          fontSize: isMobile ? 10 : 11,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: isMobile ? 14 : 22,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          What We Do
        </div>
        <h2 style={{
          margin: 0,
          fontSize: isMobile ? "clamp(26px, 7vw, 36px)" : "clamp(36px, 5vw, 76px)",
          fontWeight: 500,
          color: "#ffffff",
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          We Engineer{" "}
          <em style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
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
          gridTemplateColumns: isMobile ? "1fr" : "1.45fr 1fr",
          gap: isMobile ? 14 : 16,
          marginBottom: isMobile ? 14 : 16,
        }}
      >
        {/* ━━━ BRAND INTELLIGENCE — large red card with 3D logo ━━━ */}
        <div style={{
          ...cardBaseStyle,
          background: "radial-gradient(ellipse 95% 110% at 80% 20%, #db302a 0%, #b22420 30%, #761816 60%, #480d0d 100%)",
          minHeight: isMobile ? 220 : 270,
          padding: isMobile ? "22px 22px" : "26px 32px",
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
          minHeight: isMobile ? 240 : 270,
          padding: isMobile ? "22px 22px" : "26px 28px",
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
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
          gap: isMobile ? 14 : 16,
        }}
      >
        {/* ━━━ DIGITAL PRODUCT — orange/yellow glow ━━━ */}
        <div style={{
          ...cardBaseStyle,
          background: "#0a0907",
          minHeight: isMobile ? 210 : 230,
          padding: isMobile ? "20px 20px" : "22px 22px",
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
          minHeight: isMobile ? 210 : 230,
          padding: isMobile ? "20px 20px" : "22px 22px",
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
          minHeight: isMobile ? 210 : 230,
          padding: 0,
        }}>
          {/* Wave at top */}
          <div style={{
            width: "100%",
            height: 110,
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
            padding: "0 20px 18px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 14,
          }}>
            <h3 style={{ ...titleMd, marginTop: 6 }}>All Services</h3>
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
                padding: "14px 20px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                textDecoration: "none",
                fontFamily: "'Inter', system-ui, sans-serif",
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

/* ---------------- REPORT SENT POPUP — full-screen overlay with success message ---------------- */
function ReportSentPopup({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            padding: 24,
          }}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 10 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: "linear-gradient(135deg, rgba(20, 14, 14, 0.98) 0%, rgba(28, 20, 20, 0.95) 100%)",
              border: "1px solid rgba(255, 82, 82, 0.35)",
              borderRadius: 28,
              padding: "52px 48px",
              textAlign: "center",
              maxWidth: 480,
              width: "100%",
              boxShadow: "0 30px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(255, 82, 82, 0.18)",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            {/* Animated checkmark circle */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                margin: "0 auto 28px",
                background: "linear-gradient(135deg, #0d0000 0%, #9B1C1C 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 50px rgba(255, 82, 82, 0.5), 0 8px 24px rgba(255, 82, 82, 0.3)",
              }}
            >
              <motion.svg
                width="42"
                height="42"
                viewBox="0 0 42 42"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
              >
                <motion.path
                  d="M11 21 L18 28 L31 14"
                  stroke="#ffffff"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
                />
              </motion.svg>
            </motion.div>

            {/* Eyebrow label */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
              style={{
                fontSize: 11,
                color: "#FF5252",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              ✦ Transmission Complete
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
              style={{
                margin: 0,
                fontSize: "clamp(26px, 3vw, 36px)",
                fontWeight: 500,
                color: "#ffffff",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                marginBottom: 14,
              }}
            >
              Report sent to{" "}
              <em style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: "italic", color: "#ff7a6a" }}>
                your inbox
              </em>
            </motion.h2>

            {/* Body */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.95, ease: [0.22, 1, 0.36, 1] }}
              style={{
                margin: 0,
                fontSize: 14,
                color: "rgba(255, 255, 255, 0.65)",
                lineHeight: 1.6,
                maxWidth: 360,
                marginInline: "auto",
              }}
            >
              Check your email for the full strategy report — diagnosis, top priorities, recommended service, and a 30-day action plan.
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- SUCCESS STORIES SECTION — works portfolio grid (Section 4) ---------------- */
const STORIES = [
  {
    title: "Robotspace",
    tags: ["BRANDING", "VISUAL IDENTITY", "WEB DESIGN", "APP"],
    image: "/stories/robotspace.png",
    bg: "#ee5a1f",
  },
  {
    title: "Klinq",
    tags: ["APP", "WEB DESIGN", "WEB DEVELOPMENT"],
    image: "/stories/klinq.png",
    bg: "linear-gradient(135deg, #b86bff 0%, #ff6e8b 100%)",
  },
  {
    title: "Catalytic Nutra",
    tags: ["VISUAL IDENTITY", "WEB DESIGN", "BRANDING"],
    image: "/stories/catalytic.png",
    bg: "#1f3a2c",
  },
  {
    title: "Mayborne Bulk",
    tags: ["BRANDING", "LOGO", "WEB DESIGN", "DEVELOPMENT"],
    image: "/stories/mayborne.png",
    bg: "linear-gradient(180deg, #1c2535 0%, #5b8caa 100%)",
  },
]

function StoryCard({ story, isMobile = false }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 14 }}
    >
      {/* Image / visual area */}
      <div style={{
        width: "100%",
        aspectRatio: "16 / 10",
        borderRadius: isMobile ? 14 : 16,
        background: story.bg,
        backgroundImage: story.image ? `url(${story.image})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        overflow: "hidden",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hover ? "0 24px 50px rgba(0,0,0,0.45)" : "0 12px 30px rgba(0,0,0,0.25)",
        transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s",
      }} />

      {/* Tags */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        fontSize: isMobile ? 9 : 10,
        color: "rgba(255, 255, 255, 0.55)",
        letterSpacing: "0.08em",
        fontWeight: 500,
        fontFamily: "'Inter', system-ui, sans-serif",
        lineHeight: 1.6,
      }}>
        {story.tags.map((t, i) => (
          <span key={t}>
            {t}
            {i < story.tags.length - 1 && <span style={{ marginLeft: 4, color: "rgba(255,255,255,0.25)" }}>|</span>}
          </span>
        ))}
      </div>

      {/* Title */}
      <h3 style={{
        margin: 0,
        fontSize: isMobile ? 20 : 28,
        fontWeight: 500,
        color: "#ffffff",
        fontFamily: "'Inter', system-ui, sans-serif",
        letterSpacing: "-0.025em",
        lineHeight: 1.1,
      }}>
        {story.title}
      </h3>
    </div>
  )
}

function SuccessStoriesSection() {
  const isMobile = useIsMobile()

  return (
    <div style={{
      width: "100%",
      maxWidth: 1100,
      margin: "0 auto",
      padding: isMobile ? "100px 16px 60px" : "220px 32px 100px",
      boxSizing: "border-box",
      position: "relative",
      zIndex: 3,
    }}>
      {/* Golden halftone dome — decorative top backdrop (real image asset) */}
      <img
        src="/stories/halftone.png"
        alt=""
        style={{
          position: "absolute",
          top: isMobile ? 20 : 40,
          left: "50%",
          transform: "translateX(-50%)",
          width: isMobile ? "150%" : "115%",
          maxWidth: 1700,
          height: "auto",
          pointerEvents: "none",
          userSelect: "none",
          opacity: 0.85,
          zIndex: 0,
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{
          textAlign: "center",
          marginBottom: isMobile ? 32 : 64,
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{
          color: ACCENT,
          fontSize: isMobile ? 10 : 11,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: isMobile ? 16 : 22,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          Works
        </div>
        <h2 style={{
          margin: 0,
          fontSize: "clamp(28px, 7vw, 76px)",
          fontWeight: 500,
          color: "#ffffff",
          lineHeight: 1.05,
          letterSpacing: "-0.025em",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          Our{" "}
          <em style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 400,
          }}>
            Success Stories
          </em>
        </h2>
      </motion.div>

      {/* Cards grid — 2x2 on desktop, single column on mobile */}
      <motion.div
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8%" }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 24 : 28,
          position: "relative",
          zIndex: 2,
        }}
      >
        {STORIES.map((s) => (
          <StoryCard key={s.title} story={s} isMobile={isMobile} />
        ))}
      </motion.div>

      {/* SEE ALL WORKS CTA — pink/cream pill, centered */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{
          marginTop: isMobile ? 36 : 64,
          display: "flex",
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        <a
          href={CALL_BOOKING_LINK}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={(e) => { e.currentTarget.style.background = "#fce5d8"; playHover() }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#f4dbcd" }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            background: "#f4dbcd",
            color: "#0e0e0e",
            padding: isMobile ? "14px 26px" : "16px 32px",
            borderRadius: 999,
            fontSize: isMobile ? 11 : 12,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            textDecoration: "none",
            fontFamily: "'Inter', system-ui, sans-serif",
            transition: "background 0.25s",
          }}
        >
          <span style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#0e0e0e",
            display: "inline-block",
          }} />
          See all works
        </a>
      </motion.div>
    </div>
  )
}

/* ---------------- ANIMATED HEADLINE — character-by-character reveal on mount ---------------- */
function AnimatedHeadline() {
  const lines = [
    {
      text: "Brand strategy",
      color: "#FFFFFF",
      fontFamily: "'Instrument Serif', Georgia, serif",
      fontStyle: "normal",
      fontWeight: 400,
      letterSpacing: "-0.02em",
    },
    {
      text: "that wins.",
      color: "#FF4547",
      fontFamily: "'Instrument Serif', Georgia, serif",
      fontStyle: "italic",
      fontWeight: 400,
      letterSpacing: "-0.02em",
    },
  ]

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.045, delayChildren: 0.35 } },
  }
  const child = {
    hidden: { opacity: 0, y: 28, filter: "blur(10px)" },
    show: {
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
        fontSize: "clamp(36px, 6vw, 84px)",
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
            textShadow: line.textShadow,
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
    show: {
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

/* ---------------- DIAGNOSIS ENGINE BADGE — sci-fi status pill below the subheading ----------------
   Bordered red box with a pulsing red dot, monospace "DIAGNOSIS ENGINE: ONLINE" label,
   and an animated ECG/heartbeat line on the right. Matches the futuristic hero aesthetic. */
function DiagnosisEngineBadge({ isMobile = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.9, delay: 1.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        marginTop: isMobile ? 20 : 28,
        maxWidth: isMobile ? "100%" : 420,
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 10 : 12,
        padding: isMobile ? "9px 12px" : "11px 16px",
        background: "linear-gradient(135deg, rgba(45, 8, 8, 0.55) 0%, rgba(15, 4, 4, 0.45) 100%)",
        border: "1px solid rgba(255, 69, 71, 0.35)",
        borderRadius: 8,
        boxShadow: "0 0 28px rgba(255, 69, 71, 0.18), inset 0 0 12px rgba(255, 69, 71, 0.06)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        boxSizing: "border-box",
      }}
    >
      {/* Pulsing status dot */}
      <span style={{
        width: isMobile ? 8 : 9,
        height: isMobile ? 8 : 9,
        borderRadius: "50%",
        background: "#FF4547",
        boxShadow: "0 0 10px #FF4547, 0 0 18px rgba(255, 69, 71, 0.6)",
        animation: "pulse 1.6s ease-in-out infinite",
        flexShrink: 0,
      }} />

      {/* Label */}
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: isMobile ? 9 : 11,
        letterSpacing: isMobile ? "0.14em" : "0.18em",
        textTransform: "uppercase",
        color: "#FF4547",
        fontWeight: 500,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}>
        Diagnosis Engine: Online
      </span>

      {/* ECG / heartbeat line — fills remaining space, drawn animation */}
      <svg
        viewBox="0 0 100 16"
        width="100%"
        height="16"
        preserveAspectRatio="none"
        style={{ flex: 1, minWidth: 60, opacity: 0.85 }}
        aria-hidden="true"
      >
        <motion.polyline
          points="0,8 14,8 18,4 22,12 26,8 40,8 44,2 48,14 52,8 66,8 70,5 74,11 78,8 100,8"
          fill="none"
          stroke="#FF4547"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 1.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: "drop-shadow(0 0 4px rgba(255, 69, 71, 0.7))" }}
        />
      </svg>
    </motion.div>
  )
}

/* ---------------- REPORT SECTION — DOM-based immersive layout (replaces the 3D tablet) ---------------- */
function ReportSection({ report, loading, error, onRetry, contact, setContact, sent, sending, sendError, onSendEmail, isMobile = false, onReset }) {
  const isStandby = !report && !loading && !error

  return (
    <div style={{
      width: "100%",
      maxWidth: 1400,
      margin: "0 auto",
      padding: isMobile ? "60px 16px 60px" : "90px 180px",
      boxSizing: "border-box",
      position: "relative",
      zIndex: 3,
    }}>
      {/* Reset / Start Over pill — top-left */}
      {onReset && (
        <motion.button
          onClick={onReset}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(230, 61, 43, 0.18)"; e.currentTarget.style.borderColor = "rgba(230, 61, 43, 0.5)"; e.currentTarget.style.color = "#ffffff"; playHover() }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"; e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)"; e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)" }}
          style={{
            position: "absolute",
            top: isMobile ? 16 : 28,
            left: isMobile ? 16 : 32,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: isMobile ? "7px 14px" : "9px 16px",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderRadius: 999,
            fontSize: isMobile ? 10 : 11,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.7)",
            cursor: "pointer",
            transition: "background 0.2s, color 0.2s, border-color 0.2s",
            zIndex: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Start Over
        </motion.button>
      )}

      {/* ─── Header (eyebrow + big heading, centered) ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{ textAlign: "center", marginBottom: isMobile ? 40 : 64 }}
      >
        <div style={{
          color: "#FF4547",
          fontSize: isMobile ? 10 : 12,
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: isMobile ? 14 : 22,
          fontFamily: "'Geist Mono', ui-monospace, monospace",
        }}>
          {loading && "Analyzing your answers"}
          {error && "Something went wrong"}
          {(report || isStandby) && "Strategic Diagnosis · Complete"}
        </div>
        <h2 style={{
          margin: 0,
          fontSize: isMobile ? "clamp(36px, 10vw, 56px)" : "clamp(56px, 6.5vw, 96px)",
          fontWeight: 400,
          color: "#ffffff",
          lineHeight: 1.02,
          letterSpacing: "-0.02em",
          fontFamily: "'Instrument Serif', Georgia, serif",
        }}>
          {loading && "Reading the signals…"}
          {error && <>Unable to <em style={{ fontStyle: "italic", color: "#ff6b6b" }}>connect</em></>}
          {(report || isStandby) && "Here's what's holding you back"}
        </h2>
      </motion.div>

      {/* ─── LOADING STATE ─── */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 20px",
            gap: 20,
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            border: "3px solid rgba(255, 69, 71, 0.15)",
            borderTopColor: "#FF4547",
            animation: "spin 0.9s linear infinite",
          }} />
          <div style={{
            fontSize: 12,
            color: "rgba(255, 255, 255, 0.55)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            animation: "pulse 1.4s ease-in-out infinite",
          }}>
            Diagnosing your brand…
          </div>
        </motion.div>
      )}

      {/* ─── ERROR STATE ─── */}
      {error && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            padding: "40px 20px",
            maxWidth: 500,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <div style={{
            fontSize: 14, color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.55,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            {error}
          </div>
          <button
            onClick={onRetry}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(230, 61, 43, 0.95)"; playHover() }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#e63d2b" }}
            style={{
              padding: "12px 24px",
              background: "#e63d2b",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "'Inter', system-ui, sans-serif",
              transition: "background 0.2s",
            }}
          >
            Try again
          </button>
        </motion.div>
      )}

      {/* ─── REPORT — 3-cell grid + bottom hourglass/form row ─── */}
      {report && !loading && !error && (
        <>
          {/* Three diagnostic cells — borders form a clean editorial grid */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
            }}
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
              borderTop: "1px solid rgba(255, 255, 255, 0.10)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.10)",
              background: "#0F0F0F",
            }}
          >
            <ReportCell
              num="01"
              label="PROBLEM"
              accent="#FF4547"
              iconBg="rgba(255, 69, 71, 0.14)"
              iconBorder="rgba(255, 69, 71, 0.40)"
              icon={<WarningIcon />}
              text={report.problem || report.diagnosis}
              isMobile={isMobile}
              hasRightBorder={!isMobile}
            />
            <ReportCell
              num="02"
              label="ROOT CAUSE"
              accent="#7a6dff"
              iconBg="rgba(122, 109, 255, 0.14)"
              iconBorder="rgba(122, 109, 255, 0.40)"
              icon={<SqrtIcon />}
              text={report.reason}
              isMobile={isMobile}
              hasRightBorder={!isMobile}
            />
            <ReportCell
              num="03"
              label="MOVE"
              accent="#bda685"
              iconBg="rgba(189, 166, 133, 0.12)"
              iconBorder="rgba(189, 166, 133, 0.32)"
              icon={<MoveIcon />}
              text={report.solution || report.recommendedService}
              isMobile={isMobile}
              hasRightBorder={false}
            />
          </motion.div>

          {/* Bottom row — hourglass | description | form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1.25fr 1fr",
              borderBottom: "1px solid rgba(255, 255, 255, 0.10)",
            }}
          >
            {/* ── Hourglass column ── image fits inside cell, aspect ratio preserved ── */}
            <div style={{
              padding: 0,
              borderRight: isMobile ? "none" : "1px solid rgba(255, 255, 255, 0.10)",
              borderBottom: isMobile ? "1px solid rgba(255, 255, 255, 0.10)" : "none",
              minHeight: 280,
              background: "#0F0F0F",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <img
                src="/services/hourglass.png"
                alt="Brand impact hourglass"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>

            {/* ── Description column ── */}
            <div style={{
              padding: isMobile ? "32px 24px" : "44px 40px",
              borderRight: "none",
              borderBottom: isMobile ? "1px solid rgba(255, 255, 255, 0.10)" : "none",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              background: "#0F0F0F",
            }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 16,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#FF4547",
                  boxShadow: "0 0 10px rgba(255, 69, 71, 0.7)",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 11,
                  color: "#FF4547",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                }}>
                  Get Full Report
                </span>
              </div>
              <h3 style={{
                margin: 0,
                marginBottom: 14,
                fontSize: isMobile ? 26 : 38,
                fontWeight: 400,
                color: "#ffffff",
                lineHeight: 1.12,
                letterSpacing: "-0.015em",
                fontFamily: "'Instrument Serif', Georgia, serif",
              }}>
                Detailed Diagnosis & 30 day plan
              </h3>
              <p style={{
                margin: 0,
                fontSize: 14,
                color: "rgba(255, 255, 255, 0.55)",
                lineHeight: 1.6,
                fontFamily: "'Inter', system-ui, sans-serif",
                maxWidth: 460,
              }}>
                Top 3 priorities with severity scores, recommended service tailored to your situation, and concrete action you can start Monday — delivered to your inbox
              </p>
            </div>

            {/* ── Form column ── */}
            <div style={{
              padding: isMobile ? "32px 24px" : "44px 36px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              justifyContent: "center",
              background: "#0F0F0F",
            }}>
              {/* BRANDHERO wordmark — centered */}
              <img
                src="/logo/logo.png"
                alt="BrandHero"
                style={{
                  width: 120,
                  height: "auto",
                  marginBottom: 18,
                  alignSelf: "center",
                }}
              />

              {/* Email form */}
              {!sent ? (
                <form onSubmit={onSendEmail} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input
                    type="email"
                    placeholder="YOUR EMAIL"
                    value={contact.email}
                    onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                    required
                    style={{
                      padding: "16px 18px",
                      background: "#1a1818",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: 6,
                      color: "#ffffff",
                      fontSize: 12,
                      outline: "none",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255, 69, 71, 0.5)" }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)" }}
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    onMouseEnter={(e) => { if (!sending) { e.currentTarget.style.background = "#252222"; playHover() } }}
                    onMouseLeave={(e) => { if (!sending) e.currentTarget.style.background = "#1a1818" }}
                    style={{
                      padding: "16px 18px",
                      background: "#1a1818",
                      color: "#ffffff",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      letterSpacing: "0.20em",
                      textTransform: "uppercase",
                      cursor: sending ? "not-allowed" : "pointer",
                      opacity: sending ? 0.6 : 1,
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      transition: "background 0.2s",
                    }}
                  >
                    {sending ? "Sending…" : "Send Report  →"}
                  </button>
                  {sendError && (
                    <div style={{
                      fontSize: 11,
                      color: "#ff7a6a",
                      marginTop: 2,
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                    }}>{sendError}</div>
                  )}
                </form>
              ) : (
                <div style={{
                  padding: "16px 18px",
                  background: "rgba(255, 69, 71, 0.12)",
                  border: "1px solid rgba(255, 69, 71, 0.30)",
                  borderRadius: 6,
                  textAlign: "center",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#fff",
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                }}>
                  ✓ Sent! Check your inbox
                </div>
              )}

              {/* Book a 15-min call — light pink CTA */}
              <a
                href={CALL_BOOKING_LINK}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => playSelect()}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#FFEFE6" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#FFD7CC" }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "16px 18px",
                  background: "#FFD7CC",
                  color: "#1a1818",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.20em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#1a1818",
                }} />
                Book a 15 min call
              </a>
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}

/* Individual diagnostic cell — icon + numbered label at top, body text at bottom.
   Designed as a borderless grid cell (parent grid draws the dividing lines). */
function ReportCell({ num, label, accent, iconBg, iconBorder, icon, text, isMobile, hasRightBorder }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
      }}
      style={{
        padding: isMobile ? "32px 24px" : "44px 36px",
        borderRight: hasRightBorder ? "1px solid rgba(255, 255, 255, 0.10)" : "none",
        borderBottom: isMobile ? "1px solid rgba(255, 255, 255, 0.10)" : "none",
        minHeight: isMobile ? 200 : 320,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 60,
        background: "#0F0F0F",
      }}
    >
      {/* Top row — icon + numbered label */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: iconBg,
          border: `1px solid ${iconBorder}`,
          display: "grid",
          placeItems: "center",
          color: accent,
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 500,
          color: accent,
          fontFamily: "'Geist Mono', ui-monospace, monospace",
        }}>
          {num} — {label}
        </div>
      </div>

      {/* Bottom — diagnostic text */}
      <p style={{
        margin: 0,
        fontSize: isMobile ? 14 : 15.5,
        lineHeight: 1.55,
        color: "rgba(255, 255, 255, 0.88)",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 400,
      }}>
        {text}
      </p>
    </motion.div>
  )
}

/* ─── ReportSection icons (inline SVG, currentColor = accent) ─── */
function WarningIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L22 20 L2 20 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 10 L12 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  )
}
function SqrtIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 14 L6.5 19 L12 5 L21 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function MoveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L12 21 M3 12 L21 12 M9 6 L12 3 L15 6 M9 18 L12 21 L15 18 M6 9 L3 12 L6 15 M18 9 L21 12 L18 15"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ---------------- HERO PARTICLES — ambient drifting dots (Section 1 background) ---------------- */
/* ---------------- IMMERSIVE BACKGROUND ----------------
   Multi-layer atmospheric backdrop for the hero section. Pure CSS + framer-motion,
   GPU-composited, no canvas. Sits at z-index 0 (deepest layer, behind the 3D canvas
   and particles). All layers use `pointer-events: none` so they never block interaction.

   Layer stack:
     1. Heartbeat halo — slow pulsing red glow behind the device area (sync to diagnostic vibe)
     2. Drifting plasma blobs — large soft red circles that wander very slowly (depth)
     3. Sonar pulse rings — concentric rings expanding from the device origin (scanner pings)
     4. Scanner sweep — thin red gradient bar slowly traversing top→bottom (futuristic detector)
*/
function ImmersiveBackground({ isMobile = false }) {
  return (
    <>
      {/* 1. Heartbeat halo — slow pulse synced to "diagnostic engine" theme */}
      <motion.div
        aria-hidden="true"
        animate={{
          opacity: [0.55, 1, 0.55],
          scale: [1, 1.08, 1],
        }}
        transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 45% 55% at 65% 50%, rgba(255, 69, 71, 0.28) 0%, transparent 60%)",
          transformOrigin: "65% 50%",
          pointerEvents: "none",
          zIndex: 0,
          willChange: "transform, opacity",
        }}
      />

      {/* 2a. Drifting plasma blob — upper-left, very slow wander */}
      {!isMobile && (
        <motion.div
          aria-hidden="true"
          animate={{
            x: ["-8%", "10%", "-8%"],
            y: ["-6%", "8%", "-6%"],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            width: "55vw",
            height: "60vh",
            top: "-12vh",
            left: "-12vw",
            background: "radial-gradient(circle, rgba(255, 69, 71, 0.10) 0%, transparent 60%)",
            filter: "blur(70px)",
            pointerEvents: "none",
            zIndex: 0,
            willChange: "transform",
          }}
        />
      )}

      {/* 2b. Drifting plasma blob — lower-right, counter-motion for depth */}
      {!isMobile && (
        <motion.div
          aria-hidden="true"
          animate={{
            x: ["8%", "-10%", "8%"],
            y: ["6%", "-10%", "6%"],
          }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            width: "50vw",
            height: "55vh",
            bottom: "-10vh",
            right: "-10vw",
            background: "radial-gradient(circle, rgba(255, 110, 80, 0.08) 0%, transparent 60%)",
            filter: "blur(60px)",
            pointerEvents: "none",
            zIndex: 0,
            willChange: "transform",
          }}
        />
      )}

      {/* 3a. Sonar pulse ring — scanner ping expanding from device area */}
      <motion.div
        aria-hidden="true"
        animate={{
          scale: [0.35, 1.5],
          opacity: [0, 0.35, 0],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeOut",
          times: [0, 0.15, 1],
        }}
        style={{
          position: "absolute",
          top: "50%",
          left: "65%",
          width: 720,
          height: 720,
          marginLeft: -360,
          marginTop: -360,
          borderRadius: "50%",
          border: "1px solid rgba(255, 69, 71, 0.35)",
          pointerEvents: "none",
          zIndex: 0,
          willChange: "transform, opacity",
        }}
      />

      {/* 3b. Second sonar ring — staggered 2.5s for continuous "pulsing detector" feel */}
      <motion.div
        aria-hidden="true"
        animate={{
          scale: [0.35, 1.5],
          opacity: [0, 0.25, 0],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeOut",
          delay: 2.5,
          times: [0, 0.15, 1],
        }}
        style={{
          position: "absolute",
          top: "50%",
          left: "65%",
          width: 720,
          height: 720,
          marginLeft: -360,
          marginTop: -360,
          borderRadius: "50%",
          border: "1px solid rgba(255, 110, 80, 0.28)",
          pointerEvents: "none",
          zIndex: 0,
          willChange: "transform, opacity",
        }}
      />

      {/* 4. Scanner sweep — vertical bar slowly traversing top→bottom */}
      <motion.div
        aria-hidden="true"
        initial={{ y: "-50%" }}
        animate={{ y: "150%" }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "28vh",
          background: "linear-gradient(to bottom, transparent 0%, rgba(255, 69, 71, 0.035) 40%, rgba(255, 69, 71, 0.06) 50%, rgba(255, 69, 71, 0.035) 60%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 0,
          willChange: "transform",
        }}
      />

      {/* 5. God-ray volumetric beam — descending from top-right, mimics overhead spotlight */}
      {!isMobile && (
        <motion.div
          aria-hidden="true"
          animate={{ opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: -60,
            right: "10%",
            width: 320,
            height: "130vh",
            background: "linear-gradient(180deg, rgba(255, 130, 110, 0.13) 0%, rgba(255, 69, 71, 0.05) 45%, transparent 100%)",
            transform: "rotate(14deg) skew(-6deg)",
            transformOrigin: "top center",
            filter: "blur(30px)",
            mixBlendMode: "screen",
            pointerEvents: "none",
            zIndex: 0,
            willChange: "opacity",
          }}
        />
      )}

      {/* 6. Second god-ray — opposite side, slimmer, gives asymmetric volumetric depth */}
      {!isMobile && (
        <motion.div
          aria-hidden="true"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          style={{
            position: "absolute",
            top: -50,
            left: "18%",
            width: 220,
            height: "110vh",
            background: "linear-gradient(180deg, rgba(255, 90, 90, 0.10) 0%, transparent 75%)",
            transform: "rotate(-16deg)",
            transformOrigin: "top center",
            filter: "blur(34px)",
            mixBlendMode: "screen",
            pointerEvents: "none",
            zIndex: 0,
            willChange: "opacity",
          }}
        />
      )}

      {/* 7. Perspective grid floor — futuristic studio chamber floor receding to horizon */}
      {!isMobile && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: "-10%",
            right: "-10%",
            height: "32vh",
            background: `
              linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 30%, transparent 75%),
              repeating-linear-gradient(0deg, transparent 0px, transparent 42px, rgba(255, 69, 71, 0.20) 42px, rgba(255, 69, 71, 0.20) 43px),
              repeating-linear-gradient(90deg, transparent 0px, transparent 64px, rgba(255, 69, 71, 0.13) 64px, rgba(255, 69, 71, 0.13) 65px)
            `,
            transform: "perspective(380px) rotateX(62deg)",
            transformOrigin: "bottom center",
            pointerEvents: "none",
            zIndex: 0,
            opacity: 0.5,
            maskImage: "radial-gradient(ellipse 80% 100% at 50% 100%, #000 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 100% at 50% 100%, #000 30%, transparent 80%)",
          }}
        />
      )}

      {/* 8. Lens flare horizontal streak — bright thin band cutting through device area */}
      <motion.div
        aria-hidden="true"
        animate={{
          opacity: [0.25, 0.55, 0.25],
          scaleX: [0.92, 1.08, 0.92],
        }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          top: "50%",
          left: "15%",
          right: "5%",
          height: 2,
          transform: "translateY(-50%)",
          background: "linear-gradient(90deg, transparent 0%, rgba(255, 110, 80, 0) 10%, rgba(255, 130, 110, 0.55) 50%, rgba(255, 69, 71, 0) 90%, transparent 100%)",
          filter: "blur(2px)",
          mixBlendMode: "screen",
          pointerEvents: "none",
          zIndex: 0,
          willChange: "transform, opacity",
        }}
      />

      {/* 9. Periodic energy streak — bright horizontal pulse races across at intervals */}
      {!isMobile && (
        <motion.div
          aria-hidden="true"
          animate={{
            opacity: [0, 0, 0.85, 0.85, 0],
            x: ["-25%", "-25%", "25%", "85%", "125%"],
          }}
          transition={{
            duration: 8.5,
            times: [0, 0.78, 0.83, 0.88, 0.93],
            repeat: Infinity,
            ease: "linear",
          }}
          style={{
            position: "absolute",
            top: "32%",
            left: 0,
            width: "120%",
            height: 1.5,
            background: "linear-gradient(90deg, transparent 0%, rgba(255, 130, 110, 0.85) 50%, transparent 100%)",
            filter: "blur(1.8px)",
            mixBlendMode: "screen",
            pointerEvents: "none",
            zIndex: 0,
            willChange: "transform, opacity",
          }}
        />
      )}

      {/* 10. Second energy streak — offset timing + opposite vertical position for variety */}
      {!isMobile && (
        <motion.div
          aria-hidden="true"
          animate={{
            opacity: [0, 0, 0.7, 0.7, 0],
            x: ["125%", "125%", "75%", "15%", "-25%"],
          }}
          transition={{
            duration: 11,
            times: [0, 0.85, 0.89, 0.93, 0.98],
            repeat: Infinity,
            ease: "linear",
            delay: 4,
          }}
          style={{
            position: "absolute",
            top: "68%",
            left: 0,
            width: "120%",
            height: 1.2,
            background: "linear-gradient(90deg, transparent 0%, rgba(255, 90, 90, 0.7) 50%, transparent 100%)",
            filter: "blur(1.6px)",
            mixBlendMode: "screen",
            pointerEvents: "none",
            zIndex: 0,
            willChange: "transform, opacity",
          }}
        />
      )}

      {/* 11. Core emission point — small bright glow at device origin (lens flare focal) */}
      <motion.div
        aria-hidden="true"
        animate={{
          opacity: [0.4, 0.85, 0.4],
          scale: [0.85, 1.15, 0.85],
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          top: "50%",
          left: "65%",
          width: 180,
          height: 180,
          marginLeft: -90,
          marginTop: -90,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255, 130, 110, 0.35) 0%, rgba(255, 69, 71, 0.15) 30%, transparent 70%)",
          filter: "blur(20px)",
          mixBlendMode: "screen",
          pointerEvents: "none",
          zIndex: 0,
          willChange: "transform, opacity",
        }}
      />
    </>
  )
}

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
            background: "#FF4547",
            boxShadow: `0 0 ${p.size * 3}px rgba(255, 69, 71, 0.7)`,
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
  // Responsive breakpoint
  const isMobile = useIsMobile()

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
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)

  // Spin trigger for INPUT device
  const inputSpinRef = useRef(null)
  const outputSectionRef = useRef(null)
  const servicesSectionRef = useRef(null)

  // Hero bg video transition — controls the cinematic submit → video → report flow.
  // Phases: 'idle' (quiz active, video paused on poster frame)
  //         'playing' (hero faded out, video playing through)
  //         'ended' (video finished, report visible in same hero area)
  const [videoPhase, setVideoPhase] = useState("idle")
  const heroVideoRef = useRef(null)

  // Increment to force a fresh QuizUI mount (clears internal step state)
  const [quizKey, setQuizKey] = useState(0)

  // Tracks whether the user has actively started answering — used to lock body scroll
  // until they submit (or reset). Initial page load = unlocked, all sections scrollable.
  const [quizStarted, setQuizStarted] = useState(false)
  const handleQuizStart = useCallback(() => setQuizStarted(true), [])

  // ── Tracked async resources — cleared on unmount or on cancel-prone actions ───────
  // Holds all pending setTimeout IDs so we can clear them on unmount / Reset / Skip.
  const pendingTimersRef = useRef(new Set())
  // Holds the cancel function returned by smoothScrollToElement so we can abort scrolls.
  const pendingScrollRef = useRef(null)
  // AbortController for in-flight generate fetch — Reset can cancel it.
  const generateAbortRef = useRef(null)
  // AbortController for in-flight send-email fetch.
  const sendEmailAbortRef = useRef(null)
  // True dedupe for double-clicks — closure-based `sending` check has a race.
  const sendingRef = useRef(false)
  // Tracks whether the component is still mounted (set false on unmount).
  const isMountedRef = useRef(true)

  // Helper to schedule a tracked timeout (auto-cleaned)
  const scheduleTimeout = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      pendingTimersRef.current.delete(id)
      if (isMountedRef.current) fn()
    }, ms)
    pendingTimersRef.current.add(id)
    return id
  }, [])

  // Helper to start a tracked smooth scroll (auto-cancels previous in-flight scroll)
  const startScroll = useCallback((targetGetter, opts) => {
    if (pendingScrollRef.current) pendingScrollRef.current()   // cancel any in-flight scroll
    pendingScrollRef.current = smoothScrollToElement(targetGetter, opts)
  }, [])

  // Skip diagnosis — unlocks scroll + cinematic-scrolls user past the hero to services.
  const handleSkipDiagnosis = useCallback(() => {
    playSelect()
    setQuizStarted(false)   // unlocks body scroll
    // Tiny delay so the overflow unlock has applied before scroll fires
    scheduleTimeout(() => {
      startScroll(() => servicesSectionRef.current, {
        delay: 0,
        duration: 1800,
      })
    }, 80)
  }, [scheduleTimeout, startScroll])

  // 🔒 Body scroll behavior:
  //   • Initial load                    → UNLOCKED (user can browse all sections freely)
  //   • User starts answering quiz      → LOCKED (must submit to unlock again)
  //   • User submits (showResult=true)  → UNLOCKED again
  useEffect(() => {
    if (quizStarted && !showResult) {
      document.body.style.overflowY = "hidden"
    } else {
      document.body.style.overflowY = "auto"
    }
    return () => {
      // On unmount, restore default so we don't leave the body in a locked state.
      document.body.style.overflowY = ""
    }
  }, [quizStarted, showResult])

  // ── Single unmount cleanup — clears every tracked timer, scroll, fetch ────────────
  // IMPORTANT: re-mark as mounted on every effect run because React strict mode
  // mounts → unmounts → re-mounts in dev. The cleanup sets isMountedRef=false during
  // the strict-mode unmount, but the ref persists across the re-mount. We must
  // explicitly set it back to true here so async state updates work after re-mount.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      pendingTimersRef.current.forEach((id) => clearTimeout(id))
      pendingTimersRef.current.clear()
      if (pendingScrollRef.current) pendingScrollRef.current()
      if (generateAbortRef.current) generateAbortRef.current.abort()
      if (sendEmailAbortRef.current) sendEmailAbortRef.current.abort()
    }
  }, [])

  // ── Watchdog: force-clear stuck loading state after 50s no matter what.
  // Belt-and-suspenders backup for the 45s fetch-abort — if anything else jams,
  // user still gets unstuck instead of staring at a frozen spinner forever.
  useEffect(() => {
    if (!loading) return
    const wd = setTimeout(() => {
      console.warn("[watchdog] loading stuck >50s — force-clearing")
      setLoading(false)
      if (!report && !error) setError("Request timed out. Please try again.")
    }, 50000)
    return () => clearTimeout(wd)
  }, [loading, report, error])

  const handleGenerate = useCallback(async (answers) => {
    setLastAnswers(answers)
    setLoading(true)
    setError(null)
    setReport(null)
    setSent(false)
    setContact({ name: "", email: "" })

    // 🎬 NEW FLOW — no scroll. Instead:
    // 1) Wait for the device spin animation (~1.6s) + brief pause so the "REPORT TRANSMITTED"
    //    screen is visible for a beat
    // 2) Trigger hero fade-out (CSS, 0.7s) + start playing the bg video
    // 3) Video onEnded handler sets showResult=true → report appears in the hero area
    scheduleTimeout(() => {
      setVideoPhase("playing")
      const v = heroVideoRef.current
      if (v) {
        try { v.currentTime = 1.5 } catch { /* ignore */ }   // Skip the first 1.5s
        v.playbackRate = 1   // Natural speed — smoothest playback, no rate-change buffering
        v.play().catch(() => {
          // Autoplay blocked or video missing — skip straight to report
          setVideoPhase("ended")
          setShowResult(true)
        })
      } else {
        // Video element missing — fall back to immediate report
        setVideoPhase("ended")
        setShowResult(true)
      }
    }, 1800)

    // 45s timeout-with-abort, tracked so Reset/unmount cancels in-flight request
    const controller = new AbortController()
    generateAbortRef.current = controller
    const timeoutId = scheduleTimeout(() => controller.abort(), 45000)

    try {
      console.log("[generate] POST /api/generate")
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      pendingTimersRef.current.delete(timeoutId)
      console.log("[generate] response:", res.status, res.headers.get("content-type"))

      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        throw new Error(`Server didn't return JSON. Are you running 'vercel dev'?`)
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      console.log("[generate] ✓ report received")
      if (isMountedRef.current && generateAbortRef.current === controller) {
        setReport(json.report)
      }
    } catch (e) {
      // Ignore abort — caller (Reset/unmount) is intentionally cancelling.
      if (e?.name === "AbortError") {
        console.log("[generate] aborted")
        return
      }
      console.error("[generate] ✗", e?.message)
      if (isMountedRef.current && generateAbortRef.current === controller) {
        setError(e?.message || "Something went wrong")
      }
    } finally {
      // Always clear loading, regardless of mount state or token match — prevents
      // the spinner from getting stuck if the controller/ref got swapped mid-flight.
      setLoading(false)
      if (generateAbortRef.current === controller) {
        generateAbortRef.current = null
      }
    }
  }, [scheduleTimeout])

  // Bg video time-update — fires every frame the video plays.
  // When there are 5 seconds left, trigger the report reveal (scale-in animation).
  const handleVideoTimeUpdate = useCallback(() => {
    const v = heroVideoRef.current
    if (!v || !v.duration || isNaN(v.duration)) return
    const remaining = v.duration - v.currentTime
    if (remaining <= 5 && !showResult) {
      setShowResult(true)
    }
  }, [showResult])

  // Bg video onEnded handler — finalizes the hero → report transition.
  const handleVideoEnded = useCallback(() => {
    setVideoPhase("ended")
    if (!showResult) setShowResult(true)   // safety in case timeupdate didn't fire
  }, [showResult])

  const handleRetry = useCallback(() => {
    if (lastAnswers) handleGenerate(lastAnswers)
  }, [lastAnswers, handleGenerate])

  const handleReset = useCallback(() => {
    playSelect()
    // Cancel in-flight fetches so they can't restore stale state after reset
    if (generateAbortRef.current) {
      generateAbortRef.current.abort()
      generateAbortRef.current = null
    }
    if (sendEmailAbortRef.current) {
      sendEmailAbortRef.current.abort()
      sendEmailAbortRef.current = null
    }
    sendingRef.current = false

    // ── PHASE 1: trigger report exit animation immediately ──
    // AnimatePresence plays the scale-down + fade-out (~0.55s).
    // videoPhase stays at 'ended' here so hero remains faded BEHIND the report
    // during exit — prevents "hero peeks through" flash.
    setShowResult(false)

    // ── PHASE 2: after report exit completes, restore hero state ──
    scheduleTimeout(() => {
      if (heroVideoRef.current) {
        heroVideoRef.current.pause()
        try { heroVideoRef.current.currentTime = 1.5 } catch { /* ignore */ }
        heroVideoRef.current.playbackRate = 1
      }
      setVideoPhase("idle")    // now safe — report is gone, hero fades back in
      setReport(null)
      setLoading(false)
      setError(null)
      setLastAnswers(null)
      setContact({ name: "", email: "" })
      setSent(false)
      setSending(false)
      setSendError(null)
      setQuizStarted(false)      // clear quiz-in-progress flag → unlocks scroll
      setQuizKey((k) => k + 1)   // remount QuizUI → resets to step 1
    }, 650)   // ← exit animation 0.55s + small buffer
  }, [scheduleTimeout])

  const handleSendEmail = useCallback(async (e) => {
    e?.preventDefault?.()
    if (!contact.email.trim() || !report) return
    // Ref-based dedupe — closure-captured `sending` can fail under fast double-clicks
    if (sendingRef.current) return
    sendingRef.current = true
    playSelect()
    setSending(true)
    setSendError(null)

    // 30s timeout + abort, tracked for cleanup
    const controller = new AbortController()
    sendEmailAbortRef.current = controller
    const timeoutId = scheduleTimeout(() => controller.abort(), 30000)

    try {
      const res = await fetch("/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contact.email.trim(),
          name: (contact.name || "").trim() || "there",
          report,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      pendingTimersRef.current.delete(timeoutId)
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      if (!isMountedRef.current || sendEmailAbortRef.current !== controller) return
      setSent(true)

      // 🎉 Success popup — show, then hide report section after popup auto-dismisses
      setShowSuccessPopup(true)
      scheduleTimeout(() => {
        setShowSuccessPopup(false)
        // Wait for popup fade-out before hiding report section + resetting state
        scheduleTimeout(() => {
          setShowResult(false)
          setReport(null)
          setSent(false)
          setContact({ name: "", email: "" })
          setSendError(null)
          setQuizStarted(false)
          setQuizKey((k) => k + 1)
          // Reset bg video + phase so hero returns to quiz state.
          // Rewind to 2s skip-point so paused poster frame matches.
          if (heroVideoRef.current) {
            heroVideoRef.current.pause()
            try { heroVideoRef.current.currentTime = 2 } catch { /* ignore */ }
          }
          setVideoPhase("idle")
        }, 600)
      }, 3500)
    } catch (err) {
      if (err?.name === "AbortError") return   // intentional cancel
      if (isMountedRef.current && sendEmailAbortRef.current === controller) {
        setSendError(err?.name === "AbortError" ? "Request timed out" : (err?.message || "Failed to send"))
      }
    } finally {
      sendingRef.current = false
      // Always clear sending so the button can't get stuck disabled
      setSending(false)
      if (sendEmailAbortRef.current === controller) {
        sendEmailAbortRef.current = null
      }
    }
  }, [contact, report, scheduleTimeout, startScroll])

  const canvasGl = {
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.15,
    antialias: true,
  }

  return (
    <>
      {/* Success popup — overlays everything when report is sent */}
      <ReportSentPopup visible={showSuccessPopup} />

      {/* === MUSIC_TOGGLE: disabled — restore with "restore music toggle" === */}
      {/* <MusicToggle /> */}

      {/* SECTION 1: INPUT device (always visible at top).
          Class `hero-fading` triggers a CSS fade-out of all hero content (except the bg video). */}
      <section className={`scene-section is-input${videoPhase !== "idle" ? " hero-fading" : ""}`}>
        {/* Bg video — paused on poster frame during quiz, plays through on submit,
            after onEnded the hero transitions to the report state in-place. */}
        <video
          ref={heroVideoRef}
          src="/bg/bg-video.mp4"
          /* No poster image — section background-color shows briefly during video load,
             then the video's own 2s frame appears (set via onLoadedMetadata). */
          muted
          playsInline
          preload="auto"
          onEnded={handleVideoEnded}
          onTimeUpdate={handleVideoTimeUpdate}
          /* Seek to the 2-second mark as soon as the video's metadata loads — so
             the paused frame shown in the hero is from that point, not the very start. */
          onLoadedMetadata={(e) => {
            try { e.currentTarget.currentTime = 1.5 } catch { /* ignore */ }
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center center",
            zIndex: 0,
            pointerEvents: "none",
          }}
        />

        {/* === HERO_BG_EFFECTS: ImmersiveBackground + HeroParticles — restore with "restore hero bg effects" === */}
        {/* <ImmersiveBackground isMobile={isMobile} /> */}
        {/* <HeroParticles count={isMobile ? 10 : 22} /> */}
        {/* Canvas wrapper — device locked to RIGHT side on desktop (heading occupies left).
            Mobile: stays centered. No animation, fixed position. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            transform: isMobile ? "translateX(0)" : "translateX(28%)",
          }}
        >
          <Canvas
            camera={{
              // Mobile: balanced distance + FOV so the device fills the viewport without cropping
              position: isMobile ? [0, 0.05, 3.0] : [0.7, 0.35, 2.5],
              fov: isMobile ? 50 : 38,
            }}
            gl={canvasGl}
            dpr={isMobile ? [1, 1.5] : [1, 2]}
            style={{ touchAction: "none" }}
          >
            <InputScene
              onGenerate={handleGenerate}
              onStart={handleQuizStart}
              loading={loading}
              spinRef={inputSpinRef}
              quizKey={quizKey}
              isMobile={isMobile}
            />
          </Canvas>
        </div>

        {/* ─── HERO OVERLAYS (text + brand pill on top of the 3D canvas) ─── */}

        {/* === TOP_LEFT_LOGO: disabled — restore with "restore top left logo" === */}
        {/*
        <motion.img
          src="/logo/logo.png"
          alt="BrandHero"
          initial={{ opacity: 0, y: -12, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "absolute",
            top: "clamp(10px, 1.5vh, 22px)",
            left: "clamp(10px, 1.5vw, 28px)",
            width: "clamp(64px, 8vw, 130px)",
            height: "clamp(64px, 8vw, 130px)",
            objectFit: "contain",
            zIndex: 10,
            pointerEvents: "none",
            display: "block",
          }}
        />
        */}

        {/* === HERO_BG_EFFECTS: HUD corner brackets — restore with "restore hero bg effects" === */}
        {/*
        {!isMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.6 }}
              style={{
                position: "absolute",
                top: 22,
                left: 22,
                width: 28,
                height: 28,
                borderTop: "1px solid rgba(255, 69, 71, 0.55)",
                borderLeft: "1px solid rgba(255, 69, 71, 0.55)",
                boxShadow: "inset 1px 1px 8px rgba(255, 69, 71, 0.12)",
                zIndex: 5,
                pointerEvents: "none",
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.6 }}
              style={{
                position: "absolute",
                top: 22,
                right: 22,
                width: 28,
                height: 28,
                borderTop: "1px solid rgba(255, 69, 71, 0.55)",
                borderRight: "1px solid rgba(255, 69, 71, 0.55)",
                boxShadow: "inset -1px 1px 8px rgba(255, 69, 71, 0.12)",
                zIndex: 5,
                pointerEvents: "none",
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.75 }}
              style={{
                position: "absolute",
                bottom: 22,
                left: 22,
                width: 28,
                height: 28,
                borderBottom: "1px solid rgba(255, 69, 71, 0.55)",
                borderLeft: "1px solid rgba(255, 69, 71, 0.55)",
                boxShadow: "inset 1px -1px 8px rgba(255, 69, 71, 0.12)",
                zIndex: 5,
                pointerEvents: "none",
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.75 }}
              style={{
                position: "absolute",
                bottom: 22,
                right: 22,
                width: 28,
                height: 28,
                borderBottom: "1px solid rgba(255, 69, 71, 0.55)",
                borderRight: "1px solid rgba(255, 69, 71, 0.55)",
                boxShadow: "inset -1px -1px 8px rgba(255, 69, 71, 0.12)",
                zIndex: 5,
                pointerEvents: "none",
              }}
            />
          </>
        )}
        */}

        {/* Skip + Reset pills — only visible while quiz is in progress (before report) */}
        <AnimatePresence>
          {quizStarted && !showResult && (
            <motion.div
              key="quiz-controls"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute",
                bottom: isMobile ? 18 : 32,
                // Mobile: centered horizontally. Desktop: align under the device (right-shifted canvas).
                left: isMobile ? "50%" : "auto",
                right: isMobile ? "auto" : "10%",
                transform: isMobile ? "translateX(-50%)" : "none",
                zIndex: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {/* Reset — restart quiz from Q1 */}
              <button
                onClick={handleReset}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(230, 61, 43, 0.18)"
                  e.currentTarget.style.borderColor = "rgba(230, 61, 43, 0.5)"
                  e.currentTarget.style.color = "#ffffff"
                  playHover()
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)"
                  e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)"
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: isMobile ? "7px 12px" : "9px 14px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderRadius: 999,
                  fontSize: isMobile ? 10 : 11,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: 500,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255, 255, 255, 0.7)",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s, border-color 0.2s",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Reset
              </button>

              {/* Skip — jump straight to services section */}
              <button
                onClick={handleSkipDiagnosis}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)"
                  e.currentTarget.style.color = "#ffffff"
                  playHover()
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"
                  e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)"
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: isMobile ? "7px 14px" : "9px 18px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderRadius: 999,
                  fontSize: isMobile ? 10 : 11,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: 500,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255, 255, 255, 0.7)",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s, border-color 0.2s",
                }}
              >
                Skip
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Headline — mobile: TOP. Desktop: vertically centered, lifted with clamp() so
            it never falls off-screen on short laptops while still feeling centered on big monitors. */}
        <motion.div
          initial={false}
          animate={{ y: 0 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "absolute",
            top: isMobile ? "max(70px, env(safe-area-inset-top, 0px) + 60px)" : "50%",
            bottom: "auto",
            transform: isMobile ? "none" : "translateY(calc(-50% - clamp(80px, 14vh, 200px)))",
            left: isMobile ? "clamp(16px, 3vw, 48px)" : "clamp(48px, 9vw, 140px)",
            right: isMobile ? "clamp(16px, 3vw, 48px)" : "auto",
            zIndex: 10,
            maxWidth: isMobile ? "calc(100% - clamp(32px, 6vw, 96px))" : "min(55%, 720px)",
            pointerEvents: "none",
            textAlign: "left",
          }}
        >
          {/* Top tag — clean red uppercase label, sits above the headline (matches reference pattern) */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{
              marginBottom: isMobile ? 12 : 18,
              fontSize: isMobile ? 10 : 11,
              color: "#FF4547",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 500,
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{
              display: "inline-block",
              width: 24,
              height: 1,
              background: "#FF4547",
              boxShadow: "0 0 8px rgba(255, 69, 71, 0.8)",
            }} />
            Answer to discover
          </motion.div>

          <AnimatedHeadline />

          {/* Subheading — desktop: directly below headline. Mobile: rendered separately at bottom. */}
          {!isMobile && (
            <div style={{ marginTop: 18, maxWidth: 460 }}>
              <AnimatedTagline
                text="Every great brand has a turning point. Diagnose what's holding yours back, get a custom strategy, and rise faster than the ones you're competing against."
                delay={0.5}
                style={{
                  fontSize: 16,
                  color: "rgba(255, 255, 255, 0.65)",
                  lineHeight: 1.55,
                  fontWeight: 400,
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              />
            </div>
          )}

          {/* ─── DIAGNOSIS ENGINE status badge — desktop only (mobile renders it below in its own block) ─── */}
          {!isMobile && <DiagnosisEngineBadge isMobile={false} />}
        </motion.div>

        {/* Mobile-only subheading + badge — sits directly below the device, center-aligned */}
        {isMobile && (
          <div style={{
            position: "absolute",
            bottom: 24,
            left: 20,
            right: 20,
            zIndex: 10,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}>
            <AnimatedTagline
              text="Every great brand has a turning point. Diagnose what's holding yours back, get a custom strategy, and rise faster than the ones you're competing against."
              delay={0.5}
              style={{
                fontSize: 14,
                color: "rgba(255, 255, 255, 0.65)",
                lineHeight: 1.55,
                fontWeight: 400,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            />
            <DiagnosisEngineBadge isMobile={true} />
          </div>
        )}

        {/* Report overlay — appears INSIDE the hero section starting ~5s before video ends.
            Scales from 0 → 100% over 2s on enter. On Reset, smoothly fades + scales down
            (exit animation) before hero re-appears underneath. */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              key="report-overlay"
              className="hero-report-overlay"
              ref={outputSectionRef}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{
                scale: 0.92,
                opacity: 0,
                transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
              }}
              transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                overflowY: "auto",
                background: "transparent",
                transformOrigin: "center center",
              }}
            >
              <ReportSection
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
                isMobile={isMobile}
                onReset={handleReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* SECTION 3 & 4 — TEMPORARILY DISABLED (perf: heavy images on initial load).
          To re-enable, uncomment the blocks below. */}
      {/*
      <section className="services-wrap is-services" ref={servicesSectionRef}>
        <ServicesSection />
      </section>

      <section className="services-wrap is-stories">
        <SuccessStoriesSection />
      </section>
      */}
    </>
  )
}

/* ---------------- PRELOAD ---------------- */
useGLTF.preload("/models/untitled.glb")