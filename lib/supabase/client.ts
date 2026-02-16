"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseClientEnv } from "@/lib/supabase/env"

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient

  const { url, anonKey } = getSupabaseClientEnv()
  browserClient = createBrowserClient(url, anonKey)

  return browserClient
}
