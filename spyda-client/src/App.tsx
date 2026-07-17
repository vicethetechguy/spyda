import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Landing from './pages/Landing'
import Workspace from './pages/Workspace'
import Auth from './pages/Auth'
import Admin from './pages/Admin'
import SpydaSplash from './components/SpydaSplash'
import WorkspaceErrorBoundary from './components/WorkspaceErrorBoundary'
import { supabase } from './lib/supabase'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const [securityState, setSecurityState] = useState<'checking' | 'allowed' | 'mfa-required'>('checking')
  const allowLocalPreview = import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW === 'true'

  useEffect(() => {
    let active = true
    if (!session) {
      setSecurityState(allowLocalPreview ? 'allowed' : 'checking')
      return () => { active = false }
    }

    setSecurityState('checking')
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (!active) return
      setSecurityState(data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2' ? 'mfa-required' : 'allowed')
    }).catch(() => {
      if (active) setSecurityState('allowed')
    })
    return () => { active = false }
  }, [allowLocalPreview, session])

  if (loading) {
    return <SpydaSplash message="Checking your workspace access" />
  }

  if (!session && !allowLocalPreview) {
    return <Navigate to="/auth" replace />
  }

  if (session && securityState === 'mfa-required') {
    return <Navigate to="/auth" replace />
  }

  if (securityState === 'checking') {
    return <SpydaSplash message="Checking account security" />
  }

  return <>{children}</>
}

function App() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowSplash(false), 1500)
    return () => window.clearTimeout(splashTimer)
  }, [])

  if (showSplash) {
    return <SpydaSplash />
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/workspace" element={
            <ProtectedRoute>
              <WorkspaceErrorBoundary>
                <Workspace />
              </WorkspaceErrorBoundary>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
