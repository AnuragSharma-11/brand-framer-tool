import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Html, useGLTF, Center } from "@react-three/drei"
import { Suspense, useEffect, useState } from "react"

/* ---------------- QUIZ UI ---------------- */
function QuizUI() {
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
      return "🚀 AI Automation System"
    }
    if (data.goal === "Sales") {
      return "💰 Conversion Optimization"
    }
    return "📊 Growth Strategy"
  }

  return (
    <div style={{
      width: 248,
      height: 278,
      background: "#0f172a",
      color: "white",
      padding: 12,
      borderRadius: 12,
      fontSize: 12
    }}>
      <h4>Step {step}</h4>

      {step === 1 && (
        <>
          <button onClick={() => handleSelect("industry", "Tech")}>Tech</button>
          <button onClick={() => handleSelect("industry", "Health")}>Health</button>
        </>
      )}

      {step === 2 && (
        <>
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
          <button onClick={() => handleSelect("goal", "Sales")}>Sales</button>
          <button onClick={() => handleSelect("goal", "Automation")}>Automation</button>
        </>
      )}

      {step === 4 && (
        <>
          <button onClick={() => handleSelect("budget", "Low")}>Low</button>
          <button onClick={() => handleSelect("budget", "High")}>High</button>
        </>
      )}

      {step === 5 && <p>{getResult()}</p>}
    </div>
  )
}

/* ---------------- MODEL ---------------- */
const QUIZ_UI_W = 260
const QUIZ_UI_H = 360
const SCREEN_FILL = 50   // 👈 isko badhao: 1 = exact fit, 2 = 2x bada, 5 = 5x, etc.

function Model() {
  const { scene } = useGLTF("/models/model.glb")
  const [info, setInfo] = useState(null)

  useEffect(() => {
    // ensure scene.scale (from <primitive scale={...}>) is reflected in world matrices
    scene.updateMatrixWorld(true)

    const modelBox = new THREE.Box3().setFromObject(scene)
    const modelCenter = new THREE.Vector3()
    modelBox.getCenter(modelCenter)

    let screenMesh = null

    scene.traverse((obj) => {
      if (obj.isMesh) {
        console.log("Mesh:", obj.name)

        const name = obj.name.toLowerCase()

        // 🔥 auto detect
        if (!screenMesh && (
          name.includes("screen") ||
          name.includes("display") ||
          name.includes("glass") ||
          name.includes("panel")
        )) {
          screenMesh = obj
        }
      }
    })

    let size = new THREE.Vector3()
    let center = new THREE.Vector3()

    if (screenMesh) {
      const box = new THREE.Box3().setFromObject(screenMesh)
      box.getSize(size)
      box.getCenter(center)
    } else {
      const fallback = new THREE.Box3().setFromObject(scene)
      fallback.getSize(size)
      fallback.getCenter(center)

      size.multiplyScalar(0.6)
    }

    const offset = new THREE.Vector3().subVectors(center, modelCenter)

    console.log("SCREEN:", screenMesh?.name)
    console.log("SIZE:", size.toArray())
    console.log("OFFSET:", offset.toArray())

    setInfo({ size, offset })
  }, [scene])

  return (
    <group>
      <Center>
        <primitive object={scene} scale={1.8} />
      </Center>

      {info && (
        <Html
          transform
          position={[
            info.offset.x,
            info.offset.y + 0.27,
            info.offset.z + info.size.z / 2 + 0.02,
          ]}
          scale={Math.min(
            info.size.x / QUIZ_UI_W,
            info.size.y / QUIZ_UI_H
          ) * SCREEN_FILL}
        >
          <QuizUI />
        </Html>
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

/* ---------------- SCENE ---------------- */
function Scene() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 5, 5]} intensity={2} />
      <directionalLight position={[-5, 5, 5]} intensity={1} />

      <Suspense fallback={<FallbackBox />}>
        <Model />
      </Suspense>

      <OrbitControls />
    </>
  )
}

/* ---------------- APP ---------------- */
export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
      <Scene />
    </Canvas>
  )
}

/* ---------------- PRELOAD ---------------- */
useGLTF.preload("/models/model.glb")