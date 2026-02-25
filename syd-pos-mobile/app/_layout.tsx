import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { supabase } from '@syd/api'
import { queryClient } from '../lib/query-client'
import { useAuthStore } from '../store/auth'

// AsyncStorage key for persisted session tokens
const SESSION_STORAGE_KEY = 'syd-pos-supabase-session'

export default function RootLayout() {
  const hydrated = useAuthStore((state) => state.hydrated)
  const sessionChecked = useAuthStore((state) => state.sessionChecked)
  const setAuth = useAuthStore((state) => state.setAuth)
  const setSessionChecked = useAuthStore((state) => state.setSessionChecked)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      // Restore persisted session so the Supabase client carries the auth token
      // on every RLS-protected query. The default in-memory storage is wiped on
      // Fast Refresh or app restart, so we persist tokens to AsyncStorage.
      try {
        const stored = await AsyncStorage.getItem(SESSION_STORAGE_KEY)
        if (stored) {
          const { access_token, refresh_token } = JSON.parse(stored)
          // Re-hydrates the client; will auto-refresh the token if expired
          await supabase.auth.setSession({ access_token, refresh_token })
        }
      } catch {
        // Corrupt / expired — fall through; getSession will return null
      }

      try {
        const { data } = await supabase.auth.getSession()
        if (mounted) {
          setAuth(data.session?.user ?? null, data.session ?? null)
          setSessionChecked(true)
        }
      } catch {
        if (mounted) {
          setAuth(null, null)
          setSessionChecked(true)
        }
      }
    }

    init()

    // Persist tokens on every auth state change so they survive reloads
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        AsyncStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          })
        ).catch(() => null)
      } else {
        AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => null)
      }

      if (mounted) {
        setAuth(session?.user ?? null, session ?? null)
        setSessionChecked(true)
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [setAuth, setSessionChecked])

  if (!hydrated || !sessionChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
      <StatusBar style="auto" />
    </QueryClientProvider>
  )
}
