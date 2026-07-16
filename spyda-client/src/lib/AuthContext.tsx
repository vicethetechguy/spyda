import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { resetLocalSupabaseSession, supabase } from './supabase'

type AuthContextType = {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<Session>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => { throw new Error('Auth provider is unavailable.') },
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let authEventVersion = 0

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          await resetLocalSupabaseSession()
          if (!active) return
          setSession(null)
          setUser(null)
          setLoading(false)
          return
        }

        if (!active || authEventVersion > 0) return
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setLoading(false)
      } catch {
        await resetLocalSupabaseSession()
        if (!active) return
        setSession(null)
        setUser(null)
        setLoading(false)
      }
    }

    void restoreSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventVersion += 1
      if (!active) return
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    // A rejected refresh token must not block a fresh password sign-in.
    await resetLocalSupabaseSession()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.session) throw new Error('Spyda could not establish an account session.')
    setSession(data.session)
    setUser(data.session.user)
    setLoading(false)
    return data.session
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setSession(null)
    setUser(null)
    window.location.assign('/')
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  return useContext(AuthContext)
}
