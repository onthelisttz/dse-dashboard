"use client"

import { useState, useMemo } from "react"
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
import { cn, formatPercent } from "@/lib/utils"
import { ArrowUp, ArrowDown, ArrowUpDown, Eye, Check } from "lucide-react"
import type { MarketDataItem } from "@/lib/types"

interface MarketTableProps {
  data: MarketDataItem[] | undefined
  isLoading: boolean
  selectedId: number
  onSelect: (id: number) => void
}

type SortKey = "symbol" | "marketPrice" | "change" | "bestOfferQuantity" | "openingPrice" | "high" | "low" | "volume" | "marketCap"
type SortDir = "asc" | "desc"

function getOfferShares(item: MarketDataItem): number | null {
  return item.bestOfferQuantity ?? item.security?.bestOfferQuantity ?? null
}

function getSortValue(item: MarketDataItem, key: SortKey): number | string {
  switch (key) {
    case "symbol": return item.company.symbol
    case "marketPrice": return item.marketPrice ?? 0
    case "change": return item.change ?? 0
    case "openingPrice": return item.openingPrice ?? 0
    case "high": return item.high ?? 0
    case "low": return item.low ?? 0
    case "volume": return item.volume ?? 0
    case "marketCap": return item.marketCap ?? 0
    case "bestOfferQuantity": return getOfferShares(item) ?? 0
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

export function MarketTable({ data, isLoading, selectedId, onSelect }: MarketTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("symbol")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

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

  const hasOfferShares = useMemo(() => {
    if (!data || data.length === 0) return false
    return data.some((item) => getOfferShares(item) != null)
  }, [data])

  const columns: { key: SortKey; label: string; hiddenClass?: string }[] = [
    { key: "symbol", label: "Security" },
    { key: "marketPrice", label: "Price" },
    { key: "change", label: "Change" },
    { key: "bestOfferQuantity", label: "Offer Shares", hiddenClass: "hidden md:table-cell" },
    { key: "openingPrice", label: "Open", hiddenClass: "hidden md:table-cell" },
    { key: "high", label: "High", hiddenClass: "hidden lg:table-cell" },
    { key: "low", label: "Low", hiddenClass: "hidden lg:table-cell" },
    { key: "volume", label: "Volume", hiddenClass: "hidden md:table-cell" },
    { key: "marketCap", label: "MCap", hiddenClass: "hidden xl:table-cell" },
  ]

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">Market Overview</CardTitle>
        {!isLoading && data && data.length > 0 && !hasOfferShares && (
          <p className="mt-1 text-xs text-muted-foreground">
            Available shares on offer are not provided by the current market-data API response.
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
          <Table containerClassName="max-h-[400px] overflow-auto">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "sticky top-0 z-10 cursor-pointer select-none bg-card text-xs text-muted-foreground transition-colors hover:text-foreground",
                      col.key !== "symbol" && "text-right",
                      col.hiddenClass
                    )}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon active={sortKey === col.key} direction={sortDir} />
                  </TableHead>
                ))}
                <TableHead className="sticky right-0 top-0 z-10 w-12 bg-card text-right text-xs text-muted-foreground">
                  View
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      {columns.map((col) => (
                        <TableCell key={col.key} className={col.hiddenClass}>
                          <Skeleton className={cn("h-4 bg-muted", col.key === "symbol" ? "w-12" : "ml-auto w-16")} />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Skeleton className="ml-auto h-7 w-7 rounded-full bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
                : sorted.map((item) => {
                    const offerShares = getOfferShares(item)
                    return (
                      <TableRow
                        key={item.company.id}
                        className={cn(
                          "cursor-pointer border-border transition-colors",
                          selectedId === item.company.id
                            ? "bg-primary/5"
                            : "hover:bg-muted/50"
                        )}
                        onClick={() => onSelect(item.company.id)}
                      >
                        <TableCell className="py-2.5">
                          <span className="text-sm font-semibold text-foreground">{item.company.symbol}</span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-sm font-medium text-foreground">
                          {item.marketPrice?.toLocaleString() ?? "N/A"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "py-2.5 text-right text-sm font-medium",
                            item.change > 0 ? "text-gain" : item.change < 0 ? "text-loss" : "text-muted-foreground"
                          )}
                        >
                          {formatPercent(item.change ?? 0, { signed: true })}%
                        </TableCell>
                        <TableCell className="hidden py-2.5 text-right text-sm text-muted-foreground md:table-cell">
                          {offerShares != null ? offerShares.toLocaleString() : "N/A"}
                        </TableCell>
                        <TableCell className="hidden py-2.5 text-right text-sm text-muted-foreground md:table-cell">
                          {item.openingPrice?.toLocaleString() ?? "N/A"}
                        </TableCell>
                        <TableCell className="hidden py-2.5 text-right text-sm text-muted-foreground lg:table-cell">
                          {item.high?.toLocaleString() ?? "N/A"}
                        </TableCell>
                        <TableCell className="hidden py-2.5 text-right text-sm text-muted-foreground lg:table-cell">
                          {item.low?.toLocaleString() ?? "N/A"}
                        </TableCell>
                        <TableCell className="hidden py-2.5 text-right text-sm text-muted-foreground md:table-cell">
                          {item.volume?.toLocaleString() ?? "N/A"}
                        </TableCell>
                        <TableCell className="hidden py-2.5 text-right text-sm text-muted-foreground xl:table-cell">
                          {item.marketCap != null
                            ? item.marketCap > 1e12
                              ? `${(item.marketCap / 1e12).toFixed(1)}T`
                              : item.marketCap > 1e9
                                ? `${(item.marketCap / 1e9).toFixed(1)}B`
                                : item.marketCap.toLocaleString()
                            : "N/A"}
                        </TableCell>
                        <TableCell className="sticky right-0 bg-card py-2.5 text-right">
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
                              onSelect(item.company.id)
                            }}
                            aria-label={`View ${item.company.symbol} details`}
                          >
                            {selectedId === item.company.id ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
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

