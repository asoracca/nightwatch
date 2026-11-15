import { useSyncExternalStore } from 'react'
import { sfx } from './sfx'

/** Current sound preferences (enabled + volume), kept in sync with the engine. */
export function useSfxPrefs() {
  return useSyncExternalStore(sfx.subscribe, sfx.getPrefs, sfx.getPrefs)
}
