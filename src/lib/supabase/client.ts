import { createBrowserClient } from '@supabase/ssr'

// Create an untyped client to avoid type inference issues
// Types will be added when Supabase CLI generates them from the schema
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
  )
}

// Singleton instance for client-side use
let client: ReturnType<typeof createClient> | null = null

export function getClient() {
  if (!client) {
    client = createClient()
  }
  return client
}
