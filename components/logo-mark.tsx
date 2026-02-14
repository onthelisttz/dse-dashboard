import { Activity } from "lucide-react"
import { cn } from "@/lib/utils"

interface LogoMarkProps {
  className?: string
  iconClassName?: string
}

export function LogoMark({ className, iconClassName }: LogoMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary",
        className
      )}
      aria-hidden="true"
    >
      <Activity className={cn("h-5 w-5 text-primary-foreground", iconClassName)} />
    </span>
  )
}
