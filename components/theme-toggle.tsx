"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  compact?: boolean
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const buttonSizeClass = compact ? "h-8 w-8" : "h-9 w-9"
  const iconSizeClass = compact ? "h-3.5 w-3.5" : "h-4 w-4"

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className={cn(buttonSizeClass, "border-border bg-card text-muted-foreground")}
      >
        <Sun className={iconSizeClass} />
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={cn(
        buttonSizeClass,
        "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {theme === "dark" ? <Sun className={iconSizeClass} /> : <Moon className={iconSizeClass} />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
