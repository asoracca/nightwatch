import { useEffect, useMemo, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector2,
  type Camera,
} from 'three'
import {
  clamp01,
  damp,
  getCloudNoise,
  glowTexture,
  moonTexture,
  palette,
  sampleNoise,
  seeded,
  treeTexture,
  type CloudNoise,
  type Env,
} from './env'

/**
 * The moonlit landscape: midnight sky, a large moon behind drifting clouds,
 * layered barren ridges with dead trees, and low ground fog.
 *
 * Cost model: everything is a handful of planes. Cloud shapes come from one
 * baked 256² noise texture (two samples + one rim sample per pixel), so there
 * is no per-pixel procedural noise. The moonlight factor is computed on the CPU
 * by sampling the same noise at the moon's position, so light dims exactly when
 * a cloud visibly crosses the moon.
 */

const SKY_Z = -95
const MOON_Z = -88
const MOON_RADIUS = 9

/* ───────────── Shaders ───────────── */

const worldVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uMoonColor;
  uniform vec2 uMoon;
  uniform float uMoonlight;
  uniform float uExposure;
  uniform float uReveal;
  uniform float uTime;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float h = clamp((vWorld.y - 2.0) / 90.0, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
    float d = distance(vWorld.xy, uMoon);
    col += uMoonColor * (exp(-d / 16.0) * 0.32 + exp(-d / 55.0) * 0.12) * uMoonlight;

    // Sparse, faint stars that fade near the moon and the horizon.
    vec2 cell = floor(vWorld.xy * 0.9);
    float star = step(0.9965, hash(cell));
    vec2 inCell = fract(vWorld.xy * 0.9) - 0.5;
    float point = smoothstep(0.18, 0.0, length(inCell));
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.3 + hash(cell + 3.1) * 40.0);
    col += vec3(0.75, 0.8, 0.95) * star * point * twinkle * smoothstep(20.0, 60.0, d) * smoothstep(8.0, 30.0, vWorld.y) * 0.5;

    gl_FragColor = vec4(col * uExposure * uReveal, 1.0);
    #include <colorspace_fragment>
  }
`

const cloudFragment = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform vec2 uSpeed;
  uniform vec2 uScale;
  uniform vec2 uOffset;
  uniform float uDensity;
  uniform float uSoft;
  uniform vec3 uDark;
  uniform vec3 uLit;
  uniform vec2 uMoonUv;
  uniform float uAspect;
  uniform float uMoonlight;
  uniform float uOpacity;
  uniform vec2 uMaskBottom;
  uniform vec2 uMaskTop;
  uniform float uRim;
  varying vec2 vUv;

  float density(vec2 uv) {
    vec2 p = uv * uScale + uOffset + uTime * uSpeed;
    float n1 = texture2D(uNoise, p).r;
    float n2 = texture2D(uNoise, p * 2.03 + vec2(0.31, 0.17) + uTime * uSpeed * 0.6).r;
    return n1 * 0.68 + n2 * 0.32;
  }

  void main() {
    float n = density(vUv);
    float a = smoothstep(uDensity, uDensity + uSoft, n);

    vec2 dm = uMoonUv - vUv;
    float dist = length(vec2(dm.x * uAspect, dm.y));
    vec2 dir = normalize(dm + 1e-5);
    // Silver lining: density falling off toward the moon marks an edge facing it.
    float toward = density(vUv + dir * 0.012);
    float rim = clamp((n - toward) * 9.0, 0.0, 1.0) * (1.0 - a * 0.5);
    float near = exp(-dist * 2.6);
    // Thin cloud near the moon is backlit: it glows silver rather than reading as a grey smudge.
    float backlit = near * (1.0 - a * 0.55);
    float lit = (rim * uRim + 0.3) * near + backlit * 0.55 + 0.05;
    vec3 col = mix(uDark, uLit, clamp(lit * uMoonlight, 0.0, 1.0));

    float mask = smoothstep(uMaskBottom.x, uMaskBottom.y, vUv.y)
      * (1.0 - smoothstep(uMaskTop.x, uMaskTop.y, vUv.y))
      * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    gl_FragColor = vec4(col, a * mask * uOpacity);
    #include <colorspace_fragment>
  }
`

const ridgeVertex = /* glsl */ `
  attribute float aEdge;
  varying float vEdge;
  varying float vX;
  void main() {
    vEdge = aEdge;
    vX = position.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ridgeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uRimColor;
  uniform float uRim;
  uniform float uMoonX;
  uniform float uFalloff;
  uniform float uMoonlight;
  uniform float uExposure;
  uniform float uReveal;
  varying float vEdge;
  varying float vX;
  void main() {
    float rim = pow(vEdge, 2.5) * uRim * uMoonlight * (0.35 + 0.65 * exp(-abs(vX - uMoonX) / uFalloff));
    vec3 col = uColor * uExposure + uRimColor * rim;
    gl_FragColor = vec4(col * uReveal, 1.0);
    #include <colorspace_fragment>
  }
`

/* ───────────── Layer specs ───────────── */

interface CloudSpec {
  z: number
  y: number
  w: number
  h: number
  scale: [number, number]
  speed: number
  offset: [number, number]
  density: number
  soft: number
  opacity: number
  dark: string
  lit: string
  rim: number
  maskBottom: [number, number]
  maskTop: [number, number]
  /** Contributes to moon occlusion and cloud-cover control. */
  sky: boolean
}

const cloudSpecs: CloudSpec[] = [
  // Far cloud bank behind and around the moon.
  { z: -72, y: 34, w: 330, h: 90, scale: [1.5, 0.55], speed: 0.0022, offset: [0.1, 0.3], density: 0.5, soft: 0.24, opacity: 0.6, dark: '#0e1019', lit: '#6a789c', rim: 1.4, maskBottom: [0.05, 0.3], maskTop: [0.85, 1], sky: true },
  // Mid layer: the one that most often crosses the moon.
  { z: -50, y: 24, w: 230, h: 62, scale: [1.25, 0.5], speed: 0.0042, offset: [0.55, 0.12], density: 0.5, soft: 0.26, opacity: 0.9, dark: '#0b0c14', lit: '#7c8bb0', rim: 1.8, maskBottom: [0.1, 0.4], maskTop: [0.88, 1], sky: true },
  // Foreground: large, dark, slow masses across the top of the screen.
  { z: -17, y: 10.5, w: 84, h: 24, scale: [1.05, 0.48], speed: 0.0068, offset: [0.21, 0.66], density: 0.47, soft: 0.32, opacity: 0.92, dark: '#06060c', lit: '#a5b4d8', rim: 2.2, maskBottom: [0.18, 0.62], maskTop: [0.94, 1], sky: true },
  // Ground fog banks between ridges.
  { z: -42, y: 1.6, w: 190, h: 14, scale: [2.4, 0.7], speed: 0.0055, offset: [0.4, 0.8], density: 0.36, soft: 0.42, opacity: 0.55, dark: '#1b1f31', lit: '#4c5675', rim: 0.6, maskBottom: [0, 0.3], maskTop: [0.4, 0.95], sky: false },
  { z: -24, y: -0.4, w: 120, h: 9, scale: [2.2, 0.7], speed: 0.008, offset: [0.73, 0.2], density: 0.38, soft: 0.42, opacity: 0.5, dark: '#171a2a', lit: '#46506d', rim: 0.6, maskBottom: [0, 0.3], maskTop: [0.35, 0.95], sky: false },
  { z: -11, y: -1.5, w: 64, h: 6, scale: [2, 0.7], speed: 0.011, offset: [0.15, 0.5], density: 0.4, soft: 0.42, opacity: 0.45, dark: '#121424', lit: '#3d4662', rim: 0.5, maskBottom: [0, 0.3], maskTop: [0.35, 0.95], sky: false },
]

interface RidgeSpec {
  z: number
  baseY: number
  amp: number
  rough: number
  seed: number
  color: string
  rim: number
  trees: number
  treeHeight: [number, number]
}

const ridgeSpecs: RidgeSpec[] = [
  { z: -62, baseY: -1.2, amp: 7.5, rough: 0.35, seed: 3, color: '#151726', rim: 0.18, trees: 0, treeHeight: [0, 0] },
  { z: -38, baseY: -1.8, amp: 4.6, rough: 0.6, seed: 8, color: '#0e0f1a', rim: 0.28, trees: 4, treeHeight: [2.2, 3.4] },
  { z: -20, baseY: -2.1, amp: 2.6, rough: 0.8, seed: 15, color: '#08080f', rim: 0.34, trees: 4, treeHeight: [2.2, 4.2] },
  { z: -9, baseY: -2.5, amp: 1.2, rough: 1, seed: 21, color: '#040408', rim: 0.4, trees: 2, treeHeight: [3.4, 5.2] },
]

/* ───────────── Builders ───────────── */

function ridgeProfile(spec: RidgeSpec) {
  const rand = seeded(spec.seed * 97 + 5)
  const lattice = Array.from({ length: 256 }, () => rand())
  const noise1 = (x: number) => {
    const i = Math.floor(x)
    const f = x - i
    const s = f * f * (3 - 2 * f)
    const a = lattice[((i % 256) + 256) % 256]
    const b = lattice[(((i + 1) % 256) + 256) % 256]
    return a + (b - a) * s
  }
  const phase = rand() * 100
  return (x: number) => {
    const p = x * 0.045 + phase
    let h = 0
    let amp = 1
    let freq = 1
    for (let o = 0; o < 4; o += 1) {
      h += noise1(p * freq) * amp
      amp *= 0.5
      freq *= 2.1
    }
    // Rocky outcrops: sharpened high-frequency ridges.
    const rock = Math.pow(Math.abs(noise1(p * 6.3 + 17) - 0.5) * 2, 3) * spec.rough
    return spec.baseY + (h / 1.875) * spec.amp + rock * spec.amp * 0.35
  }
}

function buildRidge(spec: RidgeSpec, cameraZ: number, columns: number) {
  const width = (cameraZ - spec.z) * 2.2 + 30
  const heightAt = ridgeProfile(spec)
  const band = 0.18 + (cameraZ - spec.z) * 0.006
  const positions: number[] = []
  const edge: number[] = []
  const index: number[] = []
  for (let i = 0; i <= columns; i += 1) {
    const x = -width / 2 + (i / columns) * width
    const h = heightAt(x)
    positions.push(x, h, 0, x, h - band, 0, x, -40, 0)
    edge.push(1, 0, 0)
    if (i < columns) {
      const a = i * 3
      const b = a + 3
      index.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 1))
  geometry.setIndex(index)
  const material = new ShaderMaterial({
    vertexShader: ridgeVertex,
    fragmentShader: ridgeFragment,
    uniforms: {
      uColor: { value: new Color(spec.color) },
      uRimColor: { value: palette.moonlight.clone() },
      uRim: { value: spec.rim },
      uMoonX: { value: 0 },
      uFalloff: { value: width * 0.22 },
      uMoonlight: { value: 1 },
      uExposure: { value: 1 },
      uReveal: { value: 0 },
    },
  })
  const mesh = new Mesh(geometry, material)
  mesh.position.z = spec.z
  return { mesh, heightAt, width }
}

function cloudMaterial(spec: CloudSpec, noise: CloudNoise) {
  return new ShaderMaterial({
    vertexShader: worldVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uNoise: { value: noise.texture },
      uTime: { value: 0 },
      uSpeed: { value: new Vector2(spec.speed, spec.speed * 0.12) },
      uScale: { value: new Vector2(...spec.scale) },
      uOffset: { value: new Vector2(...spec.offset) },
      uDensity: { value: spec.density },
      uSoft: { value: spec.soft },
      uDark: { value: new Color(spec.dark) },
      uLit: { value: new Color(spec.lit) },
      uMoonUv: { value: new Vector2(0.5, 0.5) },
      uAspect: { value: spec.w / spec.h },
      uMoonlight: { value: 1 },
      uOpacity: { value: 0 },
      uMaskBottom: { value: new Vector2(...spec.maskBottom) },
      uMaskTop: { value: new Vector2(...spec.maskTop) },
      uRim: { value: spec.rim },
    },
  })
}

/** Mirror of the shader's density() + smoothstep for CPU-side occlusion. */
function cloudAlphaAt(spec: CloudSpec, density: number, noise: CloudNoise, u: number, v: number, t: number) {
  const px = u * spec.scale[0] + spec.offset[0] + t * spec.speed
  const py = v * spec.scale[1] + spec.offset[1] + t * spec.speed * 0.12
  const n1 = sampleNoise(noise, px, py)
  const n2 = sampleNoise(noise, px * 2.03 + 0.31 + t * spec.speed * 0.6, py * 2.03 + 0.17 + t * spec.speed * 0.12 * 0.6)
  const n = n1 * 0.68 + n2 * 0.32
  const x = clamp01((n - density) / spec.soft)
  return x * x * (3 - 2 * x)
}

function buildWorld(lowPower: boolean) {
  const group = new Group()
  const noise = getCloudNoise()
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item)
    return item
  }
  const cameraZ = 9

  const sky = new Mesh(
    track(new PlaneGeometry(560, 280)),
    track(
      new ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: skyFragment,
        depthWrite: false,
        uniforms: {
          uTop: { value: palette.night.clone() },
          uHorizon: { value: palette.horizon.clone() },
          uMoonColor: { value: palette.moonlight.clone() },
          uMoon: { value: new Vector2() },
          uMoonlight: { value: 1 },
          uExposure: { value: 1 },
          uReveal: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    ),
  )
  sky.position.set(0, 70, SKY_Z)
  sky.renderOrder = -10

  const moonMaterial = track(new MeshBasicMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }))
  const moon = new Mesh(track(new CircleGeometry(MOON_RADIUS, 64)), moonMaterial)
  moon.renderOrder = -9
  const haloWide = new Sprite(track(new SpriteMaterial({ map: glowTexture(), color: palette.moonlight.clone(), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 })))
  haloWide.scale.setScalar(90)
  const haloTight = new Sprite(track(new SpriteMaterial({ map: glowTexture(), color: palette.moonWarm.clone(), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 })))
  haloTight.scale.setScalar(30)
  haloWide.renderOrder = haloTight.renderOrder = -8
  group.add(sky, moon, haloWide, haloTight)

  const clouds = cloudSpecs.map((spec) => {
    const mesh = new Mesh(track(new PlaneGeometry(spec.w, spec.h)), track(cloudMaterial(spec, noise)))
    mesh.position.set(0, spec.y, spec.z)
    group.add(mesh)
    return { spec, mesh, material: mesh.material as ShaderMaterial }
  })

  const columns = lowPower ? 140 : 240
  const ridges = ridgeSpecs.map((spec) => {
    const ridge = buildRidge(spec, cameraZ, columns)
    track(ridge.mesh.geometry)
    track(ridge.mesh.material as ShaderMaterial)
    group.add(ridge.mesh)
    return { spec, ...ridge }
  })

  // Dead trees on the nearer ridges, placed toward the frame edges so the centre stays open.
  const trees: { mesh: Mesh; base: Color }[] = []
  const treeGeometry = track(new PlaneGeometry(1, 2))
  treeGeometry.translate(0, 1, 0)
  ridges.forEach((ridge, r) => {
    const rand = seeded(ridge.spec.seed * 31)
    const visibleHalf = (cameraZ - ridge.spec.z) * 0.85
    for (let i = 0; i < ridge.spec.trees; i += 1) {
      const side = i % 2 ? 1 : -1
      const x = side * visibleHalf * (0.35 + rand() * 0.6)
      const height = ridge.spec.treeHeight[0] + rand() * (ridge.spec.treeHeight[1] - ridge.spec.treeHeight[0])
      const base = new Color(ridge.spec.color).multiplyScalar(0.7)
      const material = track(
        new MeshBasicMaterial({ map: treeTexture(ridge.spec.seed * 10 + i), color: base.clone(), transparent: true, alphaTest: 0.35, fog: false }),
      )
      const tree = new Mesh(treeGeometry, material)
      tree.scale.set(height * 0.5, height * 0.5, 1)
      tree.position.set(x, ridge.heightAt(x) - 0.15, ridge.spec.z + 0.05 + r * 0.001)
      group.add(tree)
      trees.push({ mesh: tree, base })
    }
  })

  return { group, noise, sky, moon, moonMaterial, haloWide, haloTight, clouds, ridges, trees, dispose: () => disposables.forEach((d) => d.dispose()) }
}

/** Where the line from the camera to the moon crosses a plane at depth z, in that plane's UV. */
function moonUvOnPlane(camera: Camera, moonX: number, moonY: number, plane: { x: number; y: number; z: number; w: number; h: number }) {
  const c = camera.position
  const t = (plane.z - c.z) / (MOON_Z - c.z)
  const px = c.x + (moonX - c.x) * t
  const py = c.y + (moonY - c.y) * t
  return { u: (px - plane.x) / plane.w + 0.5, v: (py - plane.y) / plane.h + 0.5 }
}

export function MoonlitWorld({ env, lowPower = false }: { env: RefObject<Env>; lowPower?: boolean }) {
  const world = useMemo(() => buildWorld(lowPower), [lowPower])

  useEffect(() => () => world.dispose(), [world])

  useFrame((state, rawDelta) => {
    const e = env.current
    const delta = Math.min(rawDelta, 0.1)
    const t = e.time
    const camera = state.camera
    const coverShift = (0.5 - e.clouds) * 0.28

    // Moon occlusion from the sky cloud layers in front of it.
    let transmission = 1
    world.clouds.forEach(({ spec, mesh, material }) => {
      const uv = moonUvOnPlane(camera, e.moon.x, e.moon.y, { x: mesh.position.x, y: spec.y, z: spec.z, w: spec.w, h: spec.h })
      const u = material.uniforms
      ;(u.uMoonUv.value as Vector2).set(uv.u, uv.v)
      const density = spec.sky ? spec.density + coverShift : spec.density
      u.uDensity.value = density
      u.uTime.value = t
      u.uOpacity.value = e.reveal * spec.opacity * (spec.sky ? 1 : e.groundFog)
      if (spec.sky && uv.u > 0 && uv.u < 1 && uv.v > 0 && uv.v < 1) {
        const mask = clamp01((uv.v - spec.maskBottom[0]) / (spec.maskBottom[1] - spec.maskBottom[0]))
        const a = cloudAlphaAt(spec, density, world.noise, uv.u, uv.v, t) * mask * spec.opacity
        transmission *= 1 - a * 0.92
      }
    })
    const target = 0.22 + 0.78 * transmission
    e.moonlight = e.speed === 0 ? target : damp(e.moonlight, target, 2.5, delta)
    const light = e.moonlight

    world.clouds.forEach(({ material }) => {
      material.uniforms.uMoonlight.value = light * e.exposure
    })

    const skyU = (world.sky.material as ShaderMaterial).uniforms
    ;(skyU.uMoon.value as Vector2).copy(e.moon)
    skyU.uMoonlight.value = light
    skyU.uExposure.value = e.exposure
    skyU.uReveal.value = e.reveal
    skyU.uTime.value = t

    world.moon.position.set(e.moon.x, e.moon.y, MOON_Z)
    world.moonMaterial.color.setScalar(e.reveal * Math.min(1, 0.92 * e.exposure + 0.08))
    world.haloWide.position.set(e.moon.x, e.moon.y, MOON_Z + 1)
    world.haloTight.position.set(e.moon.x, e.moon.y, MOON_Z + 1)
    ;(world.haloWide.material as SpriteMaterial).opacity = e.reveal * 0.2 * light * e.exposure
    ;(world.haloTight.material as SpriteMaterial).opacity = e.reveal * 0.32 * light * e.exposure

    world.ridges.forEach(({ spec, mesh }) => {
      const u = (mesh.material as ShaderMaterial).uniforms
      const depthRatio = (camera.position.z - spec.z) / (camera.position.z - MOON_Z)
      u.uMoonX.value = camera.position.x + (e.moon.x - camera.position.x) * depthRatio
      u.uMoonlight.value = light
      u.uExposure.value = e.exposure
      u.uReveal.value = e.reveal
    })
    world.trees.forEach(({ mesh, base }) => {
      ;(mesh.material as MeshBasicMaterial).color.copy(base).multiplyScalar(e.reveal * e.exposure)
    })
  })

  return <primitive object={world.group} />
}
