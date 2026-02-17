"use client"

import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowUp, ArrowDown, ArrowUpDown, Check, Eye, Info } from "lucide-react"
import type { MarketDataItem } from "@/lib/types"

interface MarketTableProps {
  data: MarketDataItem[] | undefined
  isLoading: boolean
  selectedId: number
  onSelect: (id: number) => void
  detailsCompanyId: number | null
  onOpenDetails: (company: MarketDataItem) => void
}

type SortKey =
  | "symbol"
  | "price"
  | "changeValue"
  | "high"
  | "low"
  | "time"
  | "volume"
  | "sharesOnOffer"
  | "bidQuantity"
  | "minBuy"
  | "maxBuy"
  | "marketCap"
type SortDir = "asc" | "desc"

function getTimeSortValue(item: MarketDataItem): number {
  const raw = item.tradeTime ?? item.lastTradeDate
  if (!raw) return 0
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDisplayTime(tradeTime: string | null | undefined, lastTradeDate: string | null | undefined): string {
  if (typeof tradeTime === "string" && tradeTime.trim().length > 0) {
    const raw = tradeTime.trim()
    const twelveHour = /^(\d{1,2}:\d{2})(?::\d{2})?\s*([APap][Mm])$/.exec(raw)
    if (twelveHour) return `${twelveHour[1]} ${twelveHour[2].toUpperCase()}`

    const twentyFourHour = /^(\d{1,2}:\d{2})(?::\d{2})$/.exec(raw)
    if (twentyFourHour) return twentyFourHour[1]

    if (raw.includes("T")) {
      const parsed = new Date(raw)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    }

    return raw
  }

  return lastTradeDate ?? "N/A"
}

function getSortValue(item: MarketDataItem, key: SortKey): number | string {
  switch (key) {
    case "symbol":
      return item.company.symbol
    case "price":
      return item.marketPrice ?? 0
    case "changeValue":
      return item.changeValue ?? 0
    case "high":
      return item.high ?? 0
    case "low":
      return item.low ?? 0
    case "time":
      return getTimeSortValue(item)
    case "volume":
      return item.volume ?? 0
    case "sharesOnOffer":
      return item.bestOfferQuantity ?? 0
    case "bidQuantity":
      return item.bestBidQuantity ?? 0
    case "minBuy":
      return item.minLimit ?? 0
    case "maxBuy":
      return item.maxLimit ?? 0
    case "marketCap":
      return item.marketCap ?? 0
  }
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDir }) {
  if (!active) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />
  return direction === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3 text-primary" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3 text-primary" />
  )
}

export function MarketTable({
  data,
  isLoading,
  selectedId,
  onSelect,
  detailsCompanyId,
  onOpenDetails,
}: MarketTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("symbol")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [activeRowId, setActiveRowId] = useState<number | null>(null)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir(key === "symbol" ? "asc" : "desc")
    }
  }

  const sorted = useMemo(() => {
    if (!data) return []
    return [...data].sort((a, b) => {
      const va = getSortValue(a, sortKey)
      const vb = getSortValue(b, sortKey)
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      const na = va as number
      const nb = vb as number
      return sortDir === "asc" ? na - nb : nb - na
    })
  }, [data, sortKey, sortDir])

  const columns: { key: SortKey; label: string }[] = [
    { key: "symbol", label: "Security" },
    { key: "price", label: "Price" },
    { key: "changeValue", label: "Change" },
    { key: "high", label: "High" },
    { key: "low", label: "Low" },
    { key: "time", label: "Time" },
    { key: "volume", label: "Volume" },
    { key: "sharesOnOffer", label: "Shares on Offer" },
    { key: "bidQuantity", label: "Bid Qty" },
    { key: "minBuy", label: "Min Buy" },
    { key: "maxBuy", label: "Max Buy" },
    { key: "marketCap", label: "MCap" },
  ]

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">Market Overview</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="min-w-[1360px]" containerClassName="max-h-[400px] overflow-auto">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "sticky top-0 z-10 cursor-pointer select-none bg-card text-xs text-muted-foreground transition-colors hover:text-foreground",
                    col.key !== "symbol" && "text-right"
                  )}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} direction={sortDir} />
                </TableHead>
              ))}
              <TableHead className="sticky right-0 top-0 z-10 w-24 bg-card text-right text-xs text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        <Skeleton
                          className={cn(
                            "h-4 bg-muted",
                            col.key === "symbol" ? "w-12" : "ml-auto w-16"
                          )}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <Skeleton className="ml-auto h-7 w-16 rounded-full bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              : sorted.map((item) => {
                  const changeValue = item.changeValue
                  const timeValue = formatDisplayTime(item.tradeTime, item.lastTradeDate)
                  const isDetailsOpenForRow = detailsCompanyId === item.company.id
                  return (
                    <TableRow
                      key={item.company.id}
                      className={cn(
                        "cursor-pointer border-border transition-colors",
                        activeRowId === item.company.id
                          ? "bg-primary/10"
                          : selectedId === item.company.id
                            ? "bg-primary/5"
                            : "hover:bg-muted/50"
                      )}
                      onClick={() => setActiveRowId(item.company.id)}
                    >
                      <TableCell className="py-2.5">
                        <span className="text-sm font-semibold text-foreground">
                          {item.company.symbol}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm font-medium text-foreground">
                        {item.marketPrice?.toLocaleString() ?? "N/A"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-2.5 text-right text-sm font-medium",
                          typeof changeValue === "number" && changeValue > 0
                            ? "text-gain"
                            : typeof changeValue === "number" && changeValue < 0
                              ? "text-loss"
                              : "text-muted-foreground"
                        )}
                      >
                        {typeof changeValue === "number"
                          ? `${changeValue > 0 ? "+" : ""}${changeValue}`
                          : "N/A"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground">
                        {item.high?.toLocaleString() ?? "N/A"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground">
                        {item.low?.toLocaleString() ?? "N/A"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                        {timeValue}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                        {item.volume?.toLocaleString() ?? "N/A"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                        {item.bestOfferQuantity?.toLocaleString() ?? "N/A"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                        {item.bestBidQuantity?.toLocaleString() ?? "N/A"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                        {item.minLimit?.toLocaleString() ?? "N/A"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                        {item.maxLimit?.toLocaleString() ?? "N/A"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-sm text-muted-foreground">
                        {item.marketCap != null
                          ? item.marketCap > 1e12
                            ? `${(item.marketCap / 1e12).toFixed(1)}T`
                            : item.marketCap > 1e9
                              ? `${(item.marketCap / 1e9).toFixed(1)}B`
                              : item.marketCap.toLocaleString()
                          : "N/A"}
                      </TableCell>
                      <TableCell className="sticky right-0 bg-card/95 py-2.5 text-right backdrop-blur">
                        <div className="ml-auto flex w-fit items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-7 w-7 rounded-full border",
                              selectedId === item.company.id
                                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                                : "border-border text-muted-foreground hover:bg-muted"
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              setActiveRowId(item.company.id)
                              onSelect(item.company.id)
                            }}
                            aria-label={`View ${item.company.symbol}`}
                            title={`View ${item.company.symbol}`}
                          >
                            {selectedId === item.company.id ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-7 w-7 rounded-full border",
                              isDetailsOpenForRow
                                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                                : "border-border text-muted-foreground hover:bg-muted"
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              setActiveRowId(item.company.id)
                              onOpenDetails(item)
                            }}
                            aria-label={`Open ${item.company.symbol} details`}
                            title={`Open ${item.company.symbol} details`}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
