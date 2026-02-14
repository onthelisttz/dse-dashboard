"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { MarketDataItem } from "@/lib/types"

interface OrderBookProps {
  selectedCompany: MarketDataItem | null
}

export function OrderBook({ selectedCompany }: OrderBookProps) {
  if (!selectedCompany) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Order Book</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a company to view order book</p>
        </CardContent>
      </Card>
    )
  }

  const c = selectedCompany

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Order Book - {c.company.symbol}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Best Bid
          </h4>
          <div className="flex items-center justify-between rounded-md bg-gain/10 px-3 py-2">
            <div>
              <p className="text-xs text-muted-foreground">Price</p>
              <p className="text-sm font-bold text-gain">
                TZS {c.bestBidPrice?.toLocaleString() ?? "N/A"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p className="text-sm font-semibold text-foreground">
                {c.bestBidQuantity?.toLocaleString() ?? "N/A"}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Best Offer
          </h4>
          <div className="flex items-center justify-between rounded-md bg-loss/10 px-3 py-2">
            <div>
              <p className="text-xs text-muted-foreground">Price</p>
              <p className="text-sm font-bold text-loss">
                TZS {c.bestOfferPrice?.toLocaleString() ?? "N/A"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p className="text-sm font-semibold text-foreground">
                {c.bestOfferQuantity?.toLocaleString() ?? "N/A"}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Spread
          </h4>
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">Bid-Ask Spread</p>
            <p className="text-sm font-semibold text-foreground">
              TZS{" "}
              {c.bestOfferPrice != null && c.bestBidPrice != null
                ? (c.bestOfferPrice - c.bestBidPrice).toLocaleString()
                : "N/A"}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Security Details
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-muted px-2 py-1.5">
              <span className="text-muted-foreground">Security ID</span>
              <p className="font-medium text-foreground">{c.security?.securityId ?? "N/A"}</p>
            </div>
            <div className="rounded bg-muted px-2 py-1.5">
              <span className="text-muted-foreground">Type</span>
              <p className="font-medium text-foreground">{c.security?.securityType ?? "N/A"}</p>
            </div>
            <div className="col-span-2 rounded bg-muted px-2 py-1.5">
              <span className="text-muted-foreground">Description</span>
              <p className="font-medium text-foreground">{c.security?.securityDesc ?? "N/A"}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
