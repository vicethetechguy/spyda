import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const projectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0]
  } catch {
    return 'spyda'
  }
})()

export const supabaseStorageKey = `sb-${projectRef}-auth-token`

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Please check your .env.local file.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    storageKey: supabaseStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
})

export function clearStoredSupabaseSession() {
  if (typeof window === 'undefined') return

  window.localStorage.removeItem(supabaseStorageKey)
  window.localStorage.removeItem(`${supabaseStorageKey}-user`)
  window.localStorage.removeItem(`${supabaseStorageKey}-code-verifier`)
}

export async function resetLocalSupabaseSession() {
  await supabase.auth.stopAutoRefresh()
  clearStoredSupabaseSession()

  // The stored token is removed first so signOut cannot try to refresh it.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  clearStoredSupabaseSession()
  await supabase.auth.startAutoRefresh()
}
