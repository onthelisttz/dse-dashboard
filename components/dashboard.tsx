"use client"

import { useEffect, useMemo, useState } from "react"
import { useMarketData, useStatistics, useMarketMeta } from "@/lib/use-dse-data"
import { StatCards } from "@/components/stat-cards"
import { CompanySelector } from "@/components/company-selector"
import { PriceChart } from "@/components/price-chart"
import { CompanyComparison } from "@/components/company-comparison"
import { MarketTable } from "@/components/market-table"
import { OrderBook } from "@/components/order-book"
import { TopPerformers } from "@/components/top-performers"
import { PriceAlertsPanel } from "@/components/price-alerts-panel"
import { ThemeToggle } from "@/components/theme-toggle"
import { LogoMark } from "@/components/logo-mark"
import { ProfileMenu } from "@/components/profile-menu"
import { Badge } from "@/components/ui/badge"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePriceAlerts } from "@/lib/use-price-alerts"

interface DashboardUser {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
}

interface DashboardProps {
  user: DashboardUser
}

export function Dashboard({ user }: DashboardProps) {
  const { data: marketData, isLoading: marketLoading, mutate } = useMarketData()
  const { data: marketMeta } = useMarketMeta()
  const {
    alerts,
    isLoading: alertsLoading,
    createAlert,
    updateAlert,
    deleteAlert,
  } = usePriceAlerts()
  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(12) // TBL default
  const [timeframe, setTimeframe] = useState<"daily" | "weekly">("daily")
  const [days, setDays] = useState<number>(365)
  const [showAlertsOnChart, setShowAlertsOnChart] = useState(false)
  const companies = marketData ?? []

  useEffect(() => {
    if (companies.length === 0) return
    const exists = companies.some((item) => item.company.id === selectedCompanyId)
    if (!exists) {
      setSelectedCompanyId(companies[0].company.id)
    }
  }, [companies, selectedCompanyId])

  const selectedCompany = useMemo(
    () => companies.find((item) => item.company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId]
  )

  const companySymbol = selectedCompany?.company.symbol ?? companies[0]?.company.symbol ?? "TBL"
  const companyName = selectedCompany?.company.name ?? companies[0]?.company.name ?? companySymbol

  const { data: statsData, isLoading: statsLoading } = useStatistics(
    selectedCompanyId,
    days,
    companySymbol
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
            companies={companies}
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
          <ProfileMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
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
        <div id="price-chart-section" className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PriceChart
              data={statsData}
              isLoading={statsLoading}
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={setSelectedCompanyId}
              companySymbol={companySymbol}
              companyName={companyName}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              days={days}
              onDaysChange={setDays}
              alerts={alerts}
              showAlertsOnChart={showAlertsOnChart}
              onShowAlertsOnChartChange={setShowAlertsOnChart}
              onCreateAlert={createAlert}
              onUpdateAlert={updateAlert}
              onDeleteAlert={deleteAlert}
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

        {/* Price Alerts */}
        <PriceAlertsPanel
          alerts={alerts}
          onSelectCompany={setSelectedCompanyId}
          onRevealChartAlerts={() => setShowAlertsOnChart(true)}
          onUpdateAlert={updateAlert}
          onDeleteAlert={deleteAlert}
          isLoading={alertsLoading}
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
