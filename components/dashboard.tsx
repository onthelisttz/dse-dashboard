"use client"

import { useState, useMemo } from "react"
import { useMarketData, useStatistics, useMarketMeta } from "@/lib/use-dse-data"
import { StatCards } from "@/components/stat-cards"
import { CompanySelector } from "@/components/company-selector"
import { PriceChart } from "@/components/price-chart"
import { CompanyComparison } from "@/components/company-comparison"
import { MarketTable } from "@/components/market-table"
import { OrderBook } from "@/components/order-book"
import { TopPerformers } from "@/components/top-performers"
import { ThemeToggle } from "@/components/theme-toggle"
import { LogoMark } from "@/components/logo-mark"
import { Badge } from "@/components/ui/badge"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Dashboard() {
  const { data: marketData, isLoading: marketLoading, mutate } = useMarketData()
  const { data: marketMeta } = useMarketMeta()
  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(12) // TBL default
  const [timeframe, setTimeframe] = useState<"daily" | "weekly">("daily")
  const [days, setDays] = useState<number>(365)

  const selectedCompany = useMemo(
    () => marketData?.find((item) => item.company.id === selectedCompanyId) ?? null,
    [marketData, selectedCompanyId]
  )

  const companySymbol = selectedCompany?.company.symbol ?? "TBL"

  const { data: statsData, isLoading: statsLoading } = useStatistics(
    selectedCompanyId,
    days,
    selectedCompany?.company.symbol
  )

  const marketOpen = marketMeta?.marketOpen ?? true
  const statusLabel = marketOpen ? "Open" : "Closed"
  const lastTradeDateLabel = marketMeta?.lastTradeDate
    ? new Date(marketMeta.lastTradeDate).toLocaleDateString()
    : "N/A"

  const handleRefresh = () => {
    mutate()
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="text-lg font-bold text-foreground">DSE Market Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Dar es Salaam Stock Exchange - Last trade date: {lastTradeDateLabel}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`ml-2 text-xs ${
              marketOpen
                ? "border-gain/30 bg-gain/10 text-gain"
                : "border-loss/30 bg-loss/10 text-loss"
            }`}
          >
            {statusLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <CompanySelector
            companies={marketData ?? []}
            selectedId={selectedCompanyId}
            onSelect={setSelectedCompanyId}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            className="border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh data</span>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        {marketMeta?.overview && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Turnover</p>
              <p className="text-sm font-semibold text-foreground">
                TZS {marketMeta.overview.turnover.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Volume</p>
              <p className="text-sm font-semibold text-foreground">
                {marketMeta.overview.volume.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Deals</p>
              <p className="text-sm font-semibold text-foreground">
                {marketMeta.overview.deals.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">MCap Aggregate (Bn)</p>
              <p className="text-sm font-semibold text-foreground">
                {marketMeta.overview.mCapAggregate.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <StatCards selectedCompany={selectedCompany} />

        {/* Chart + Order Book */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PriceChart
              data={statsData}
              isLoading={statsLoading}
              companies={marketData ?? []}
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={setSelectedCompanyId}
              companySymbol={companySymbol}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              days={days}
              onDaysChange={setDays}
            />
          </div>
          <div>
            <OrderBook selectedCompany={selectedCompany} />
          </div>
        </div>

        {/* Comparison */}
        <CompanyComparison
          data={marketData}
          isLoading={marketLoading}
          primaryCompanyId={selectedCompanyId}
          onPrimaryCompanySelect={setSelectedCompanyId}
          days={days}
          timeframe={timeframe}
        />

        {/* Top Performers */}
        <TopPerformers
          data={marketData}
          isLoading={marketLoading}
          selectedId={selectedCompanyId}
          onSelect={setSelectedCompanyId}
        />

        {/* Market Table */}
        <MarketTable
          data={marketData}
          isLoading={marketLoading}
          selectedId={selectedCompanyId}
          onSelect={setSelectedCompanyId}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-3 sm:px-6">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-5 rounded-md" iconClassName="h-3 w-3" />
            <span className="text-xs font-medium text-muted-foreground">DSE Market Dashboard</span>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Data sourced from Dar es Salaam Stock Exchange (DSE). Prices may be delayed.
            Auto-refreshes every 60 seconds.
          </p>
        </div>
      </footer>
    </div>
  )
}
