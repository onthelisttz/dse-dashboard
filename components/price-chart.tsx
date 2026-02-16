"use client"

import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import {
  createChart,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
  type AutoscaleInfoProvider,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  AreaSeries,
} from "lightweight-charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart3, LineChart, Loader2, Maximize2, Minimize2 } from "lucide-react"
import { useTheme } from "next-themes"
import { CompanySelector } from "@/components/company-selector"
import { cn } from "@/lib/utils"
import type { MarketDataItem, StatisticsItem } from "@/lib/types"

interface PriceChartProps {
  data: StatisticsItem[] | undefined
  isLoading: boolean
  companies: MarketDataItem[]
  selectedCompanyId: number
  onSelectCompany: (id: number) => void
  companySymbol: string
  timeframe: "daily" | "weekly"
  onTimeframeChange: (tf: "daily" | "weekly") => void
  days: number
  onDaysChange: (days: number) => void
}

type ChartType = "area" | "candlestick"

const PERIOD_OPTIONS = [
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
  { label: "3Y", days: 1095 },
  { label: "All", days: 5475 },
]

const NON_NEGATIVE_SCALE_OPTIONS = {
  mode: PriceScaleMode.Normal,
  autoScale: true,
  scaleMargins: {
    top: 0.1,
    bottom: 0,
  },
} as const

function aggregateWeekly(data: StatisticsItem[]): StatisticsItem[] {
  if (!data || data.length === 0) return []
  const weeks: StatisticsItem[][] = []
  let current: StatisticsItem[] = []

  for (const item of data) {
    const d = new Date(item.trade_date)
    if (current.length === 0) {
      current.push(item)
    } else {
      const prevDate = new Date(current[0].trade_date)
      const diff = (d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      if (diff < 7) {
        current.push(item)
      } else {
        weeks.push(current)
        current = [item]
      }
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
  const d = new Date(dateStr)
  return Math.floor(d.getTime() / 1000)
}

export function PriceChart({
  data,
  isLoading,
  companies,
  selectedCompanyId,
  onSelectCompany,
  companySymbol,
  timeframe,
  onTimeframeChange,
  days,
  onDaysChange,
}: PriceChartProps) {
  const [chartType, setChartType] = useState<ChartType>("area")
  const [customYears, setCustomYears] = useState("")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { resolvedTheme } = useTheme()

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null)

  const selectedPeriod = useMemo(() => {
    const preset = PERIOD_OPTIONS.find((opt) => opt.days === days)
    return preset ? preset.label : "Custom"
  }, [days])

  const handlePeriodChange = useCallback(
    (value: string) => {
      if (value === "Custom") return
      const preset = PERIOD_OPTIONS.find((opt) => opt.label === value)
      if (preset) {
        onDaysChange(preset.days)
      }
    },
    [onDaysChange]
  )

  useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreen])

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    const sorted = [...data]
      .filter(
        (item) =>
          item.opening_price > 0 &&
          item.closing_price > 0 &&
          item.high > 0 &&
          item.low > 0
      )
      .sort(
        (a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime()
      )
    const base = timeframe === "weekly" ? aggregateWeekly(sorted) : sorted

    return base.map((item) => {
      const time = dateToTimestamp(item.trade_date) as any
      if (chartType === "candlestick") {
        return {
          time,
          open: item.opening_price,
          high: item.high,
          low: item.low,
          close: item.closing_price,
        }
      }
      return {
        time,
        value: item.closing_price,
      }
    })
  }, [data, timeframe, chartType])

  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return []
    return [...data].sort(
      (a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime()
    )
  }, [data])

  const priceChange = useMemo(() => {
    if (!data || data.length < 2) return 0
    return sortedData[sortedData.length - 1].closing_price - sortedData[0].closing_price
  }, [data, sortedData])

  const chartHeight = isFullscreen ? "calc(100vh - 320px)" : "350px"
  const isDark = resolvedTheme === "dark"
  const upColor = "rgb(34, 197, 94)"
  const downColor = "rgb(239, 68, 68)"
  const lineColor = priceChange >= 0 ? upColor : downColor

  const nonNegativeAutoscale = useCallback<AutoscaleInfoProvider>((original) => {
    const info = original()
    if (info === null) return null
    if (info.priceRange === null) return info

    return {
      ...info,
      priceRange: {
        minValue: Math.max(0, info.priceRange.minValue),
        maxValue: info.priceRange.maxValue,
      },
    }
  }, [])

  const clampPriceScaleToZero = useCallback(() => {
    if (!chartRef.current) return
    const priceScale = chartRef.current.priceScale("right")
    const range = priceScale.getVisibleRange()
    if (!range) return
    if (range.from < 0) {
      priceScale.setVisibleRange({
        from: 0,
        to: Math.max(range.to, 1),
      })
    }
  }, [])

  useEffect(() => {
    if (!chartContainerRef.current) return
    const container = chartContainerRef.current

    if (isLoading || chartData.length === 0) {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
        mainSeriesRef.current = null
      }
      return
    }

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
          ...NON_NEGATIVE_SCALE_OPTIONS,
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
          priceFormatter: (price: number) => price.toLocaleString(),
        },
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }

    chartRef.current.applyOptions({
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
        ...NON_NEGATIVE_SCALE_OPTIONS,
      },
      timeScale: {
        borderColor: isDark ? "#374151" : "#e5e7eb",
      },
    })

    if (mainSeriesRef.current) {
      chartRef.current.removeSeries(mainSeriesRef.current)
      mainSeriesRef.current = null
    }

    if (chartType === "candlestick") {
      mainSeriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
        upColor,
        downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
        autoscaleInfoProvider: nonNegativeAutoscale,
        priceFormat: {
          type: "price",
          precision: 0,
          minMove: 1,
        },
      })
    } else {
      mainSeriesRef.current = chartRef.current.addSeries(AreaSeries, {
        lineColor,
        topColor: priceChange >= 0 ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)",
        bottomColor: priceChange >= 0 ? "rgba(34, 197, 94, 0.0)" : "rgba(239, 68, 68, 0.0)",
        lineWidth: 2,
        autoscaleInfoProvider: nonNegativeAutoscale,
        priceFormat: {
          type: "price",
          precision: 0,
          minMove: 1,
        },
      })
    }

    if (mainSeriesRef.current) {
      mainSeriesRef.current.setData(chartData)
    }

    chartRef.current.timeScale().fitContent()
    clampPriceScaleToZero()

    const handleResize = () => {
      if (!chartRef.current) return
      chartRef.current.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
      clampPriceScaleToZero()
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [chartData, chartType, isDark, priceChange, isLoading, lineColor, clampPriceScaleToZero, nonNegativeAutoscale, upColor, downColor])

  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return
    const container = chartContainerRef.current
    const frame = window.requestAnimationFrame(() => {
      chartRef.current?.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isFullscreen, chartData.length, chartHeight])

  useEffect(() => {
    if (!chartRef.current) return

    chartRef.current.applyOptions({
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
          labelBackgroundColor: isDark ? "#374151" : "#e5e7eb",
        },
        horzLine: {
          color: isDark ? "#6b7280" : "#9ca3af",
          labelBackgroundColor: isDark ? "#374151" : "#e5e7eb",
        },
      },
      rightPriceScale: {
        borderColor: isDark ? "#374151" : "#e5e7eb",
        ...NON_NEGATIVE_SCALE_OPTIONS,
      },
      timeScale: {
        borderColor: isDark ? "#374151" : "#e5e7eb",
      },
    })
    clampPriceScaleToZero()
  }, [isDark, clampPriceScaleToZero])

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [])

  const handleCustomYears = useCallback(() => {
    const years = parseInt(customYears, 10)
    if (years > 0 && years <= 15) {
      onDaysChange(years * 365)
    }
  }, [customYears, onDaysChange])

  return (
    <div
      className={cn(
        isFullscreen &&
          "fixed inset-0 z-[70] overflow-auto bg-background p-3 sm:p-4"
      )}
    >
      <Card className={cn("border-border bg-card", isFullscreen && "min-h-full")}>
        <CardHeader className="space-y-3 pb-2">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-foreground">
                {companySymbol} Price Chart
              </CardTitle>
              {sortedData.length > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(sortedData[0]?.trade_date).toLocaleDateString()} -{" "}
                  {new Date(sortedData[sortedData.length - 1]?.trade_date).toLocaleDateString()}
                  {" \u00B7 "}{sortedData.length} data points
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CompanySelector
                companies={companies}
                selectedId={selectedCompanyId}
                onSelect={onSelectCompany}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setIsFullscreen((prev) => !prev)}
                className="h-9 w-9 border-border bg-card"
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
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-border bg-secondary/40 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Range</p>
              <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="h-8 border-border bg-secondary text-xs">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.label} value={opt.label}>
                      {opt.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border bg-secondary/40 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Custom Years</p>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={15}
                  placeholder="e.g. 5"
                  value={customYears}
                  onChange={(e) => setCustomYears(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCustomYears()
                  }}
                  className="h-8 border-border bg-secondary text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCustomYears}
                  disabled={!customYears}
                  className="h-8 px-3 text-xs"
                >
                  Apply
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border bg-secondary/40 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Chart</p>
              <div className="flex items-center rounded-md border border-border bg-secondary p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChartType("area")}
                  className={`h-7 flex-1 px-2 ${chartType === "area" ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <LineChart className="mr-1 h-3.5 w-3.5" />
                  <span className="text-xs">Area</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChartType("candlestick")}
                  className={`h-7 flex-1 px-2 ${chartType === "candlestick" ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <BarChart3 className="mr-1 h-3.5 w-3.5" />
                  <span className="text-xs">Candle</span>
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border bg-secondary/40 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Interval</p>
              <Tabs
                value={timeframe}
                onValueChange={(v) => onTimeframeChange(v as "daily" | "weekly")}
                className="w-full"
              >
                <TabsList className="h-8 w-full bg-secondary p-0.5">
                  <TabsTrigger
                    value="daily"
                    className="h-7 flex-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Daily
                  </TabsTrigger>
                  <TabsTrigger
                    value="weekly"
                    className="h-7 flex-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Weekly
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {isLoading ? (
            <div style={{ height: chartHeight }} className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading chart data...</p>
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ height: chartHeight }} className="flex items-center justify-center text-sm text-muted-foreground">
              No price data available
            </div>
          ) : (
            <div ref={chartContainerRef} className="w-full" style={{ height: chartHeight }} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
