import { useState } from "react"

export default function App() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState({
    industry: "",
    website: "",
    goal: "",
    budget: "",
  })

  const next = () => setStep((s) => s + 1)

  const handleSelect = (key, value) => {
    setData((d) => ({ ...d, [key]: value }))
    next()
  }

  const getResult = () => {
    if (data.goal === "Automation" && data.budget === "High") {
      return "🚀 You need AI Automation System"
    }
    if (data.goal === "Sales") {
      return "💰 You need Conversion Optimization"
    }
    return "📊 You need Growth Strategy"
  }

  return (
    <div style={{ padding: 20, color: "#fff", background: "#0f172a", height: "100vh" }}>

      {step === 1 && (
        <>
          <h2>What is your industry?</h2>
          <button onClick={() => handleSelect("industry", "Technology")}>Technology</button>
          <button onClick={() => handleSelect("industry", "Healthcare")}>Healthcare</button>
        </>
      )}

      {step === 2 && (
        <>
          <h2>Enter your website</h2>
          <input
            placeholder="https://"
            onChange={(e) =>
              setData((d) => ({ ...d, website: e.target.value }))
            }
          />
          <button onClick={next}>Next</button>
        </>
      )}

      {step === 3 && (
        <>
          <h2>Your goal?</h2>
          <button onClick={() => handleSelect("goal", "Sales")}>Sales</button>
          <button onClick={() => handleSelect("goal", "Automation")}>Automation</button>
        </>
      )}

      {step === 4 && (
        <>
          <h2>Your budget?</h2>
          <button onClick={() => handleSelect("budget", "Low")}>Low</button>
          <button onClick={() => handleSelect("budget", "High")}>High</button>
        </>
      )}

      {step === 5 && (
        <>
          <h2>Result</h2>
          <p>{getResult()}</p>
        </>
      )}
    </div>
  )
}