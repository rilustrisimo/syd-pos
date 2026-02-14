import { createBrowserClient } from '@supabase/ssr'

// Create an untyped client to avoid type inference issues
// Types will be added when Supabase CLI generates them from the schema
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check your .env.local file and ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY are set.'
    )
  }

  if (!supabaseUrl.startsWith('http')) {
    throw new Error(
      'Invalid NEXT_PUBLIC_SUPABASE_URL. It should start with https:// (e.g., https://your-project.supabase.co)'
    )
  }

  // Accept both traditional JWT anon keys (eyJ...) and new publishable keys (sb_publishable_...)
  if (!supabaseKey.startsWith('eyJ') && !supabaseKey.startsWith('sb_publishable_')) {
    throw new Error(
      'Invalid Supabase key. The key should be either a JWT token starting with "eyJ" or a publishable key starting with "sb_publishable_". Please get your key from Supabase Dashboard → Project Settings → API.'
    )
  }

  return createBrowserClient(supabaseUrl, supabaseKey)
}

// Singleton instance for client-side use
let client: ReturnType<typeof createClient> | null = null

export function getClient() {
  if (!client) {
    client = createClient()
  }
  return client
}
