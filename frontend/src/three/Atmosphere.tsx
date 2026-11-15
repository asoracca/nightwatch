import { useEffect, useMemo, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three'
import { palette, seeded, type Env } from './env'

/* ───────────── Motes & embers (GPU-animated points) ───────────── */

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uRise;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float span = 14.0;
    p.y = mod(p.y + 6.0 + uTime * uRise * (0.35 + aSeed), span) - 6.0;
    p.x += sin(uTime * 0.21 + aSeed * 6.2831) * 0.35 + uTime * 0.04;
    p.x = mod(p.x + 16.0, 32.0) - 16.0;
    p.z += cos(uTime * 0.17 + aSeed * 4.0) * 0.35;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.45 + aSeed) * (12.0 / -mv.z);
    float edges = smoothstep(-6.0, -4.6, p.y) * (1.0 - smoothstep(6.0, 7.8, p.y));
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 1.6) + aSeed * 40.0);
    vAlpha = edges * twinkle;
    vColor = aColor;
  }
`

const dustFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha * uOpacity);
    #include <colorspace_fragment>
  }
`

interface DustProps {
  env: RefObject<Env>
  kind: 'motes' | 'embers'
  count: number
  seed?: number
}

export function DustField({ env, kind, count, seed = 7 }: DustProps) {
  const points = useMemo(() => {
    const rand = seeded(seed)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const embers = kind === 'embers'
    const choices = embers ? [palette.ember, palette.amber, palette.ember] : [palette.mote, palette.moteDim, palette.moteDim]
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (rand() - 0.5) * (embers ? 10 : 30)
      positions[i * 3 + 1] = rand() * 14 - 6
      positions[i * 3 + 2] = embers ? -rand() * 8 + 1 : -rand() * 22 + 4
      const c = choices[Math.floor(rand() * choices.length)]
      colors.set([c.r, c.g, c.b], i * 3)
      seeds[i] = rand()
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3))
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1))
    const material = new ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uRise: { value: embers ? 0.55 : 0.05 },
        uSize: { value: embers ? 7 : 3.6 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
        uOpacity: { value: 0 },
      },
    })
    const object = new Points(geometry, material)
    object.frustumCulled = false
    return object
  }, [count, kind, seed])

  useEffect(() => () => {
    points.geometry.dispose()
    ;(points.material as ShaderMaterial).dispose()
  }, [points])

  useFrame(() => {
    const e = env.current
    const u = (points.material as ShaderMaterial).uniforms
    u.uTime.value = e.time
    u.uOpacity.value = e.reveal * (kind === 'embers' ? e.embers : e.dust * (0.45 + 0.55 * e.moonlight))
  })

  return <primitive object={points} />
}
