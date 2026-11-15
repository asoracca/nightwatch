/**
 * Page atmospheres for the moonlit environment. Plain data (no three.js import)
 * so the CSS fallback and the lazily-loaded 3D scene share it without pulling
 * WebGL code into the main bundle.
 *
 * Every page shares one landscape; presets only move the moon, thicken or thin
 * the clouds and fog, and shift the camera, so navigation feels like turning to
 * face a different part of the same night.
 */

export type AtmosphereId = 'sentinel' | 'guardian' | 'entity' | 'archive'

export interface AtmospherePreset {
  name: string
  description: string
  scene: {
    motes: number
    /** Moon position on the sky plane (world units). */
    moon: [number, number]
    /** 0 clear … 1 overcast. */
    clouds: number
    groundFog: number
    /** Overall brightness. */
    exposure: number
    cameraX: number
  }
}

export const atmospheres: Record<AtmosphereId, AtmospherePreset> = {
  // Command Center: the moon high to the right, clouds passing steadily.
  sentinel: {
    name: 'Watch over the plain',
    description: 'Moon high and right, moderate cloud',
    scene: { motes: 0.5, moon: [34, 70], clouds: 0.5, groundFog: 0.6, exposure: 1, cameraX: 0 },
  },
  // Data Vault: lower light, heavier fog — something buried out there.
  guardian: {
    name: 'The buried archive',
    description: 'Moon to the left, heavy ground fog',
    scene: { motes: 0.35, moon: [-26, 70], clouds: 0.62, groundFog: 0.9, exposure: 0.85, cameraX: -0.8 },
  },
  // Vision Studio: the clearest sky — the best light to see by.
  entity: {
    name: 'Clear sight',
    description: 'Brightest moon, thinner cloud',
    scene: { motes: 0.45, moon: [28, 69], clouds: 0.36, groundFog: 0.5, exposure: 1.1, cameraX: 0.8 },
  },
  // Reports: overcast and quiet, low light for reading.
  archive: {
    name: 'Overcast record',
    description: 'Moon mostly veiled, dim and still',
    scene: { motes: 0.25, moon: [40, 71], clouds: 0.72, groundFog: 0.7, exposure: 0.8, cameraX: 0.4 },
  },
}

const routeAtmospheres: Record<string, AtmosphereId> = {
  '/command-center': 'sentinel',
  '/data-vault': 'guardian',
  '/vision-studio': 'entity',
  '/reports': 'archive',
}

export function atmosphereForPath(pathname: string): AtmosphereId {
  return routeAtmospheres[pathname] ?? 'sentinel'
}
