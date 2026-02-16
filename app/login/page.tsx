import { redirect } from "next/navigation"
import { GoogleSignInCard } from "@/components/google-sign-in-card"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect("/")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <GoogleSignInCard />
    </main>
  )
}
