import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Landing from './pages/Landing'
import SpydaSplash from './components/SpydaSplash'
import WorkspaceErrorBoundary from './components/WorkspaceErrorBoundary'
import { supabase } from './lib/supabase'

// Only the landing page is on the critical path. The workspace, admin and auth
// screens (and Paystack, which the workspace pulls in) download when visited,
// and the layer editor brings Konva and the cut-out tooling only when opened.
const CHUNK_RELOAD_KEY = 'spyda.chunkReloadAt'

/**
 * A tab opened before a deploy asks for chunk hashes that no longer exist. One
 * reload picks up the new build; the timestamp stops a genuinely broken chunk
 * from reloading forever.
 */
function lazyRoute<T extends React.ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch(error => {
    try {
      const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
      if (Date.now() - last > 30_000) {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
        window.location.reload()
        return new Promise<never>(() => undefined)
      }
    } catch {
      // storage unavailable: fall through to the error
    }
    throw error
  }))
}

const Workspace = lazyRoute(() => import('./pages/Workspace'))
const Auth = lazyRoute(() => import('./pages/Auth'))
const Admin = lazyRoute(() => import('./pages/Admin'))
const Editor = lazyRoute(() => import('./pages/Editor'))
const NewCanvas = lazyRoute(() => import('./pages/NewCanvas'))

const SPLASH_SEEN_KEY = 'spyda.splashSeen'

/** The brand splash plays once per browser session, not on every reload. */
function shouldShowSplash() {
  try {
    if (window.sessionStorage.getItem(SPLASH_SEEN_KEY)) return false
    window.sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
    return true
  } catch {
    return true
  }
}

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
  const [showSplash, setShowSplash] = useState(shouldShowSplash)
  const [splashLeaving, setSplashLeaving] = useState(false)

  useEffect(() => {
    if (!showSplash) return
    // Fade for the last 260ms instead of cutting to the app.
    const leaveTimer = window.setTimeout(() => setSplashLeaving(true), 1500)
    const splashTimer = window.setTimeout(() => setShowSplash(false), 1760)
    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(splashTimer)
    }
  }, [showSplash])

  if (showSplash) {
    return <SpydaSplash leaving={splashLeaving} />
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<SpydaSplash message="Loading" />}>
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
          <Route path="/editor/new" element={
            <ProtectedRoute>
              <Suspense fallback={<SpydaSplash message="Opening canvas mode" />}>
                <NewCanvas />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/editor/:projectId" element={
            <ProtectedRoute>
              <WorkspaceErrorBoundary>
                <Suspense fallback={<SpydaSplash message="Opening the layer editor" />}>
                  <Editor />
                </Suspense>
              </WorkspaceErrorBoundary>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
