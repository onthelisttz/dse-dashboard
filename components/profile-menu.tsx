"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProfileMenuProps {
  name: string
  email: string
  avatarUrl?: string | null
  compact?: boolean
}

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) return "U"
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("")
}

export function ProfileMenu({ name, email, avatarUrl, compact = false }: ProfileMenuProps) {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const router = useRouter()
  const buttonSizeClass = compact ? "h-8 w-8" : "h-9 w-9"
  const avatarSizeClass = compact ? "h-6 w-6" : "h-7 w-7"
  const fallbackTextClass = compact ? "text-[10px]" : "text-[11px]"

  const handleSignOut = async () => {
    setIsSigningOut(true)
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace("/login")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(buttonSizeClass, "border-border bg-card")}
          aria-label="Open profile menu"
        >
          <Avatar className={avatarSizeClass}>
            <AvatarImage src={avatarUrl ?? undefined} alt={name} />
            <AvatarFallback className={cn("font-semibold", fallbackTextClass)}>
              {initialsFromName(name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <div className="space-y-1 rounded-md bg-secondary/20 px-2 py-2">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <DropdownMenuItem
          className="mt-2 cursor-pointer"
          disabled={isSigningOut}
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          {isSigningOut ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
