"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CompanySelector } from "@/components/company-selector"
import { cn } from "@/lib/utils"
import { ChevronDown, GitCompareArrows, Maximize2, Minimize2 } from "lucide-react"
import type { MarketDataItem, StatisticsItem } from "@/lib/types"

interface CompanyComparisonProps {
  data: MarketDataItem[] | undefined
  isLoading: boolean
  primaryCompanyId: number
  onPrimaryCompanySelect: (id: number) => void
  days: number
  timeframe: "daily" | "weekly"
}

const EMPTY_COMPANIES: MarketDataItem[] = []

const LINE_COLORS = [
  "#22c55e",
  "#0ea5e9",
  "#f97316",
  "#eab308",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#f43f5e",
]

type LineSeriesApi = ISeriesApi<"Line">

function areNumberArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function aggregateWeekly(data: StatisticsItem[]): StatisticsItem[] {
  if (data.length === 0) return []
  const weeks: StatisticsItem[][] = []
  let current: StatisticsItem[] = []

  for (const item of data) {
    const d = new Date(item.trade_date)
    if (current.length === 0) {
      current.push(item)
      continue
    }
    const prevDate = new Date(current[0].trade_date)
    const diff = (d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diff < 7) {
      current.push(item)
    } else {
      weeks.push(current)
      current = [item]
    }
  }

  if (current.length > 0) weeks.push(current)

  return weeks.map((week) => ({
    ...week[week.length - 1],
    opening_price: week[0].opening_price,
    closing_price: week[week.length - 1].closing_price,
    high: Math.max(...week.map((w) => w.high)),
    low: Math.min(...week.map((w) => w.low)),
    volume: week.reduce((sum, w) => sum + w.volume, 0),
    turnover: week.reduce((sum, w) => sum + w.turnover, 0),
  }))
}

function dateToTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000)
}

function formatCrosshairDate(time: unknown): string {
  if (typeof time === "number") {
    return new Date(time * 1000).toLocaleDateString()
  }

  if (
    time &&
    typeof time === "object" &&
    "year" in time &&
    "month" in time &&
    "day" in time
  ) {
    const t = time as { year: number; month: number; day: number }
    return new Date(t.year, t.month - 1, t.day).toLocaleDateString()
  }

  return ""
}

export function CompanyComparison({
  data,
  isLoading,
  primaryCompanyId,
  onPrimaryCompanySelect,
  days,
  timeframe,
}: CompanyComparisonProps) {
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<number[]>([])
  const [seriesByCompany, setSeriesByCompany] = useState<Record<number, StatisticsItem[]>>({})
  const [seriesLoading, setSeriesLoading] = useState(false)
  const [hoverDate, setHoverDate] = useState<string>("")
  const [hoverValues, setHoverValues] = useState<Record<number, number>>({})
  const [companyQuery, setCompanyQuery] = useState("")
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [autoAddPrimaryToComparison, setAutoAddPrimaryToComparison] = useState(false)
  const [accordionValue, setAccordionValue] = useState<string | undefined>(undefined)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Map<number, LineSeriesApi>>(new Map())

  const companies = data ?? EMPTY_COMPANIES
  const chartHeight = isFullscreen ? "calc(100vh - 360px)" : "340px"
  const canRenderChart = isFullscreen || accordionValue === "comparison-chart"

  useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreen])

  useEffect(() => {
    if (companies.length === 0) {
      setSelectedCompanyIds((prev) => (prev.length === 0 ? prev : []))
      return
    }

    setSelectedCompanyIds((prev) => {
      const valid = prev.filter((id) => companies.some((c) => c.company.id === id))

      if (!autoAddPrimaryToComparison) {
        return areNumberArraysEqual(valid, prev) ? prev : valid
      }

      const withPrimary = valid.includes(primaryCompanyId)
        ? valid
        : [primaryCompanyId, ...valid]
      return areNumberArraysEqual(withPrimary, prev) ? prev : withPrimary
    })
  }, [companies, primaryCompanyId, autoAddPrimaryToComparison])

  const symbolByCompanyId = useMemo(() => {
    const mapping: Record<number, string> = {}
    companies.forEach((company) => {
      mapping[company.company.id] = company.company.symbol
    })
    return mapping
  }, [companies])

  const colorByCompanyId = useMemo(() => {
    const mapping: Record<number, string> = {}
    companies.forEach((company, index) => {
      mapping[company.company.id] = LINE_COLORS[index % LINE_COLORS.length]
    })
    return mapping
  }, [companies])

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase()
    if (!q) return companies
    return companies.filter((item) => {
      return (
        item.company.symbol.toLowerCase().includes(q) ||
        item.company.name.toLowerCase().includes(q)
      )
    })
  }, [companies, companyQuery])

  const fetchSeries = useCallback(
    async (companyId: number): Promise<StatisticsItem[]> => {
      const symbol = symbolByCompanyId[companyId]
      const target = symbol
        ? `symbol=${encodeURIComponent(symbol)}`
        : `companyId=${companyId}`
      const res = await fetch(`/api/statistics?${target}&days=${days}`)
      if (!res.ok) throw new Error("Failed to fetch statistics")
      const raw = await res.json()
      if (!Array.isArray(raw)) return []

      const cleaned = raw
        .filter(
          (item: StatisticsItem) =>
            item &&
            item.trade_date &&
            item.closing_price > 0 &&
            item.opening_price > 0 &&
            item.high > 0 &&
            item.low > 0
        )
        .sort(
          (a: StatisticsItem, b: StatisticsItem) =>
            new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime()
        )

      return timeframe === "weekly" ? aggregateWeekly(cleaned) : cleaned
    },
    [days, timeframe, symbolByCompanyId]
  )

  useEffect(() => {
    if (selectedCompanyIds.length === 0) {
      setSeriesByCompany((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      setSeriesLoading(false)
      return
    }

    let cancelled = false

    async function loadSeries() {
      setSeriesLoading(true)
      try {
        const results = await Promise.allSettled(
          selectedCompanyIds.map((companyId) => fetchSeries(companyId))
        )
        if (!cancelled) {
          setSeriesByCompany((prev) => {
            const next: Record<number, StatisticsItem[]> = {}
            selectedCompanyIds.forEach((companyId, index) => {
              const result = results[index]
              if (result.status === "fulfilled") {
                next[companyId] = result.value
              } else if (prev[companyId]) {
                next[companyId] = prev[companyId]
              } else {
                next[companyId] = []
              }
            })
            return next
          })
        }
      } catch {
        // allSettled should prevent hard failures from clearing existing data
      } finally {
        if (!cancelled) {
          setSeriesLoading(false)
        }
      }
    }

    loadSeries()

    return () => {
      cancelled = true
    }
  }, [selectedCompanyIds, fetchSeries])

  const hasAnyData = useMemo(
    () => selectedCompanyIds.some((companyId) => (seriesByCompany[companyId]?.length ?? 0) > 0),
    [selectedCompanyIds, seriesByCompany]
  )

  const latestValues = useMemo(() => {
    const values: Record<number, number> = {}
    selectedCompanyIds.forEach((companyId) => {
      const points = seriesByCompany[companyId] ?? []
      if (points.length > 0) {
        values[companyId] = points[points.length - 1].closing_price
      }
    })
    return values
  }, [selectedCompanyIds, seriesByCompany])

  const displayValues = hoverDate ? hoverValues : latestValues
  const displayDateLabel = hoverDate ? hoverDate : "Latest"
  const totalLoading = isLoading

  useEffect(() => {
    const container = chartContainerRef.current
    if (!canRenderChart || !container) {
      if (!canRenderChart && chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
        seriesRefs.current.clear()
      }
      return
    }

    if (container.clientWidth === 0 || container.clientHeight === 0) return

    if (!chartRef.current) {
      chartRef.current = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: isDark ? "#9ca3af" : "#6b7280",
        },
        grid: {
          vertLines: { color: isDark ? "rgba(55, 65, 81, 0.5)" : "rgba(229, 231, 235, 0.5)" },
          horzLines: { color: isDark ? "rgba(55, 65, 81, 0.5)" : "rgba(229, 231, 235, 0.5)" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: isDark ? "#6b7280" : "#9ca3af",
            width: 1,
            style: 2,
            labelBackgroundColor: isDark ? "#374151" : "#e5e7eb",
          },
          horzLine: {
            color: isDark ? "#6b7280" : "#9ca3af",
            width: 1,
            style: 2,
            labelBackgroundColor: isDark ? "#374151" : "#e5e7eb",
          },
        },
        rightPriceScale: {
          borderColor: isDark ? "#374151" : "#e5e7eb",
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        handleScale: {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: {
            time: true,
            price: true,
          },
          axisDoubleClickReset: {
            time: true,
            price: true,
          },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
        timeScale: {
          borderColor: isDark ? "#374151" : "#e5e7eb",
          timeVisible: true,
          secondsVisible: false,
        },
        localization: {
          priceFormatter: (price: number) => `TZS ${price.toLocaleString()}`,
        },
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }

    const chart = chartRef.current

    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#9ca3af" : "#6b7280",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(55, 65, 81, 0.5)" : "rgba(229, 231, 235, 0.5)" },
        horzLines: { color: isDark ? "rgba(55, 65, 81, 0.5)" : "rgba(229, 231, 235, 0.5)" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#374151" : "#e5e7eb",
      },
      timeScale: {
        borderColor: isDark ? "#374151" : "#e5e7eb",
      },
    })

    seriesRefs.current.forEach((series) => chart.removeSeries(series))
    seriesRefs.current.clear()

    if (selectedCompanyIds.length > 0) {
      selectedCompanyIds.forEach((companyId) => {
        const series = chart.addSeries(LineSeries, {
          color: colorByCompanyId[companyId] ?? "#22c55e",
          lineWidth: 2,
          priceFormat: {
            type: "price",
            precision: 0,
            minMove: 1,
          },
        })

        const points = (seriesByCompany[companyId] ?? []).map((item) => ({
          time: dateToTimestamp(item.trade_date) as any,
          value: item.closing_price,
        }))

        series.setData(points)
        seriesRefs.current.set(companyId, series)
      })

      chart.timeScale().fitContent()
    }

    const crosshairHandler = (param: any) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverDate("")
        setHoverValues({})
        return
      }

      const values: Record<number, number> = {}

      selectedCompanyIds.forEach((companyId) => {
        const series = seriesRefs.current.get(companyId)
        if (!series) return
        const point = param.seriesData.get(series) as { value?: number } | { close?: number } | undefined
        if (point && typeof point === "object") {
          if ("value" in point && typeof point.value === "number") {
            values[companyId] = point.value
          } else if ("close" in point && typeof point.close === "number") {
            values[companyId] = point.close
          }
        }
      })

      setHoverDate(formatCrosshairDate(param.time))
      setHoverValues(values)
    }

    const handleResize = () => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }

    chart.subscribeCrosshairMove(crosshairHandler)
    window.addEventListener("resize", handleResize)

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler)
      window.removeEventListener("resize", handleResize)
    }
  }, [canRenderChart, selectedCompanyIds, seriesByCompany, colorByCompanyId, totalLoading, isDark, chartHeight])

  useEffect(() => {
    if (!canRenderChart || !chartRef.current || !chartContainerRef.current) return
    const container = chartContainerRef.current
    const frame = window.requestAnimationFrame(() => {
      chartRef.current?.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [canRenderChart, isFullscreen, chartHeight, selectedCompanyIds.length])

  useEffect(() => {
    if (!canRenderChart || !chartRef.current || !chartContainerRef.current) return
    if (typeof ResizeObserver === "undefined") return

    const container = chartContainerRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry || !chartRef.current) return
      const width = entry.contentRect.width
      const height = entry.contentRect.height
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height })
      }
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [canRenderChart, selectedCompanyIds.length, isFullscreen, chartHeight])

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [])

  const handleCompanyToggle = useCallback((companyId: number, checked: boolean | "indeterminate") => {
    const nextChecked = checked === true
    setSelectedCompanyIds((prev) => {
      const exists = prev.includes(companyId)
      if (nextChecked && !exists) return [...prev, companyId]
      if (!nextChecked && exists) return prev.filter((id) => id !== companyId)
      return prev
    })
  }, [])

  const comparisonContent = (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border border-border bg-secondary/20 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <CompanySelector
            companies={companies}
            selectedId={primaryCompanyId}
            onSelect={onPrimaryCompanySelect}
          />

          <DropdownMenu
            open={companyMenuOpen}
            onOpenChange={(open) => {
              setCompanyMenuOpen(open)
              if (!open) setCompanyQuery("")
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 border-border bg-card text-xs">
                Compare ({selectedCompanyIds.length})
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-[360px] w-[280px] overflow-auto" align="start">
              <DropdownMenuLabel className="text-xs">Select Companies</DropdownMenuLabel>
              <div className="px-2 pb-2">
                <Input
                  value={companyQuery}
                  onChange={(event) => setCompanyQuery(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder="Search symbol or name..."
                  className="h-8 border-border bg-card text-xs"
                />
              </div>
              <DropdownMenuSeparator />
              {filteredCompanies.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">No companies found</p>
              ) : (
                filteredCompanies.map((item) => {
                  const id = item.company.id
                  const checked = selectedCompanyIds.includes(id)
                  const isPrimary = id === primaryCompanyId
                  const color = colorByCompanyId[id]

                  return (
                    <DropdownMenuCheckboxItem
                      key={id}
                      checked={checked}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(value) => handleCompanyToggle(id, value)}
                      className="text-xs"
                    >
                      <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className={cn(isPrimary && "font-semibold")}>{item.company.symbol}</span>
                      {isPrimary && <span className="ml-1 text-[10px] text-primary">Primary</span>}
                    </DropdownMenuCheckboxItem>
                  )
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
            <Checkbox
              id="auto-add-primary-to-comparison"
              checked={autoAddPrimaryToComparison}
              onCheckedChange={(value) => setAutoAddPrimaryToComparison(value === true)}
            />
            <label
              htmlFor="auto-add-primary-to-comparison"
              className="cursor-pointer text-xs text-muted-foreground"
            >
              Auto select to compare
            </label>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="ml-auto h-9 w-9 border-border bg-card"
            aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {selectedCompanyIds.slice(0, 6).map((companyId) => {
            const symbol = symbolByCompanyId[companyId]
            if (!symbol) return null
            return (
              <Badge key={companyId} variant="outline" className="h-6 border-border bg-card px-2 text-[10px]">
                <span
                  className="mr-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: colorByCompanyId[companyId] }}
                />
                {symbol}
              </Badge>
            )
          })}
          {selectedCompanyIds.length > 6 && (
            <Badge variant="outline" className="h-6 border-border bg-card px-2 text-[10px]">
              +{selectedCompanyIds.length - 6}
            </Badge>
          )}
        </div>
      </div>

      {totalLoading && !hasAnyData ? (
        <Skeleton className="w-full bg-muted" style={{ height: chartHeight }} />
      ) : selectedCompanyIds.length === 0 ? (
        <div
          style={{ height: chartHeight }}
          className="flex items-center justify-center rounded-md border border-border text-sm text-muted-foreground"
        >
          Select at least one company to compare
        </div>
      ) : !hasAnyData ? (
        <div
          style={{ height: chartHeight }}
          className="flex items-center justify-center rounded-md border border-border text-sm text-muted-foreground"
        >
          No comparison data available for the selected companies
        </div>
      ) : (
        <div className="relative">
          <div
            ref={chartContainerRef}
            className="w-full rounded-md border border-border"
            style={{ height: chartHeight }}
          />
          {seriesLoading && (
            <div className="pointer-events-none absolute right-2 top-2 rounded bg-card/90 px-2 py-1 text-[10px] text-muted-foreground">
              Updating...
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-border bg-secondary/20 p-2">
        <p className="text-xs text-muted-foreground">Prices at: {displayDateLabel}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {selectedCompanyIds.map((companyId) => {
            const symbol = symbolByCompanyId[companyId] ?? String(companyId)
            const value = displayValues[companyId]
            return (
              <div key={companyId} className="rounded-sm bg-card px-2 py-1 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorByCompanyId[companyId] }}
                  />
                  <span className="font-medium text-foreground">{symbol}</span>
                </div>
                <p className="mt-1 font-semibold text-foreground">
                  {typeof value === "number" ? `TZS ${value.toLocaleString()}` : "N/A"}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[70] overflow-auto bg-background p-3 sm:p-4">
        <Card className="min-h-full border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GitCompareArrows className="h-4 w-4 text-primary" />
              Comparison Chart
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pick a primary company, search and select comparison companies, then hover chart lines for exact prices.
            </p>
          </CardHeader>
          <CardContent>{comparisonContent}</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Accordion
      type="single"
      collapsible
      value={accordionValue}
      onValueChange={setAccordionValue}
      className="rounded-lg border border-border bg-card px-4"
    >
      <AccordionItem value="comparison-chart" className="border-b-0">
        <AccordionTrigger className="py-3 hover:no-underline">
          <div className="text-left">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GitCompareArrows className="h-4 w-4 text-primary" />
              Comparison Chart
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Expand to select companies and view comparison lines.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4">{comparisonContent}</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
