import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown, LogOut, Menu, Search } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BrandMark } from '../brand/BrandMark'
import { SoundControl } from '../../audio/SoundControl'
import { useAuth } from '../../lib/auth'
import { verdictLabels } from '../../lib/recordings'
import { useWorkspace } from '../../lib/workspace'

const pageTitles: Record<string, string> = {
  '/command-center': 'Command Center',
  '/data-vault': 'Data Vault',
  '/vision-studio': 'Vision Studio',
  '/reports': 'Reports',
}

interface TopbarProps {
  onMenuClick: () => void
  isSidebarOpen: boolean
}

export function Topbar({ onMenuClick, isSidebarOpen }: TopbarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { displayName, email, signOut } = useAuth()
  const { footage, apiOnline } = useWorkspace()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const profileRef = useRef<HTMLDivElement>(null)
  const title = pageTitles[pathname] ?? 'Command Center'

  // Alerts come from stored evidence only: failed runs and high-priority sensor-fusion verdicts.
  const alerts = footage
    .flatMap((item) => {
      if (item.status === 'Failed') {
        return [{ id: item.id, title: item.title, text: item.errorMessage || 'Processing failed' }]
      }
      const result = item.recording?.result
      if (result?.review_priority === 'high' && result.verdict) {
        return [{ id: item.id, title: item.title, text: `${verdictLabels[result.verdict]} · high review priority` }]
      }
      return []
    })
    .slice(0, 6)

  useEffect(() => {
    if (!profileOpen) return
    const onPointer = (event: PointerEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [profileOpen])

  const initials = displayName.slice(0, 2).toUpperCase() || 'NW'

  return (
    <header className="topbar">
      <div className="topbar-leading">
        <button
          className="mobile-menu-button"
          type="button"
          data-sfx="none"
          aria-label="Open navigation menu"
          aria-expanded={isSidebarOpen}
          aria-controls="primary-sidebar"
          onClick={onMenuClick}
        >
          <Menu aria-hidden="true" />
        </button>
        <p className="page-title">{title}</p>
      </div>

      <div className="topbar-actions">
        <div className="system-indicator" role="status" data-state={apiOnline === false ? 'offline' : 'online'}>
          <BrandMark size={18} />
          {apiOnline === false ? 'API OFFLINE' : 'PROTOTYPE EVALUATION'}
        </div>

        <form
          className="search-box"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            const query = String(new FormData(event.currentTarget).get('q') ?? '').trim()
            navigate('/data-vault', { state: { search: query } })
          }}
        >
          <Search className="search-icon" aria-hidden="true" />
          <label className="sr-only" htmlFor="topbar-search">Search footage</label>
          <input
            id="topbar-search"
            name="q"
            className="search-input"
            type="search"
            placeholder="Search footage"
          />
        </form>

        <span className="topbar-divider" aria-hidden="true" />

        <SoundControl />

        <div className="notification-wrap">
          <button
            className="icon-button"
            type="button"
            aria-label={`Notifications${alerts.length ? `, ${alerts.length} alerts` : ''}`}
            aria-expanded={notificationsOpen}
            aria-controls="notification-panel"
            data-alerts={alerts.length > 0}
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <Bell aria-hidden="true" />
            {alerts.length > 0 && <span className="notification-count" aria-hidden="true">{alerts.length}</span>}
          </button>
          {notificationsOpen && (
            <div className="notification-panel" id="notification-panel" role="status">
              {alerts.length === 0 ? (
                <>
                  <strong>No alerts</strong>
                  <p>Failed runs and high-priority sensor verdicts appear here.</p>
                </>
              ) : (
                <>
                  <strong>{alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'}</strong>
                  <ul className="notification-list">
                    {alerts.map((alert) => (
                      <li key={alert.id}>
                        <Link
                          to="/vision-studio"
                          state={{ footageId: alert.id }}
                          onClick={() => setNotificationsOpen(false)}
                        >
                          <span>{alert.title}</span>
                          <small>{alert.text}</small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        <span className="topbar-divider" aria-hidden="true" />

        <div className="profile-wrap" ref={profileRef}>
          <button
            className="profile-chip"
            type="button"
            aria-expanded={profileOpen}
            aria-controls="profile-menu"
            onClick={() => setProfileOpen((open) => !open)}
          >
            <span className="profile-avatar" aria-hidden="true">{initials}</span>
            <span className="profile-meta">
              <strong>{displayName}</strong>
              <span>{email}</span>
            </span>
            <ChevronDown className="profile-chevron" size={14} aria-hidden="true" />
          </button>
          {profileOpen && (
            <div className="profile-menu" id="profile-menu">
              <span className="profile-menu-email">{email}</span>
              {signOutError && <span className="profile-menu-error" role="alert">{signOutError}</span>}
              <button
                type="button"
                onClick={() => {
                  setSignOutError('')
                  signOut().catch((error: Error) => setSignOutError(error.message))
                }}
              >
                <LogOut size={14} aria-hidden="true" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
