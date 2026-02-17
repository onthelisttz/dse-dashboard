"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { MarketDataItem } from "@/lib/types"
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  ArrowUpDown,
  DollarSign,
  Activity,
} from "lucide-react"

interface StatCardsProps {
  selectedCompany: MarketDataItem | null
}

export function StatCards({ selectedCompany }: StatCardsProps) {
  if (!selectedCompany) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-16 rounded bg-muted" />
                <div className="h-6 w-24 rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const c = selectedCompany
  const changeValue = c.changeValue
  const numericChangeValue = typeof changeValue === "number" ? changeValue : 0
  const isPositive = numericChangeValue > 0
  const isNegative = numericChangeValue < 0

  const stats = [
    {
      label: "Market Price",
      value: `TZS ${c.marketPrice?.toLocaleString() ?? "N/A"}`,
      sub: `${typeof changeValue === "number" ? `${changeValue > 0 ? "+" : ""}${changeValue}` : "N/A"} | Shares on Offer: ${c.bestOfferQuantity?.toLocaleString() ?? "N/A"}`,
      subColor: isPositive ? "text-gain" : isNegative ? "text-loss" : "text-muted-foreground",
      icon: isPositive ? TrendingUp : isNegative ? TrendingDown : Activity,
      iconColor: isPositive ? "text-gain" : isNegative ? "text-loss" : "text-muted-foreground",
    },
    {
      label: "Volume",
      value: c.volume?.toLocaleString() ?? "N/A",
      sub: `Open: TZS ${c.openingPrice?.toLocaleString() ?? "N/A"} | Bid Qty: ${c.bestBidQuantity?.toLocaleString() ?? "N/A"}`,
      subColor: "text-muted-foreground",
      icon: BarChart3,
      iconColor: "text-chart-2",
    },
    {
      label: "Day Range",
      value: `${c.low?.toLocaleString() ?? "N/A"} - ${c.high?.toLocaleString() ?? "N/A"}`,
      sub: `Limit: ${c.minLimit?.toLocaleString()} - ${c.maxLimit?.toLocaleString()}`,
      subColor: "text-muted-foreground",
      icon: ArrowUpDown,
      iconColor: "text-chart-3",
    },
    {
      label: "Market Cap",
      value:
        c.marketCap != null
          ? c.marketCap > 1e12
            ? `TZS ${(c.marketCap / 1e12).toFixed(2)}T`
            : c.marketCap > 1e9
              ? `TZS ${(c.marketCap / 1e9).toFixed(2)}B`
              : `TZS ${c.marketCap.toLocaleString()}`
          : "N/A",
      sub: `High: TZS ${c.high?.toLocaleString() ?? "N/A"} | Low: TZS ${c.low?.toLocaleString() ?? "N/A"}`,
      subColor: "text-muted-foreground",
      icon: DollarSign,
      iconColor: "text-chart-4",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className={cn("text-xs", s.subColor)}>{s.sub}</p>
              </div>
              <s.icon className={cn("h-5 w-5", s.iconColor)} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

