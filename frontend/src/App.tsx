import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider, useAuth } from './lib/auth'
import { WorkspaceProvider } from './lib/workspace'
import CommandCenter from './pages/CommandCenter'
import DataVault from './pages/DataVault'
import Reports from './pages/Reports'
import SignIn from './pages/SignIn'
import VisionStudio from './pages/VisionStudio'
import './styles/auth.css'

function AuthGate() {
  const { ready, session } = useAuth()
  if (!ready) {
    return <div className="auth-loading" role="status">Restoring session…</div>
  }
  if (!session) return <SignIn />
  return (
    // Keyed by user so an account switch can never show the previous user's state.
    <WorkspaceProvider key={session.user.id}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/command-center" replace />} />
          <Route path="/command-center" element={<CommandCenter />} />
          <Route path="/data-vault" element={<DataVault />} />
          <Route path="/vision-studio" element={<VisionStudio />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/command-center" replace />} />
        </Route>
      </Routes>
    </WorkspaceProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}
