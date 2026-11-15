import { useState } from 'react'
import { Copy, Cpu, Plus, Radio } from 'lucide-react'
import { StatusBadge } from '../common/StatusBadge'
import { api, apiConfigured } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useWorkspace } from '../../lib/workspace'
import { timeAgo } from './ActivityFeed'

const ONLINE_WINDOW_MS = 10 * 60_000

export function DeviceNetwork({ now }: { now: number }) {
  const { token } = useAuth()
  const { devices, events, recordings, refreshDevices } = useWorkspace()
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [secret, setSecret] = useState('')

  // Last sign of life per device: a sensor event or an uploaded recording.
  const lastSeen = new Map<string, number>()
  for (const event of events.data) {
    lastSeen.set(event.device_id, Math.max(lastSeen.get(event.device_id) ?? 0, Date.parse(event.event_time)))
  }
  for (const recording of recordings.data) {
    lastSeen.set(recording.device_id, Math.max(lastSeen.get(recording.device_id) ?? 0, Date.parse(recording.uploaded_at)))
  }

  async function action(run: () => Promise<void>) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await run()
      await refreshDevices()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && <p className="nw-inline-error" role="alert">{error}</p>}
      {devices.error && <p className="nw-inline-error" role="alert">{devices.error}</p>}
      {message && <p className="nw-inline-note" role="status">{message}</p>}

      {secret && (
        <div className="cc-device-secret">
          <p>Copy this restricted token into your ignored <code>arduino_secrets.h</code>. It is shown once and expires in 30 days.</p>
          <input aria-label="One-time device token" type="password" value={secret} readOnly />
          <div className="cc-device-secret-actions">
            <button
              className="cc-button cc-button--quiet"
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(secret)
                  .then(() => setMessage('Device token copied.'))
                  .catch(() => setError('Clipboard unavailable; select the field and copy manually.'))
              }
            >
              <Copy size={13} aria-hidden="true" /> Copy token
            </button>
            <button className="cc-button cc-button--quiet" type="button" onClick={() => setSecret('')}>Hide permanently</button>
          </div>
        </div>
      )}

      <div className="cc-sensor-list">
        {devices.data.length === 0 && devices.loaded && !devices.error && (
          <p className="cc-panel-footnote">No devices registered. Register one to send authenticated sensor events.</p>
        )}
        {devices.data.map((device) => {
          const seen = lastSeen.get(device.device_id)
          const expired = Date.parse(device.token_expires_at) <= now
          const online = device.enabled && !expired && seen !== undefined && now - seen < ONLINE_WINDOW_MS
          return (
            <article className="cc-sensor-row" key={device.device_id}>
              <span className="cc-sensor-icon cc-sensor-icon--distance">
                <Cpu size={15} aria-hidden="true" />
              </span>
              <div className="cc-sensor-main">
                <div className="cc-sensor-name-row">
                  <strong>{device.label}</strong>
                  <StatusBadge tone={!device.enabled ? 'muted' : expired ? 'pink' : online ? 'positive' : 'amber'} pulse={online}>
                    {!device.enabled ? 'Revoked' : expired ? 'Token expired' : online ? 'Online' : 'Quiet'}
                  </StatusBadge>
                </div>
                <div className="cc-sensor-meta">
                  <span>{device.device_id}</span>
                  <span>{seen ? `Last seen ${timeAgo(new Date(seen).toISOString(), now)}` : 'Never seen'}</span>
                </div>
              </div>
              {device.enabled && (
                <button
                  className="cc-device-revoke"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Revoke ${device.device_id}? It will stop sending events immediately.`)) return
                    action(async () => {
                      await api(`/api/devices/${encodeURIComponent(device.device_id)}/revoke`, token, {})
                      setSecret('')
                      setMessage(`${device.device_id} revoked.`)
                    })
                  }}
                >
                  Revoke
                </button>
              )}
            </article>
          )
        })}
      </div>

      {formOpen ? (
        <form
          className="cc-device-form"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            action(async () => {
              const created = await api<{ token: string }>('/api/devices', token, {
                device_id: String(form.get('device_id')),
                label: String(form.get('label')),
              })
              setSecret(created.token)
              setFormOpen(false)
              setMessage('Device registered.')
            })
          }}
        >
          <label>
            <span>Device ID</span>
            <input name="device_id" placeholder="nightwatch-device-001" pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]{2,63}" required disabled={busy} />
          </label>
          <label>
            <span>Label</span>
            <input name="label" maxLength={80} required disabled={busy} />
          </label>
          <div className="cc-device-secret-actions">
            <button className="cc-button cc-button--primary" type="submit" disabled={busy}>
              <Radio size={13} aria-hidden="true" /> {busy ? 'Registering…' : 'Register device'}
            </button>
            <button className="cc-button cc-button--quiet" type="button" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="cc-button cc-button--quiet cc-device-add" type="button" disabled={!apiConfigured} onClick={() => setFormOpen(true)}>
          <Plus size={13} aria-hidden="true" /> Register device
        </button>
      )}
      <p className="cc-panel-footnote">Linked readings can raise person scores before tracking (sensor-assisted tracking); the raw model score is always kept.</p>
    </>
  )
}
