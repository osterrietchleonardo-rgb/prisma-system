import { createClient as createBrowserClient } from './supabase/client'

/**
 * Client-side component version of the Supabase client.
 * For server-side usage, please import from '@/lib/supabase/server'.
 */
export const createClient = () => {
  return createBrowserClient()
}

// Re-export specific browser client
export { createBrowserClient }
