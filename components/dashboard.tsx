"use client"

import { useEffect, useMemo, useState } from "react"
import { useMarketData, useStatistics, useMarketMeta } from "@/lib/use-dse-data"
import { StatCards } from "@/components/stat-cards"
import { CompanySelector } from "@/components/company-selector"
import { PriceChart } from "@/components/price-chart"
import { CompanyComparison } from "@/components/company-comparison"
import { MarketTable } from "@/components/market-table"
import { MarketOrderBookPanel } from "@/components/market-order-book-panel"
import { OrderBook } from "@/components/order-book"
import { TopPerformers } from "@/components/top-performers"
import { PriceAlertsPanel } from "@/components/price-alerts-panel"
import { ThemeToggle } from "@/components/theme-toggle"
import { LogoMark } from "@/components/logo-mark"
import { ProfileMenu } from "@/components/profile-menu"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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

const REFRESH_COOLDOWN_MS = 30_000

function formatCompactNumber(value: number | null | undefined, withCurrency = false): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A"

  const abs = Math.abs(value)
  let scaled = value
  let suffix = ""

  if (abs >= 1_000_000_000_000) {
    scaled = value / 1_000_000_000_000
    suffix = "T"
  } else if (abs >= 1_000_000_000) {
    scaled = value / 1_000_000_000
    suffix = "B"
  } else if (abs >= 1_000_000) {
    scaled = value / 1_000_000
    suffix = "M"
  }

  const absScaled = Math.abs(scaled)
  const fractionDigits = absScaled >= 100 ? 0 : absScaled >= 10 ? 1 : 2
  const compactValue = scaled.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })

  return `${withCurrency ? "TZS " : ""}${compactValue}${suffix}`
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "N/A"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function Dashboard({ user }: DashboardProps) {
  const { data: marketData, isLoading: marketLoading, mutate: mutateMarketData } = useMarketData()
  const { data: marketMeta, mutate: mutateMarketMeta } = useMarketMeta()
  const {
    alerts,
    isLoading: alertsLoading,
    mutate: mutateAlerts,
    createAlert,
    updateAlert,
    deleteAlert,
  } = usePriceAlerts()
  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(12) // TBL default
  const [orderBookDetailsCompanyId, setOrderBookDetailsCompanyId] = useState<number | null>(null)
  const [timeframe, setTimeframe] = useState<"daily" | "weekly">("daily")
  const [days, setDays] = useState<number>(365)
  const [showAlertsOnChart, setShowAlertsOnChart] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null)
  const [refreshCooldownMs, setRefreshCooldownMs] = useState(0)
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
  const detailsCompany = useMemo(
    () =>
      orderBookDetailsCompanyId == null
        ? null
        : companies.find((item) => item.company.id === orderBookDetailsCompanyId) ?? null,
    [companies, orderBookDetailsCompanyId]
  )
  const isDetailsPanelOpen = orderBookDetailsCompanyId != null

  const companySymbol = selectedCompany?.company.symbol ?? companies[0]?.company.symbol ?? "TBL"
  const companyName = selectedCompany?.company.name ?? companies[0]?.company.name ?? companySymbol

  const { data: statsData, isLoading: statsLoading, mutate: mutateStatistics } = useStatistics(
    selectedCompanyId,
    days,
    companySymbol
  )

  const marketOpen = marketMeta?.marketOpen ?? true
  const updatedAtLabel = formatDateLabel(marketMeta?.updatedAt)
  const isRefreshLocked = refreshCooldownMs > 0
  const refreshCooldownSeconds = Math.ceil(refreshCooldownMs / 1000)

  useEffect(() => {
    if (nextRefreshAt == null) return

    const updateCooldown = () => {
      const remaining = Math.max(0, nextRefreshAt - Date.now())
      setRefreshCooldownMs(remaining)
      if (remaining === 0) setNextRefreshAt(null)
    }

    updateCooldown()
    const intervalId = window.setInterval(updateCooldown, 250)
    return () => window.clearInterval(intervalId)
  }, [nextRefreshAt])

  const handleRefresh = () => {
    if (isRefreshLocked || isRefreshing) return

    setNextRefreshAt(Date.now() + REFRESH_COOLDOWN_MS)
    setRefreshCooldownMs(REFRESH_COOLDOWN_MS)
    setIsRefreshing(true)

    void Promise.all([mutateMarketData(), mutateMarketMeta(), mutateStatistics(), mutateAlerts()]).finally(
      () => setIsRefreshing(false)
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">

      {/* Header */}
      <header
        className={cn(
          "flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4",
          isDetailsPanelOpen && "lg:pr-[29rem]"
        )}
      >
        <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <LogoMark />
            <div className="min-w-0">
              <h1 className="inline-flex items-center gap-2 text-base font-bold text-foreground sm:text-lg">
                <span className="hidden truncate sm:inline">DSE Market Dashboard</span>
                <span
                  className="inline-flex items-center"
                  role="status"
                  aria-live="polite"
                  aria-label={marketOpen ? "Market open" : "Market closed"}
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span
                      className={cn(
                        "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                        marketOpen ? "bg-gain/80" : "bg-loss/80"
                      )}
                    />
                    <span
                      className={cn(
                        "relative inline-flex h-2.5 w-2.5 rounded-full",
                        marketOpen ? "bg-gain" : "bg-loss"
                      )}
                    />
                  </span>
                  <span className="sr-only">{marketOpen ? "Open" : "Closed"}</span>
                </span>
              </h1>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block sm:text-xs">
                Updated: {updatedAtLabel}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:hidden">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshLocked || isRefreshing}
              title={
                isRefreshLocked
                  ? `Refresh available in ${refreshCooldownSeconds}s`
                  : isRefreshing
                    ? "Refreshing..."
                    : "Refresh now"
              }
              className="h-8 w-8 border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              <span className="sr-only">
                {isRefreshLocked ? `Refresh available in ${refreshCooldownSeconds} seconds` : "Refresh data"}
              </span>
            </Button>
            <ThemeToggle compact />
            <ProfileMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} compact />
          </div>
        </div>

        <p className="w-full text-[10px] text-muted-foreground sm:hidden">
          Updated: {updatedAtLabel}
        </p>

        <div className="sm:hidden">
          <CompanySelector
            companies={companies}
            selectedId={selectedCompanyId}
            onSelect={setSelectedCompanyId}
          />
        </div>

        <div className="hidden w-full items-center gap-3 sm:flex sm:w-auto">
          <CompanySelector
            companies={companies}
            selectedId={selectedCompanyId}
            onSelect={setSelectedCompanyId}
          />
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshLocked || isRefreshing}
              title={
                isRefreshLocked
                  ? `Refresh available in ${refreshCooldownSeconds}s`
                  : isRefreshing
                    ? "Refreshing..."
                    : "Refresh now"
              }
              className="h-9 w-9 border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              <span className="sr-only">
                {isRefreshLocked ? `Refresh available in ${refreshCooldownSeconds} seconds` : "Refresh data"}
              </span>
            </Button>
            <ThemeToggle />
            <ProfileMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
          </div>
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          isDetailsPanelOpen && "lg:pr-[29rem]"
        )}
      >
        {/* Main Content */}
        <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {marketMeta?.overview && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Turnover</p>
              <p className="text-sm font-semibold text-foreground">
                {formatCompactNumber(marketMeta.overview.turnover, true)}
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
              <p className="text-xs text-muted-foreground">MCap Aggregate</p>
              <p className="text-sm font-semibold text-foreground">
                {formatCompactNumber(marketMeta.overview.mCapAggregate)}
              </p>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <StatCards selectedCompany={selectedCompany} />

        {/* Chart + Order Book */}
        <div
          id="price-chart-section"
          className={cn(
            "grid min-w-0 gap-4",
            isDetailsPanelOpen ? "2xl:grid-cols-3" : "lg:grid-cols-3"
          )}
        >
          <div className={cn("min-w-0", isDetailsPanelOpen ? "2xl:col-span-2" : "lg:col-span-2")}>
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
          <div className="min-w-0">
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
          detailsCompanyId={orderBookDetailsCompanyId}
          onOpenDetails={(company) => setOrderBookDetailsCompanyId(company.company.id)}
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
        {/* Footer */}
        <footer className="border-t border-border px-4 py-3 sm:px-0">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <LogoMark className="h-5 w-5 rounded-md" iconClassName="h-3 w-3" />
              <span className="text-xs font-medium text-muted-foreground">DSE Market Dashboard</span>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Data sourced from Dar es Salaam Stock Exchange (DSE). Prices may be delayed.
              Auto-refreshes every 1 hour.
            </p>
          </div>
        </footer>
        </main>
      </div>

      <MarketOrderBookPanel
        company={detailsCompany}
        isOpen={isDetailsPanelOpen}
        onClose={() => setOrderBookDetailsCompanyId(null)}
      />
    </div>
  )
}
