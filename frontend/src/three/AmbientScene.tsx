import { useEffect, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { atmospheres, type AtmosphereId } from '../experience/atmospheres'
import { DustField } from './Atmosphere'
import { createEnv, damp, type Env } from './env'
import { MoonlitWorld } from './Moonlit'

/**
 * Persistent moonlit backdrop (lazy-loaded). One scene for the whole app; each
 * page selects a preset and the environment eases toward it.
 * Renders on demand at ~30 fps, pauses while the tab is hidden, and holds a
 * single static frame when reduced motion is requested.
 */

interface AmbientSceneProps {
  atmosphere: AtmosphereId
  reducedMotion: boolean
  lowPower: boolean
}

const AMBIENT_FPS = 30

function Ticker({ active, wakeKey }: { active: boolean; wakeKey: string }) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    invalidate()
    if (!active) {
      // A few extra frames so the static frame settles after a preset change.
      const ids = [60, 160, 320].map((ms) => window.setTimeout(() => invalidate(), ms))
      return () => ids.forEach((id) => window.clearTimeout(id))
    }
    const id = window.setInterval(() => {
      if (!document.hidden) invalidate()
    }, 1000 / AMBIENT_FPS)
    return () => window.clearInterval(id)
  }, [active, invalidate, wakeKey])

  return null
}

function Director({ env, atmosphere, reducedMotion }: { env: RefObject<Env>; atmosphere: AtmosphereId; reducedMotion: boolean }) {
  const pointer = useRef({ x: 0, y: 0 })
  const fadeIn = useRef(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (reducedMotion) return
    const onMove = (event: PointerEvent) => {
      pointer.current.x = event.clientX / window.innerWidth - 0.5
      pointer.current.y = event.clientY / window.innerHeight - 0.5
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reducedMotion])

  useFrame((state, rawDelta) => {
    const e = env.current
    const p = atmospheres[atmosphere].scene
    const delta = Math.min(rawDelta, 0.1)
    // Reduced motion: snap to the preset and freeze time-based motion.
    const approach = (current: number, target: number, rate = 1.6) =>
      reducedMotion ? target : damp(current, target, rate, delta)

    e.speed = reducedMotion ? 0 : 1
    // Start mid-drift so the clouds are already composed on first paint.
    e.time = reducedMotion ? 40 : 40 + state.clock.elapsedTime
    fadeIn.current = reducedMotion ? 1 : Math.min(1, fadeIn.current + delta / 1.6)
    e.reveal = fadeIn.current
    e.dust = approach(e.dust, p.motes)
    e.embers = 0
    e.clouds = approach(e.clouds, p.clouds, 0.8)
    e.groundFog = approach(e.groundFog, p.groundFog, 0.8)
    e.exposure = approach(e.exposure, p.exposure, 1.2)
    e.moon.set(approach(e.moon.x, p.moon[0], 0.9), approach(e.moon.y, p.moon[1], 0.9))

    const camera = state.camera
    camera.position.x = approach(camera.position.x, p.cameraX + pointer.current.x * 0.8)
    camera.position.y = approach(camera.position.y, 0.6 - pointer.current.y * 0.25)
    camera.lookAt(camera.position.x * 0.5, 6, -40)
  })

  return null
}

export default function AmbientScene({ atmosphere, reducedMotion, lowPower }: AmbientSceneProps) {
  const env = useRef<Env>(createEnv())

  return (
    <Canvas
      className="nw-canvas"
      flat
      frameloop="demand"
      dpr={lowPower ? 0.75 : [1, 1.25]}
      gl={{ antialias: false, powerPreference: 'low-power', alpha: false }}
      camera={{ position: [0, 0.6, 9], fov: 50, near: 0.1, far: 220 }}
      aria-hidden="true"
    >
      <color attach="background" args={['#05050b']} />
      <Ticker active={!reducedMotion} wakeKey={atmosphere} />
      <Director env={env} atmosphere={atmosphere} reducedMotion={reducedMotion} />
      <MoonlitWorld env={env} lowPower={lowPower} />
      <DustField env={env} kind="motes" count={lowPower ? 90 : 160} />
    </Canvas>
  )
}
