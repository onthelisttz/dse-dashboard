import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseServiceEnv } from "@/lib/supabase/env"

let adminClient: SupabaseClient | null = null

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient

  const { url, serviceRoleKey } = getSupabaseServiceEnv()
  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return adminClient
}
