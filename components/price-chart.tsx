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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowDown,
  ArrowUp,
  BellPlus,
  BarChart3,
  GripVertical,
  LineChart,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Trash2,
} from "lucide-react"
import { useTheme } from "next-themes"
import { CompanySelector } from "@/components/company-selector"
import { cn } from "@/lib/utils"
import type {
  CreatePriceAlertInput,
  MarketDataItem,
  PriceAlert,
  StatisticsItem,
  UpdatePriceAlertInput,
} from "@/lib/types"

interface PriceChartProps {
  data: StatisticsItem[] | undefined
  isLoading: boolean
  companies: MarketDataItem[]
  selectedCompanyId: number
  onSelectCompany: (id: number) => void
  companySymbol: string
  companyName: string
  timeframe: "daily" | "weekly"
  onTimeframeChange: (tf: "daily" | "weekly") => void
  days: number
  onDaysChange: (days: number) => void
  alerts: PriceAlert[]
  showAlertsOnChart: boolean
  onShowAlertsOnChartChange: (visible: boolean) => void
  onCreateAlert: (input: CreatePriceAlertInput) => Promise<unknown>
  onUpdateAlert: (alertId: string, patch: UpdatePriceAlertInput) => Promise<unknown>
  onDeleteAlert: (alertId: string) => Promise<void>
}

type ChartType = "area" | "candlestick"
type MainSeriesApi = ISeriesApi<"Candlestick"> | ISeriesApi<"Area">

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

function toFiniteNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function getDisplayClose(item: StatisticsItem): number {
  const close = toFiniteNumber(item.closing_price as number | string | null | undefined)
  if (close > 0) return close

  const open = toFiniteNumber(item.opening_price as number | string | null | undefined)
  if (open > 0) return open

  const high = toFiniteNumber(item.high as number | string | null | undefined)
  if (high > 0) return high

  const low = toFiniteNumber(item.low as number | string | null | undefined)
  if (low > 0) return low

  return 0
}

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
    opening_price: toFiniteNumber(week[0].opening_price as number | string | null | undefined),
    closing_price: toFiniteNumber(
      week[week.length - 1].closing_price as number | string | null | undefined
    ),
    high: Math.max(
      ...week.map((w) => toFiniteNumber(w.high as number | string | null | undefined))
    ),
    low: Math.min(
      ...week.map((w) => toFiniteNumber(w.low as number | string | null | undefined))
    ),
    volume: week.reduce(
      (sum, w) => sum + toFiniteNumber(w.volume as number | string | null | undefined),
      0
    ),
    turnover: week.reduce(
      (sum, w) => sum + toFiniteNumber(w.turnover as number | string | null | undefined),
      0
    ),
  }))
}

function dateToTimestamp(dateStr: string): number {
  const source = dateStr.trim()
  if (!source) return Number.NaN

  const isoSource = source.includes("T") ? source.slice(0, 10) : source
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoSource)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const utc = Date.UTC(year, month - 1, day)
    return Number.isFinite(utc) ? Math.floor(utc / 1000) : Number.NaN
  }

  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(source)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    const utc = Date.UTC(year, month - 1, day)
    return Number.isFinite(utc) ? Math.floor(utc / 1000) : Number.NaN
  }

  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) return Number.NaN
  const utc = Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate()
  )
  return Number.isFinite(utc) ? Math.floor(utc / 1000) : Number.NaN
}

function isAlertExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt).getTime()
  if (Number.isNaN(expiry)) return false
  return expiry <= Date.now()
}

function parsePriceInput(value: string) {
  const normalized = value.replace(/,/g, "").trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function PriceChart({
  data,
  isLoading,
  companies,
  selectedCompanyId,
  onSelectCompany,
  companySymbol,
  companyName,
  timeframe,
  onTimeframeChange,
  days,
  onDaysChange,
  alerts,
  showAlertsOnChart,
  onShowAlertsOnChartChange,
  onCreateAlert,
  onUpdateAlert,
  onDeleteAlert,
}: PriceChartProps) {
  const [chartType, setChartType] = useState<ChartType>("area")
  const [customYears, setCustomYears] = useState("")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSmallScreen, setIsSmallScreen] = useState(false)
  const [alertTargetPrice, setAlertTargetPrice] = useState("")
  const [alertComment, setAlertComment] = useState("")
  const [alertExpiresAt, setAlertExpiresAt] = useState("")
  const [isSavingAlert, setIsSavingAlert] = useState(false)
  const [alertError, setAlertError] = useState<string | null>(null)
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null)
  const [dragDraft, setDragDraft] = useState<{ id: string; price: number } | null>(null)
  const [optimisticAlertPrices, setOptimisticAlertPrices] = useState<Record<string, number>>({})
  const [isPlacingAlert, setIsPlacingAlert] = useState(false)
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false)
  const [deleteConfirmAlert, setDeleteConfirmAlert] = useState<PriceAlert | null>(null)
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null)
  const [, setOverlayVersion] = useState(0)
  const { resolvedTheme } = useTheme()

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<MainSeriesApi | null>(null)
  const dragDraftRef = useRef<{ id: string; price: number } | null>(null)
  const overlayRafRef = useRef<number | null>(null)

  const selectedPeriod = useMemo(() => {
    const preset = PERIOD_OPTIONS.find((opt) => opt.days === days)
    return preset ? preset.label : "Custom"
  }, [days])

  const safeData = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data]
  )

  const safeAlerts = useMemo(
    () => (Array.isArray(alerts) ? alerts : []),
    [alerts]
  )

  const selectedCompanyMarketData = useMemo(
    () => companies.find((company) => company.company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId]
  )

  const liveMarketPrice = useMemo(() => {
    const value = toFiniteNumber(selectedCompanyMarketData?.marketPrice)
    return value > 0 ? value : null
  }, [selectedCompanyMarketData?.marketPrice])

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
    if (typeof window === "undefined") return
    const media = window.matchMedia("(max-width: 640px)")
    const update = () => setIsSmallScreen(media.matches)
    update()

    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreen])

  useEffect(() => {
    setIsPlacingAlert(false)
  }, [selectedCompanyId, timeframe, chartType])

  const chartData = useMemo(() => {
    if (safeData.length === 0) return []
    const withTimestamp = [...safeData]
      .map((item) => ({
        item,
        timestamp: dateToTimestamp(item.trade_date),
      }))
      .filter((row) => Number.isFinite(row.timestamp) && getDisplayClose(row.item) > 0)
      .sort((a, b) => a.timestamp - b.timestamp)

    const deduped: StatisticsItem[] = []
    for (const row of withTimestamp) {
      const last = deduped[deduped.length - 1]
      if (!last) {
        deduped.push(row.item)
        continue
      }
      const lastTs = dateToTimestamp(last.trade_date)
      if (lastTs === row.timestamp) {
        deduped[deduped.length - 1] = row.item
      } else {
        deduped.push(row.item)
      }
    }

    const base = timeframe === "weekly" ? aggregateWeekly(deduped) : deduped

    const points = base
      .map((item) => {
        const time = dateToTimestamp(item.trade_date) as any
        if (!Number.isFinite(time)) return null
        const close = getDisplayClose(item)
        if (close <= 0) return null

        const openRaw = toFiniteNumber(item.opening_price as number | string | null | undefined)
        const highRaw = toFiniteNumber(item.high as number | string | null | undefined)
        const lowRaw = toFiniteNumber(item.low as number | string | null | undefined)

        const open = openRaw > 0 ? openRaw : close
        const highCandidates = [highRaw, lowRaw, open, close].filter((v) => v > 0)
        const high = highRaw > 0
          ? Math.max(highRaw, open, close)
          : highCandidates.length > 0
            ? Math.max(...highCandidates)
            : close
        const low = lowRaw > 0
          ? Math.min(lowRaw, open, close)
          : highCandidates.length > 0
            ? Math.min(...highCandidates)
            : close
        if (chartType === "candlestick") {
          return {
            time,
            open,
            high,
            low,
            close,
          }
        }
        return {
          time,
          value: close,
        }
      })
      .filter((point): point is NonNullable<typeof point> => point !== null)

    if (liveMarketPrice && points.length > 0) {
      const lastIndex = points.length - 1
      if (chartType === "candlestick") {
        const lastPoint = points[lastIndex] as {
          time: number
          open: number
          high: number
          low: number
          close: number
        }
        const open = lastPoint.open > 0 ? lastPoint.open : liveMarketPrice
        points[lastIndex] = {
          ...lastPoint,
          close: liveMarketPrice,
          high: Math.max(lastPoint.high, open, liveMarketPrice),
          low: Math.min(lastPoint.low, open, liveMarketPrice),
        }
      } else {
        const lastPoint = points[lastIndex] as { time: number; value: number }
        points[lastIndex] = {
          ...lastPoint,
          value: liveMarketPrice,
        }
      }
    }

    return points
  }, [safeData, timeframe, chartType, liveMarketPrice])

  const sortedData = useMemo(() => {
    if (safeData.length === 0) return []
    return [...safeData]
      .filter(
        (item) =>
          getDisplayClose(item) > 0 &&
          Number.isFinite(dateToTimestamp(item.trade_date))
      )
      .sort((a, b) => dateToTimestamp(a.trade_date) - dateToTimestamp(b.trade_date))
  }, [safeData])

  const priceChange = useMemo(() => {
    if (sortedData.length < 2) return 0
    return getDisplayClose(sortedData[sortedData.length - 1]) - getDisplayClose(sortedData[0])
  }, [sortedData])

  const latestClosePrice = useMemo(() => {
    if (sortedData.length === 0) return null
    const value = getDisplayClose(sortedData[sortedData.length - 1])
    return value > 0 ? value : null
  }, [sortedData])

  const currentReferencePrice = liveMarketPrice ?? latestClosePrice

  const allCompanyAlerts = useMemo(
    () =>
      safeAlerts
        .filter((alert) => alert.companyId === selectedCompanyId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [safeAlerts, selectedCompanyId]
  )

  const activeCompanyAlerts = useMemo(
    () => allCompanyAlerts.filter((alert) => alert.active && !isAlertExpired(alert.expiresAt)),
    [allCompanyAlerts]
  )

  useEffect(() => {
    setOptimisticAlertPrices((previous) => {
      const companyAlerts = safeAlerts.filter((alert) => alert.companyId === selectedCompanyId)
      let changed = false
      const next: Record<string, number> = { ...previous }

      for (const alert of companyAlerts) {
        const optimisticValue = next[alert.id]
        if (
          optimisticValue !== undefined &&
          Math.abs(alert.targetPrice - optimisticValue) < 1
        ) {
          delete next[alert.id]
          changed = true
        }
      }

      return changed ? next : previous
    })
  }, [safeAlerts, selectedCompanyId])

  useEffect(() => {
    setOptimisticAlertPrices({})
  }, [selectedCompanyId])

  const displayedAlerts = useMemo(
    () =>
      showAlertsOnChart
        ? activeCompanyAlerts.map((alert) => ({
        ...alert,
            renderPrice:
              dragDraft?.id === alert.id
                ? dragDraft.price
                : optimisticAlertPrices[alert.id] ?? alert.targetPrice,
          }))
        : [],
    [activeCompanyAlerts, dragDraft, optimisticAlertPrices, showAlertsOnChart]
  )

  const hasOverlayElements = (showAlertsOnChart && displayedAlerts.length > 0) || isPlacingAlert

  const directionPreview = useMemo(() => {
    const targetPrice = parsePriceInput(alertTargetPrice)
    if (!targetPrice || !currentReferencePrice) return null
    return targetPrice >= currentReferencePrice ? "above" : "below"
  }, [alertTargetPrice, currentReferencePrice])

  const chartHeight = isFullscreen ? "calc(100vh - 440px)" : "350px"
  const isDark = resolvedTheme === "dark"
  const upColor = "rgb(34, 197, 94)"
  const downColor = "rgb(239, 68, 68)"
  const alertColor = "rgb(245, 158, 11)"
  const lineColor = priceChange >= 0 ? upColor : downColor
  const alertLineRightOffset = 72
  const isDeletingConfirmAlert =
    deleteConfirmAlert != null && busyAlertId === deleteConfirmAlert.id

  const requestOverlaySync = useCallback(() => {
    if (!hasOverlayElements) return
    if (overlayRafRef.current != null) return
    overlayRafRef.current = window.requestAnimationFrame(() => {
      overlayRafRef.current = null
      setOverlayVersion((value) => value + 1)
    })
  }, [hasOverlayElements])

  const getYCoordinateForPrice = useCallback((price: number) => {
    const series = mainSeriesRef.current
    const container = chartContainerRef.current
    if (!series || !container) return null

    const y = series.priceToCoordinate(price)
    if (y == null || !Number.isFinite(y)) return null
    if (y < 0 || y > container.clientHeight) return null
    return y
  }, [])

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

  const handleSaveAlert = useCallback(async () => {
    const targetPrice = parsePriceInput(alertTargetPrice)
    if (!targetPrice) {
      setAlertError("Enter a valid target price.")
      return
    }

    let expiresAtIso: string | null = null
    if (alertExpiresAt) {
      const value = new Date(`${alertExpiresAt}T23:59:59`)
      if (!Number.isNaN(value.getTime())) {
        expiresAtIso = value.toISOString()
      }
    }

    setAlertError(null)
    setIsPlacingAlert(false)
    setIsSavingAlert(true)
    try {
      if (editingAlertId) {
        await onUpdateAlert(editingAlertId, {
          targetPrice,
          comment: alertComment.trim() || null,
          expiresAt: expiresAtIso,
          active: true,
        })
      } else {
        await onCreateAlert({
          companyId: selectedCompanyId,
          companySymbol,
          companyName,
          targetPrice,
          comment: alertComment.trim() || undefined,
          expiresAt: expiresAtIso,
        })
      }

      setIsAlertDialogOpen(false)
      setEditingAlertId(null)
      setAlertTargetPrice("")
      setAlertComment("")
      setAlertExpiresAt("")
    } catch (error) {
      setAlertError(error instanceof Error ? error.message : "Failed to save alert.")
    } finally {
      setIsSavingAlert(false)
    }
  }, [
    alertComment,
    alertExpiresAt,
    alertTargetPrice,
    companyName,
    companySymbol,
    editingAlertId,
    onCreateAlert,
    onUpdateAlert,
    selectedCompanyId,
  ])

  const openEditAlertDialog = useCallback((alert: PriceAlert) => {
    setEditingAlertId(alert.id)
    setAlertTargetPrice(String(Math.round(alert.targetPrice)))
    setAlertComment(alert.comment ?? "")
    if (alert.expiresAt) {
      const date = new Date(alert.expiresAt)
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, "0")
      const d = String(date.getDate()).padStart(2, "0")
      setAlertExpiresAt(`${y}-${m}-${d}`)
    } else {
      setAlertExpiresAt("")
    }
    setAlertError(null)
    setIsAlertDialogOpen(true)
  }, [])

  const requestDeleteAlert = useCallback((alert: PriceAlert) => {
    setDeleteConfirmAlert(alert)
  }, [])

  const confirmDeleteAlert = useCallback(async () => {
    if (!deleteConfirmAlert) return
    const alertId = deleteConfirmAlert.id
    setBusyAlertId(alertId)
    try {
      await onDeleteAlert(alertId)
      setDeleteConfirmAlert(null)
    } finally {
      setBusyAlertId(null)
    }
  }, [deleteConfirmAlert, onDeleteAlert])

  const startAlertDrag = useCallback(
    (alertId: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      const alert = activeCompanyAlerts.find((item) => item.id === alertId)
      if (!alert) return

      const draft = { id: alert.id, price: alert.targetPrice }
      dragDraftRef.current = draft
      setDragDraft(draft)
    },
    [activeCompanyAlerts]
  )

  useEffect(() => {
    if (!dragDraft) return
    const container = chartContainerRef.current
    const series = mainSeriesRef.current
    if (!container || !series) return

    const dragId = dragDraft.id

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const relativeY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
      const convertedPrice = series.coordinateToPrice(relativeY)

      if (
        typeof convertedPrice !== "number" ||
        !Number.isFinite(convertedPrice) ||
        convertedPrice <= 0
      ) {
        return
      }

      const roundedPrice = Math.max(1, Math.round(convertedPrice))
      const next = { id: dragId, price: roundedPrice }
      dragDraftRef.current = next
      setDragDraft((prev) => {
        if (!prev || prev.id !== dragId || prev.price !== roundedPrice) {
          return next
        }
        return prev
      })
    }

    const handlePointerUp = () => {
      const finalDraft = dragDraftRef.current
      dragDraftRef.current = null
      setDragDraft(null)

      if (!finalDraft || finalDraft.id !== dragId) return
      const original = activeCompanyAlerts.find((item) => item.id === finalDraft.id)
      if (!original) return
      if (Math.abs(original.targetPrice - finalDraft.price) < 1) return

      setOptimisticAlertPrices((previous) => ({
        ...previous,
        [finalDraft.id]: finalDraft.price,
      }))
      setBusyAlertId(finalDraft.id)
      void onUpdateAlert(finalDraft.id, { targetPrice: finalDraft.price })
        .catch((error) => {
          setAlertError(error instanceof Error ? error.message : "Failed to update alert price.")
          setOptimisticAlertPrices((previous) => {
            if (!(finalDraft.id in previous)) return previous
            const next = { ...previous }
            delete next[finalDraft.id]
            return next
          })
        })
        .finally(() => {
          setBusyAlertId((current) => (current === finalDraft.id ? null : current))
        })
    }

    document.body.style.cursor = "ns-resize"
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp, { once: true })

    return () => {
      document.body.style.cursor = ""
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [activeCompanyAlerts, dragDraft, onUpdateAlert])

  useEffect(() => {
    if (!isPlacingAlert || chartData.length === 0) return
    const container = chartContainerRef.current
    if (!container) return

    const handlePointerDown = (event: PointerEvent) => {
      const series = mainSeriesRef.current
      if (!series) return

      const rect = container.getBoundingClientRect()
      const relativeY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
      const clickedPrice = series.coordinateToPrice(relativeY)

      if (typeof clickedPrice !== "number" || !Number.isFinite(clickedPrice) || clickedPrice <= 0) {
        return
      }

      setAlertTargetPrice(String(Math.max(1, Math.round(clickedPrice))))
      setIsPlacingAlert(false)
      setEditingAlertId(null)
      setAlertComment("")
      setAlertExpiresAt("")
      setAlertError(null)
      setIsAlertDialogOpen(true)
    }

    container.addEventListener("pointerdown", handlePointerDown)
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [isPlacingAlert, chartData.length])

  useEffect(() => {
    if (!chartContainerRef.current) return
    const container = chartContainerRef.current

    if (!chartRef.current) {
      // React strict mode can remount effects and leave an old series ref.
      // Reset before creating a fresh chart instance.
      mainSeriesRef.current = null
      chartRef.current = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: isDark ? "#9ca3af" : "#6b7280",
          fontSize: isSmallScreen ? 10 : 11,
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
          alignLabels: false,
          entireTextOnly: true,
          minimumWidth: isSmallScreen ? 42 : 0,
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
          rightOffset: 0,
          rightOffsetPixels: 0,
          fixRightEdge: true,
          lockVisibleTimeRangeOnResize: true,
        },
        localization: {
          priceFormatter: (price: number) =>
            isSmallScreen
              ? Math.round(price).toString()
              : price.toLocaleString(),
        },
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#9ca3af" : "#6b7280",
        fontSize: isSmallScreen ? 10 : 11,
      },
      grid: {
        vertLines: { color: isDark ? "rgba(55, 65, 81, 0.5)" : "rgba(229, 231, 235, 0.5)" },
        horzLines: { color: isDark ? "rgba(55, 65, 81, 0.5)" : "rgba(229, 231, 235, 0.5)" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#374151" : "#e5e7eb",
        ...NON_NEGATIVE_SCALE_OPTIONS,
        alignLabels: false,
        entireTextOnly: true,
        minimumWidth: isSmallScreen ? 42 : 0,
      },
      timeScale: {
        borderColor: isDark ? "#374151" : "#e5e7eb",
        rightOffset: 0,
        rightOffsetPixels: 0,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
      },
    })

    if (mainSeriesRef.current) {
      const previousSeries = mainSeriesRef.current
      try {
        chartRef.current.removeSeries(previousSeries)
      } catch {
        // Ignore stale series refs from a previous chart instance.
      } finally {
        mainSeriesRef.current = null
      }
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
      mainSeriesRef.current.setData(chartData as any)
    }

    if (chartData.length > 0) {
      chartRef.current.timeScale().fitContent()
      chartRef.current.timeScale().scrollToRealTime()
    }
    clampPriceScaleToZero()
    requestOverlaySync()

    const handleResize = () => {
      if (!chartRef.current) return
      chartRef.current.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
      clampPriceScaleToZero()
      requestOverlaySync()
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [chartData, chartType, isDark, isSmallScreen, priceChange, lineColor, clampPriceScaleToZero, nonNegativeAutoscale, upColor, downColor, requestOverlaySync])

  useEffect(() => {
    requestOverlaySync()
  }, [displayedAlerts, requestOverlaySync, chartType, timeframe, isFullscreen])

  useEffect(() => {
    const chart = chartRef.current
    const container = chartContainerRef.current
    if (!chart || !container || !hasOverlayElements) return

    const sync = () => requestOverlaySync()

    const timeScale = chart.timeScale()
    timeScale.subscribeVisibleLogicalRangeChange(sync)
    timeScale.subscribeVisibleTimeRangeChange(sync)

    container.addEventListener("wheel", sync, { passive: true })
    container.addEventListener("pointermove", sync)
    container.addEventListener("pointerdown", sync)
    window.addEventListener("pointerup", sync)

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(sync)
      timeScale.unsubscribeVisibleTimeRangeChange(sync)
      container.removeEventListener("wheel", sync)
      container.removeEventListener("pointermove", sync)
      container.removeEventListener("pointerdown", sync)
      window.removeEventListener("pointerup", sync)
    }
  }, [requestOverlaySync, chartData.length, chartType, timeframe, isFullscreen, hasOverlayElements])

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
    if (!chartRef.current || !chartContainerRef.current) return
    if (typeof ResizeObserver === "undefined") return

    const container = chartContainerRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry || !chartRef.current) return
      const width = entry.contentRect.width
      const height = entry.contentRect.height
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height })
        clampPriceScaleToZero()
        requestOverlaySync()
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [isFullscreen, chartHeight, chartType, timeframe, clampPriceScaleToZero, requestOverlaySync])

  useEffect(() => {
    if (!chartRef.current) return

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#9ca3af" : "#6b7280",
        fontSize: isSmallScreen ? 10 : 11,
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
        alignLabels: false,
        entireTextOnly: true,
        minimumWidth: isSmallScreen ? 42 : 0,
      },
      timeScale: {
        borderColor: isDark ? "#374151" : "#e5e7eb",
        rightOffset: 0,
        rightOffsetPixels: 0,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
      },
      localization: {
        priceFormatter: (price: number) =>
          isSmallScreen
            ? Math.round(price).toString()
            : price.toLocaleString(),
      },
    })
    clampPriceScaleToZero()
  }, [isDark, isSmallScreen, clampPriceScaleToZero])

  useEffect(() => {
    return () => {
      if (overlayRafRef.current != null) {
        window.cancelAnimationFrame(overlayRafRef.current)
      }
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
      mainSeriesRef.current = null
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
                onClick={() => setIsPlacingAlert((prev) => !prev)}
                className={cn(
                  "h-9 w-9 border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 hover:text-amber-500",
                  isPlacingAlert && "bg-amber-500 text-black hover:bg-amber-500/90 hover:text-black"
                )}
                aria-label={isPlacingAlert ? "Cancel alert placement" : "Set alert on chart"}
                title={isPlacingAlert ? "Cancel alert placement" : "Set alert on chart"}
              >
                <BellPlus className="h-4 w-4" />
              </Button>
              <label
                className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground"
                title="Show or hide alert lines on chart"
              >
                <Checkbox
                  checked={showAlertsOnChart}
                  onCheckedChange={(checked) => onShowAlertsOnChartChange(checked === true)}
                  aria-label="Show alerts on chart"
                />
                <span>Alerts</span>
              </label>
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

          <div className="flex flex-wrap items-center gap-2">
            {isPlacingAlert && (
              <Badge
                variant="outline"
                className="h-6 border-amber-500/50 bg-amber-500/10 px-2 text-[10px] text-amber-500"
              >
                Click chart price to place alert
              </Badge>
            )}
            {alertError && <span className="text-[11px] text-loss">{alertError}</span>}
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-4 sm:px-6">
          <div className="relative">
            <div
              ref={chartContainerRef}
              className={cn("w-full", isPlacingAlert && chartData.length > 0 && "cursor-crosshair")}
              style={{ height: chartHeight }}
            />

            {isLoading && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-card/70 backdrop-blur-[1px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading chart data...</p>
              </div>
            )}

            {!isLoading && chartData.length === 0 && (
              <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-muted-foreground">
                No price data available
              </div>
            )}

            {!isLoading && chartData.length > 0 && isPlacingAlert && (
              <div className="pointer-events-none absolute inset-0 z-20 rounded-md border border-amber-500/50 bg-amber-500/5">
                <div className="absolute left-3 top-3 rounded-sm border border-amber-500/50 bg-card/95 px-2 py-1 text-[11px] text-amber-500">
                  Click anywhere on the chart to place an alert line
                </div>
              </div>
            )}

            {!isLoading && chartData.length > 0 && displayedAlerts.length > 0 && (
              <div className="pointer-events-none absolute inset-0">
                {displayedAlerts.map((alert) => {
                  const y = getYCoordinateForPrice(alert.renderPrice)
                  if (y == null) return null

                  const color = alertColor
                  const isBusy = busyAlertId === alert.id
                  const isAbove = alert.direction === "above"

                  return (
                    <div
                      key={alert.id}
                      className="absolute left-0 border-t border-dashed"
                      style={{ top: y, right: `${alertLineRightOffset}px`, borderColor: color }}
                    >
                      <div
                        className="pointer-events-auto absolute top-0 z-30 flex -translate-y-1/2 items-center gap-1 rounded-sm border border-amber-500/50 bg-card/95 px-1.5 py-0.5 text-[10px] text-amber-500 shadow-sm"
                        style={{ right: `${Math.max(8, alertLineRightOffset - 2)}px` }}
                      >
                        <button
                          type="button"
                          onPointerDown={startAlertDrag(alert.id)}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                          aria-label="Drag alert line"
                          title="Drag to update alert price"
                        >
                          <GripVertical className="h-3 w-3" />
                        </button>
                        <span
                          className={cn(
                            "inline-flex h-4 w-4 items-center justify-center rounded-sm border",
                            isAbove
                              ? "border-gain/40 bg-gain/10 text-gain"
                              : "border-loss/40 bg-loss/10 text-loss"
                          )}
                          title={isAbove ? "Above current price" : "Below current price"}
                        >
                          {isAbove ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                        </span>
                        <span className="min-w-[64px] text-right font-medium">
                          {alert.renderPrice.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditAlertDialog(alert)}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                          aria-label="Edit alert"
                          title="Edit alert"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => requestDeleteAlert(alert)}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:text-loss disabled:opacity-60"
                          aria-label="Delete alert"
                          title="Delete alert"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={deleteConfirmAlert != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmAlert(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete alert?</DialogTitle>
            <DialogDescription>
              This will permanently remove the alert
              {deleteConfirmAlert ? ` for ${deleteConfirmAlert.companySymbol}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmAlert(null)}
              disabled={isDeletingConfirmAlert}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDeleteAlert}
              disabled={isDeletingConfirmAlert}
              className="bg-loss text-white hover:bg-loss/90"
            >
              {isDeletingConfirmAlert ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAlertDialogOpen}
        onOpenChange={(open) => {
          setIsAlertDialogOpen(open)
          if (!open) {
            setEditingAlertId(null)
            setAlertError(null)
            setIsPlacingAlert(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAlertId ? "Edit Price Alert" : `${companySymbol} Price Alert`}
            </DialogTitle>
            <DialogDescription>
              Set alert details for this price level.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Alert Price (TZS)</label>
              <Input
                type="number"
                min={1}
                value={alertTargetPrice}
                onChange={(event) => setAlertTargetPrice(event.target.value)}
                className="h-9 border-border bg-card text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Expiry Date (optional)</label>
              <Input
                type="date"
                value={alertExpiresAt}
                onChange={(event) => setAlertExpiresAt(event.target.value)}
                className="h-9 border-border bg-card text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Comment (optional)</label>
              <Input
                type="text"
                value={alertComment}
                placeholder="Reason or note"
                onChange={(event) => setAlertComment(event.target.value)}
                className="h-9 border-border bg-card text-sm"
              />
            </div>

            {currentReferencePrice && directionPreview && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2 py-1.5">
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-sm border",
                    directionPreview === "above"
                      ? "border-gain/40 bg-gain/10 text-gain"
                      : "border-loss/40 bg-loss/10 text-loss"
                  )}
                >
                  {directionPreview === "above" ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  )}
                </span>
                <p className="text-xs text-muted-foreground">
                  Direction auto: <span className="font-semibold">{directionPreview}</span> current price (
                  TZS {currentReferencePrice.toLocaleString()})
                </p>
              </div>
            )}

            {alertError && <p className="text-xs text-loss">{alertError}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAlertDialogOpen(false)
                setEditingAlertId(null)
                setAlertError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveAlert}
              disabled={isSavingAlert}
              className="bg-amber-500 text-black hover:bg-amber-500/90"
            >
              {isSavingAlert ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              {editingAlertId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
