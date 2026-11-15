// Remembers which footage Vision Studio shows. Only the ID is stored; the record always comes from live data.

const STORAGE_KEY = 'nightwatch.vision-studio.footage-id'

export type FootageOrigin = 'Data Vault' | 'Reports' | 'Command Center'

const origins: FootageOrigin[] = ['Data Vault', 'Reports', 'Command Center']

/** Optional frame to open on arrival (from report findings and citations). */
export interface FrameJump {
  condition: 'clear' | 'low_light' | 'fog' | 'blurry'
  frameNumber: number
}

/** Reads `{ footageId, origin?, jump? }` from react-router location state. */
export function readFootageHandoff(
  state: unknown,
): { footageId: string; origin: FootageOrigin | null; jump: FrameJump | null } | null {
  if (typeof state !== 'object' || state === null || !('footageId' in state) || typeof state.footageId !== 'string') {
    return null
  }
  const origin = 'origin' in state && origins.includes(state.origin as FootageOrigin) ? (state.origin as FootageOrigin) : null
  const raw = 'jump' in state ? (state.jump as Partial<FrameJump> | null) : null
  const jump =
    raw && typeof raw.frameNumber === 'number' && ['clear', 'low_light', 'fog', 'blurry'].includes(String(raw.condition))
      ? { condition: raw.condition as FrameJump['condition'], frameNumber: raw.frameNumber }
      : null
  return { footageId: state.footageId, origin, jump }
}

export function loadStoredFootageId(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeFootageId(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(STORAGE_KEY, id)
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode, blocked site data): selection stays in memory only.
  }
}
