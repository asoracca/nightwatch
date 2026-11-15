import {
  Activity,
  Database,
  FileText,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  ScanEye,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link, NavLink } from 'react-router-dom'
import { requestIntroReplay } from '../../experience/capabilities'
import { BrandMark, BrandWordmark } from '../brand/BrandMark'
import { useSidebarGlitch } from './useSidebarGlitch'
import { sfx } from '../../audio/sfx'
import { apiConfigured } from '../../lib/api'
import { useWorkspace } from '../../lib/workspace'

const navigation = [
  { to: '/command-center', label: 'Command Center', icon: LayoutDashboard },
  { to: '/data-vault', label: 'Data Vault', icon: Database },
  { to: '/vision-studio', label: 'Vision Studio', icon: ScanEye },
  { to: '/reports', label: 'Reports', icon: FileText },
]

const SIDEBAR_WIDTH = { expanded: 250, collapsed: 76 } as const

interface SidebarProps {
  /** Mobile drawer open state. */
  isOpen: boolean
  onNavigate: () => void
  onClose: () => void
  /** Desktop/tablet icon-rail state. Ignored by the mobile drawer. */
  collapsed: boolean
  onToggleCollapsed: () => void
  /** True while the launch intro covers the app; the opening glitch waits for it. */
  introActive?: boolean
}

export function Sidebar({
  isOpen,
  onNavigate,
  onClose,
  collapsed,
  onToggleCollapsed,
  introActive = false,
}: SidebarProps) {
  const shouldReduceMotion = useReducedMotion()
  const asideRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const { triggerNavGlitch } = useSidebarGlitch(asideRef, isOpen, introActive)
  const { apiOnline } = useWorkspace()
  const connection = !apiConfigured
    ? { state: 'off', label: 'API not configured', detail: 'Set API_URL in .env', title: 'Uploads and analysis are disabled until API_URL is set in the root .env' }
    : apiOnline === null
      ? { state: 'checking', label: 'Connecting', detail: 'Checking the NightWatch API', title: 'Checking the NightWatch API' }
      : apiOnline
        ? { state: 'online', label: 'Connected', detail: 'API and Supabase online', title: 'NightWatch API reachable' }
        : { state: 'offline', label: 'API unreachable', detail: 'Retrying every 30 s', title: 'The NightWatch API did not answer /health' }

  // Move focus into the drawer when it opens (mobile).
  useEffect(() => {
    if (isOpen) closeRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  const select = (index: number) => {
    // Glitch first, then let the route change proceed immediately (no delay).
    triggerNavGlitch(index)
    sfx.play('nav')
    onNavigate()
  }

  return (
    <motion.aside
      ref={asideRef}
      className="sidebar"
      id="primary-sidebar"
      data-open={isOpen}
      data-collapsed={collapsed}
      initial={false}
      animate={{ '--nw-sb-w': `${collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded}px` } as Record<string, string>}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.34, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Glitch layers: decorative, click-through, animated only while data-glitch is set. */}
      <span className="sidebar-glitch" aria-hidden="true">
        <span className="sidebar-glitch-flash" />
        <span className="sidebar-glitch-scan" />
        <span className="sidebar-glitch-static" />
        <span className="sidebar-glitch-bands" />
        <span className="sidebar-glitch-line" />
        <span className="sidebar-glitch-edge" />
      </span>

      {/* Desktop/tablet: collapse to an icon rail. */}
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        aria-controls="primary-sidebar"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        data-sfx="none"
        onClick={onToggleCollapsed}
      >
        {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
      </button>

      {/* Mobile drawer: close control. */}
      <button ref={closeRef} className="sidebar-close" type="button" data-sfx="none" aria-label="Close navigation menu" onClick={onClose}>
        <X aria-hidden="true" />
      </button>

      <Link className="brand" to="/command-center" aria-label="NightWatch — Command Center" onClick={() => select(1)}>
        <BrandMark size={40} tile />
        <BrandWordmark caption="Intelligence workspace" />
      </Link>

      <p className="nav-caption">Workspace</p>
      <nav className="primary-nav" aria-label="Primary navigation">
        {navigation.map(({ to, label, icon: Icon }, i) => (
          <div className="nav-item" key={to}>
            <NavLink className="nav-link" to={to} onClick={() => select(i + 1)}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      className="active-nav-indicator"
                      layoutId="active-navigation-indicator"
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 500, damping: 42 }
                      }
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="nav-link-icon" aria-hidden="true" />
                  {/* Stays in the DOM when collapsed (faded + clipped), so the link keeps its accessible name. */}
                  <span className="nav-link-label">{label}</span>
                </>
              )}
            </NavLink>
            {/* Shown on hover/focus only while collapsed. */}
            <span className="nav-tooltip" aria-hidden="true">{label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="preview-status" role="status" title={connection.title} data-state={connection.state}>
          <span className="status-dot" aria-hidden="true" />
          <span className="preview-status-copy">
            <strong>{connection.label}</strong>
            <span>{connection.detail}</span>
          </span>
        </div>
        <button className="replay-intro" type="button" onClick={requestIntroReplay} title="Replay intro">
          <Play size={10} aria-hidden="true" /> <span className="replay-intro-label">Replay intro</span>
        </button>
        <div className="sidebar-footnote">
          <Activity size={12} aria-hidden="true" /> <span>PROTOTYPE EVALUATION</span>
        </div>
      </div>
    </motion.aside>
  )
}
