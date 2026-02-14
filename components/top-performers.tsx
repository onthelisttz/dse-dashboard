"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatPercent } from "@/lib/utils"
import { TrendingUp, TrendingDown, Trophy, Eye, Check } from "lucide-react"
import type { MarketDataItem } from "@/lib/types"

interface TopPerformersProps {
  data: MarketDataItem[] | undefined
  isLoading: boolean
  selectedId: number
  onSelect: (id: number) => void
}

export function TopPerformers({ data, isLoading, selectedId, onSelect }: TopPerformersProps) {
  const topGainers = useMemo(() => {
    if (!data) return []
    return [...data]
      .filter((item) => (item.change ?? 0) > 0)
      .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
      .slice(0, 10)
  }, [data])

  const topLosers = useMemo(() => {
    if (!data) return []
    return [...data]
      .filter((item) => (item.change ?? 0) < 0)
      .sort((a, b) => (a.change ?? 0) - (b.change ?? 0))
      .slice(0, 10)
  }, [data])

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="border-border bg-card">
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-32 bg-muted" />
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-10 w-full bg-muted" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Top Gainers */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-gain" />
            Top Gainers (Today)
            <Badge variant="outline" className="ml-auto border-gain/30 bg-gain/10 text-gain text-xs">
              {topGainers.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topGainers.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">No gainers today</p>
          ) : (
            <div className="max-h-[300px] overflow-auto">
              {topGainers.map((item, i) => {
                const pctChange = (item.change ?? 0)
                const isSelected = selectedId === item.company.id
                return (
                  <button
                    key={item.company.id}
                    onClick={() => onSelect(item.company.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0",
                      isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                    )}
                  >
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      i === 0 ? "bg-gain/20 text-gain" : "bg-muted text-muted-foreground"
                    )}>
                      {i === 0 ? <Trophy className="h-3 w-3" /> : i + 1}
                    </span>
                    <div className="flex flex-1 items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-foreground">{item.company.symbol}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          TZS {item.marketPrice?.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gain">
                          {formatPercent(pctChange, { signed: true })}%
                        </span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground"
                      )}
                    >
                      {isSelected ? <Check className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Losers */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingDown className="h-4 w-4 text-loss" />
            Top Losers (Today)
            <Badge variant="outline" className="ml-auto border-loss/30 bg-loss/10 text-loss text-xs">
              {topLosers.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topLosers.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">No losers today</p>
          ) : (
            <div className="max-h-[300px] overflow-auto">
              {topLosers.map((item, i) => {
                const pctChange = (item.change ?? 0)
                const isSelected = selectedId === item.company.id
                return (
                  <button
                    key={item.company.id}
                    onClick={() => onSelect(item.company.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0",
                      isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                    )}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="flex flex-1 items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-foreground">{item.company.symbol}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          TZS {item.marketPrice?.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-loss">
                          {formatPercent(pctChange, { signed: true })}%
                        </span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground"
                      )}
                    >
                      {isSelected ? <Check className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

