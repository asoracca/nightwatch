import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PageErrorBoundary } from '../common/PageErrorBoundary'
import { AmbientBackdrop } from '../../experience/AmbientBackdrop'
import {
  REPLAY_INTRO_EVENT,
  requestIntroReplay,
  shouldPlayIntro,
} from '../../experience/capabilities'
import { LaunchIntro } from '../../experience/LaunchIntro'
import '../../experience/experience.css'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { sfx } from '../../audio/sfx'
import { SfxBridge } from '../../audio/SfxBridge'
import { ForegroundClouds } from '../../experience/ForegroundClouds'

const COLLAPSED_KEY = 'nightwatch.sidebar.collapsed'

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function AppLayout() {
  const { pathname } = useLocation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  // Desktop icon-rail state: lives here so it survives navigation; remembered per browser.
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1')
      } catch {
        // Storage unavailable: the preference just isn't remembered.
      }
      return !value
    })
  }, [])
  // Incremented to replay; 0 = not playing.
  const [introRun, setIntroRun] = useState(() => (shouldPlayIntro() ? 1 : 0))
  const closeSidebar = () => setIsSidebarOpen(false)

  // Development-only replay: Alt+Shift+I, or nightwatchReplayIntro() in the console.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyI') requestIntroReplay()
    }
    const w = window as Window & { nightwatchReplayIntro?: () => void }
    w.nightwatchReplayIntro = requestIntroReplay
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      delete w.nightwatchReplayIntro
    }
  }, [])

  useEffect(() => {
    const replay = () => {
      setIsSidebarOpen(false)
      setIntroRun((run) => run + 1)
    }
    window.addEventListener(REPLAY_INTRO_EVENT, replay)
    return () => window.removeEventListener(REPLAY_INTRO_EVENT, replay)
  }, [])

  // Escape closes the mobile drawer and returns focus to the menu button.
  useEffect(() => {
    if (!isSidebarOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsSidebarOpen(false)
      document.querySelector<HTMLButtonElement>('.mobile-menu-button')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isSidebarOpen])

  // Sidebar sounds: collapse/expand (desktop rail) and drawer open/close (mobile).
  // Skips the first render so restoring a saved state is silent.
  const sidebarMounted = useRef(false)
  useEffect(() => {
    if (!sidebarMounted.current) {
      sidebarMounted.current = true
      return
    }
    sfx.play('collapse')
  }, [collapsed, isSidebarOpen])

  const finishIntro = useCallback(() => setIntroRun(0), [])

  return (
    <>
      {/* The CSS backdrop is live from the first frame so the intro dissolves straight into it;
          the WebGL scene starts once the intro is done and fades in over the matching CSS layer. */}
      <AmbientBackdrop deferScene={introRun > 0} />

      <div className="app-stage">
        <div className="app-shell">
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <Sidebar
            isOpen={isSidebarOpen}
            onNavigate={closeSidebar}
            onClose={closeSidebar}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            introActive={introRun > 0}
          />
          <button
            className="mobile-backdrop"
            data-open={isSidebarOpen}
            type="button"
            aria-label="Close navigation menu"
            tabIndex={isSidebarOpen ? 0 : -1}
            onClick={closeSidebar}
          />
          <div className="workspace">
            <Topbar
              isSidebarOpen={isSidebarOpen}
              onMenuClick={() => setIsSidebarOpen(true)}
            />
            {/* Keyed by route so navigating away from a crashed page resets the boundary. */}
            <PageErrorBoundary key={pathname}>
              <Outlet />
            </PageErrorBoundary>
          </div>
        </div>
      </div>

      {/* Above the whole interface (sidebar, topbar, panels), below the intro; click-through. */}
      <ForegroundClouds />
      <SfxBridge />

      {introRun > 0 && <LaunchIntro key={introRun} onComplete={finishIntro} />}
    </>
  )
}
