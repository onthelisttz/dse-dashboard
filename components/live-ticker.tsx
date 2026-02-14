"use client"

import { useLivePrices } from "@/lib/use-dse-data"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

export function LiveTicker() {
  const { data } = useLivePrices()
  const prices = data?.data ?? []

  if (prices.length === 0) {
    return (
      <div className="flex h-10 items-center overflow-hidden border-b border-border bg-card">
        <div className="flex animate-pulse items-center gap-4 px-4">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
      </div>
    )
  }

  const doubled = [...prices, ...prices]

  return (
    <div className="relative flex h-10 items-center overflow-hidden border-b border-border bg-card">
      <div className="flex animate-ticker-scroll items-center gap-6 whitespace-nowrap px-4">
        {doubled.map((item, i) => (
          <div key={`${item.company}-${i}`} className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{item.company}</span>
            <span className="text-muted-foreground">
              {item.price > 0 ? item.price.toLocaleString() : "N/A"}
            </span>
            {item.change !== 0 ? (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  item.change > 0 ? "text-gain" : "text-loss"
                )}
              >
                {item.change > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {item.change > 0 ? "+" : ""}
                {item.change}
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Minus className="h-3 w-3" />
                0
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
