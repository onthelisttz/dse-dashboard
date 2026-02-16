"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LogoMark } from "@/components/logo-mark"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export function GoogleSignInCard() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleGoogleSignIn = async () => {
    setIsLoading(true)

    try {
      const supabase = getSupabaseBrowserClient()
      const redirectTo =
        process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URI ??
        `${window.location.origin}/callback`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      })

      if (error) {
        throw error
      }
    } catch {
      setIsLoading(false)
      router.refresh()
    }
  }

  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center">
          <LogoMark className="h-10 w-10" iconClassName="h-5 w-5" />
        </div>
        <CardTitle className="text-xl font-bold text-foreground">Sign In</CardTitle>
        <CardDescription>
          Continue with Google to access your DSE dashboard and alerts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? "Redirecting..." : "Continue with Google"}
        </Button>
      </CardContent>
    </Card>
  )
}
