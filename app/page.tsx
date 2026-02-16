import { redirect } from "next/navigation"
import { Dashboard } from "@/components/dashboard"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <Dashboard
      user={{
        id: user.id,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "User",
        email: user.email ?? "",
        avatarUrl: user.user_metadata?.avatar_url ?? null,
      }}
    />
  )
}
