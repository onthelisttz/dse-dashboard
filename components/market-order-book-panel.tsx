"use client"

import { useMemo } from "react"
import useSWR from "swr"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import type { MarketDataItem } from "@/lib/types"

interface MarketOrderRow {
  buyPrice: number
  buyQuantity: number
  sellPrice: number
  sellQuantity: number
}

interface MarketOrdersPayload {
  bestSellPrice: number
  bestBuyPrice: number
  orders: MarketOrderRow[]
}

interface MarketOrderBookPanelProps {
  company: MarketDataItem | null
  isOpen: boolean
  onClose: () => void
}

async function orderBookFetcher(url: string): Promise<MarketOrdersPayload> {
  const response = await fetch(url)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "Failed to fetch order book")
        : "Failed to fetch order book"
    throw new Error(errorMessage)
  }

  return payload as MarketOrdersPayload
}

function formatCellValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-"
  return value.toLocaleString()
}

function formatShares(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A"
  if (value === 0) return "0"
  if (value < 0) return "N/A"
  return value.toLocaleString()
}

function formatPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-"
  return value.toLocaleString()
}

export function MarketOrderBookPanel({ company, isOpen, onClose }: MarketOrderBookPanelProps) {
  const orderBookKey = isOpen && company ? `/api/market-orders/companies/${company.company.id}` : null

  const {
    data: orderBookData,
    isLoading: orderBookLoading,
    error: orderBookError,
    mutate: refreshOrderBook,
  } = useSWR<MarketOrdersPayload>(orderBookKey, orderBookFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshInterval: isOpen ? 60000 : 0,
    dedupingInterval: 5000,
  })

  const columnTotals = useMemo(() => {
    const orders = orderBookData?.orders ?? []
    return orders.reduce(
      (acc, row) => ({
        buyQuantity: acc.buyQuantity + (row.buyQuantity > 0 ? row.buyQuantity : 0),
        buyPrice: acc.buyPrice + (row.buyPrice > 0 ? row.buyPrice : 0),
        sellPrice: acc.sellPrice + (row.sellPrice > 0 ? row.sellPrice : 0),
        sellQuantity: acc.sellQuantity + (row.sellQuantity > 0 ? row.sellQuantity : 0),
      }),
      { buyQuantity: 0, buyPrice: 0, sellPrice: 0, sellQuantity: 0 }
    )
  }, [orderBookData?.orders])

  const bestBuyPrice = orderBookData?.bestBuyPrice ?? company?.bestBidPrice
  const bestSellPrice = orderBookData?.bestSellPrice ?? company?.bestOfferPrice

  if (!isOpen || !company) return null

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full overflow-hidden border-l border-border bg-card shadow-xl lg:w-[28rem]">
      <Card className="flex h-full flex-col rounded-none border-0 bg-card">
        <CardHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-left text-lg font-semibold text-foreground">
              {company.company.symbol} Details
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              aria-label="Close details panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
              <p className="text-muted-foreground">Price</p>
              <p className="font-semibold text-foreground">{formatPrice(company.marketPrice)}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
              <p className="text-muted-foreground">Shares on Offer</p>
              <p className="font-semibold text-foreground">
                {formatShares(company.bestOfferQuantity ?? company.security?.bestOfferQuantity)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
              <p className="text-muted-foreground">Best Buy Price</p>
              <p className="font-semibold text-gain">{formatPrice(bestBuyPrice)}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
              <p className="text-muted-foreground">Best Sell Price</p>
              <p className="font-semibold text-loss">{formatPrice(bestSellPrice)}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Order Book</p>
            {orderBookError && (
              <Button variant="ghost" size="sm" onClick={() => void refreshOrderBook()}>
                Retry
              </Button>
            )}
          </div>

          {orderBookError ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Failed to load order book.
            </div>
          ) : (
            <Table containerClassName="min-h-0 flex-1 overflow-auto rounded-md border border-border">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
                    Buy Qty
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card text-right text-xs text-muted-foreground">
                    Buy Price
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card text-right text-xs text-muted-foreground">
                    Sell Price
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card text-right text-xs text-muted-foreground">
                    Sell Qty
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderBookLoading
                  ? Array.from({ length: 10 }).map((_, index) => (
                      <TableRow key={`order-skeleton-${index}`} className="border-border">
                        <TableCell><Skeleton className="h-4 w-14 bg-muted" /></TableCell>
                        <TableCell><Skeleton className="ml-auto h-4 w-14 bg-muted" /></TableCell>
                        <TableCell><Skeleton className="ml-auto h-4 w-14 bg-muted" /></TableCell>
                        <TableCell><Skeleton className="ml-auto h-4 w-14 bg-muted" /></TableCell>
                      </TableRow>
                    ))
                  : orderBookData?.orders?.map((order, index) => (
                      <TableRow key={`order-${index}`} className="border-border">
                        <TableCell className="text-sm text-gain">{formatCellValue(order.buyQuantity)}</TableCell>
                        <TableCell className="text-right text-sm text-gain">{formatCellValue(order.buyPrice)}</TableCell>
                        <TableCell className="text-right text-sm text-loss">{formatCellValue(order.sellPrice)}</TableCell>
                        <TableCell className="text-right text-sm text-loss">{formatCellValue(order.sellQuantity)}</TableCell>
                      </TableRow>
                    )) ?? null}
                {!orderBookLoading &&
                  !orderBookError &&
                  (!orderBookData?.orders || orderBookData.orders.length === 0) && (
                    <TableRow className="border-border">
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No order book entries.
                      </TableCell>
                    </TableRow>
                  )}
              </TableBody>
              <TableFooter className="sticky bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur">
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell className="font-semibold text-gain">Total {formatCellValue(columnTotals.buyQuantity)}</TableCell>
                  <TableCell className="text-right font-semibold text-gain">{formatCellValue(columnTotals.buyPrice)}</TableCell>
                  <TableCell className="text-right font-semibold text-loss">{formatCellValue(columnTotals.sellPrice)}</TableCell>
                  <TableCell className="text-right font-semibold text-loss">{formatCellValue(columnTotals.sellQuantity)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </aside>
  )
}
