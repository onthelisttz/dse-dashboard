"use client"

import { useEffect, useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationStatus,
  type PushNotificationStatus,
} from "@/lib/push-client"
import type { PriceAlert, UpdatePriceAlertInput } from "@/lib/types"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  BellOff,
  CalendarDays,
  Eye,
  LayoutList,
  Loader2,
  Table2,
  Trash2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PriceAlertsPanelProps {
  alerts: PriceAlert[]
  onSelectCompany: (companyId: number) => void
  onRevealChartAlerts: () => void
  onUpdateAlert: (alertId: string, patch: UpdatePriceAlertInput) => Promise<unknown>
  onDeleteAlert: (alertId: string) => Promise<void>
  isLoading?: boolean
}

type ViewMode = "table" | "list"
type StatusFilter = "all" | "active" | "inactive" | "triggered" | "expired"
type AlertStatus = Exclude<StatusFilter, "all">
type SortKey = "company" | "target" | "status" | "createdAt" | "expiresAt" | "comment"
type SortDirection = "asc" | "desc"

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  const date = new Date(expiresAt).getTime()
  if (Number.isNaN(date)) return false
  return date <= Date.now()
}

function getAlertStatus(alert: PriceAlert): AlertStatus {
  if (isExpired(alert.expiresAt)) return "expired"
  if (alert.triggeredAt) return "triggered"
  if (alert.active) return "active"
  return "inactive"
}

function formatStatus(status: AlertStatus) {
  if (status === "active") return "Active"
  if (status === "inactive") return "Inactive"
  if (status === "triggered") return "Triggered"
  return "Expired"
}

function statusBadgeClass(status: AlertStatus) {
  if (status === "active") {
    return "border-gain/30 bg-gain/10 text-gain"
  }
  if (status === "triggered") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-500"
  }
  if (status === "expired") {
    return "border-loss/30 bg-loss/10 text-loss"
  }
  return "border-border bg-card text-muted-foreground"
}

function startOfDayMs(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime()
}

function endOfDayMs(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime()
}

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0)
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999)
}

function formatDateShort(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateFilterLabel(rangeDate: DateRange | undefined) {
  if (!rangeDate?.from && !rangeDate?.to) return "All dates"
  if (rangeDate?.from && rangeDate?.to) {
    return `${formatDateShort(rangeDate.from)} - ${formatDateShort(rangeDate.to)}`
  }
  if (rangeDate?.from) {
    return formatDateShort(rangeDate.from)
  }
  if (rangeDate?.to) {
    return formatDateShort(rangeDate.to)
  }
  return "All dates"
}

function statusRank(status: AlertStatus) {
  if (status === "active") return 4
  if (status === "triggered") return 3
  if (status === "inactive") return 2
  return 1
}

export function PriceAlertsPanel({
  alerts,
  onSelectCompany,
  onRevealChartAlerts,
  onUpdateAlert,
  onDeleteAlert,
  isLoading = false,
}: PriceAlertsPanelProps) {
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState("")
  const [pushStatus, setPushStatus] = useState<PushNotificationStatus | null>(null)
  const [pushStatusLoading, setPushStatusLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("table")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [rangeDate, setRangeDate] = useState<DateRange | undefined>(undefined)
  const [draftRangeDate, setDraftRangeDate] = useState<DateRange | undefined>(undefined)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [deleteTarget, setDeleteTarget] = useState<PriceAlert | null>(null)

  const baseAlerts = useMemo(
    () =>
      [...alerts].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [alerts]
  )

  const filteredAlerts = useMemo(() => {
    return baseAlerts.filter((alert) => {
      const status = getAlertStatus(alert)
      if (statusFilter !== "all" && status !== statusFilter) {
        return false
      }

      if (!rangeDate?.from && !rangeDate?.to) return true

      const createdAt = new Date(alert.createdAt).getTime()
      if (!Number.isFinite(createdAt)) return false

      const from = rangeDate?.from ?? rangeDate?.to
      const to = rangeDate?.to ?? rangeDate?.from
      if (!from || !to) return true

      return createdAt >= startOfDayMs(from) && createdAt <= endOfDayMs(to)
    })
  }, [baseAlerts, rangeDate, statusFilter])

  const displayedAlerts = useMemo(() => {
    const sorted = [...filteredAlerts]
    sorted.sort((a, b) => {
      let compare = 0

      if (sortKey === "company") {
        compare = `${a.companySymbol} ${a.companyName}`.localeCompare(
          `${b.companySymbol} ${b.companyName}`
        )
      } else if (sortKey === "target") {
        compare = a.targetPrice - b.targetPrice
      } else if (sortKey === "status") {
        compare = statusRank(getAlertStatus(a)) - statusRank(getAlertStatus(b))
      } else if (sortKey === "createdAt") {
        compare = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortKey === "expiresAt") {
        const aDate = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY
        const bDate = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY
        compare = aDate - bDate
      } else if (sortKey === "comment") {
        compare = (a.comment ?? "").localeCompare(b.comment ?? "")
      }

      return sortDirection === "asc" ? compare : -compare
    })
    return sorted
  }, [filteredAlerts, sortDirection, sortKey])

  useEffect(() => {
    let isMounted = true

    const loadPushStatus = async () => {
      setPushStatusLoading(true)
      try {
        const status = await getPushNotificationStatus()
        if (!isMounted) return
        setPushStatus(status)
      } catch (error) {
        if (!isMounted) return
        setPushMessage(error instanceof Error ? error.message : "Failed to load push status.")
      } finally {
        if (!isMounted) return
        setPushStatusLoading(false)
      }
    }

    void loadPushStatus()
    return () => {
      isMounted = false
    }
  }, [])

  const refreshPushStatus = async () => {
    setPushStatusLoading(true)
    try {
      const status = await getPushNotificationStatus()
      setPushStatus(status)
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Failed to load push status.")
    } finally {
      setPushStatusLoading(false)
    }
  }

  const handleEnablePush = async () => {
    setPushBusy(true)
    setPushMessage("")
    try {
      await enablePushNotifications()
      setPushMessage("")
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Failed to enable push.")
    } finally {
      setPushBusy(false)
    }
    await refreshPushStatus()
  }

  const handleDisablePush = async () => {
    setPushBusy(true)
    setPushMessage("")
    try {
      const result = await disablePushNotifications()
      if (result.disabled) {
        setPushMessage("")
      } else {
        setPushMessage("Push notifications are not supported in this browser.")
      }
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Failed to disable push.")
    } finally {
      setPushBusy(false)
    }
    await refreshPushStatus()
  }

  const jumpToChart = (companyId: number) => {
    onSelectCompany(companyId)
    onRevealChartAlerts()
    const chartSection = document.getElementById("price-chart-section")
    chartSection?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const toggleAlert = async (alert: PriceAlert) => {
    setBusyAlertId(alert.id)
    try {
      await onUpdateAlert(alert.id, { active: !alert.active })
    } finally {
      setBusyAlertId(null)
    }
  }

  const confirmDeleteAlert = async () => {
    if (!deleteTarget) return
    setBusyAlertId(deleteTarget.id)
    try {
      await onDeleteAlert(deleteTarget.id)
      setDeleteTarget(null)
    } finally {
      setBusyAlertId(null)
    }
  }

  const clearDateFilter = () => {
    setRangeDate(undefined)
    setDraftRangeDate(undefined)
  }

  const handleDatePickerOpenChange = (open: boolean) => {
    if (open) {
      setDraftRangeDate(rangeDate)
    }
    setIsDatePickerOpen(open)
  }

  const applyDatePicker = () => {
    setRangeDate(draftRangeDate)
    setIsDatePickerOpen(false)
  }

  const cancelDatePicker = () => {
    setDraftRangeDate(rangeDate)
    setIsDatePickerOpen(false)
  }

  const applyPreset = (preset: string) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (preset === "allTime") {
      clearDateFilter()
      setIsDatePickerOpen(false)
      return
    }

    let from: Date = today
    let to: Date = today

    if (preset === "today") {
      from = today
      to = today
    } else if (preset === "yesterday") {
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      from = yesterday
      to = yesterday
    } else if (preset === "currentWeek") {
      from = startOfWeek(today)
      to = endOfWeek(today)
    } else if (preset === "previousWeek") {
      const ref = new Date(today)
      ref.setDate(today.getDate() - 7)
      from = startOfWeek(ref)
      to = endOfWeek(ref)
    } else if (preset === "currentMonth") {
      from = startOfMonth(today)
      to = endOfMonth(today)
    } else if (preset === "previousMonth") {
      const ref = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      from = startOfMonth(ref)
      to = endOfMonth(ref)
    } else if (preset === "currentYear") {
      from = startOfYear(today)
      to = endOfYear(today)
    } else if (preset === "previousYear") {
      const ref = new Date(today.getFullYear() - 1, 0, 1)
      from = startOfYear(ref)
      to = endOfYear(ref)
    }

    setDraftRangeDate({ from, to })
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDirection("asc")
  }

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-foreground" />
    )
  }

  const dateFilterLabel = formatDateFilterLabel(rangeDate)
  const dateFilterDraftLabel = formatDateFilterLabel(draftRangeDate)
  const isDeletingTarget = deleteTarget != null && busyAlertId === deleteTarget.id

  const renderActions = (alert: PriceAlert) => {
    const expired = isExpired(alert.expiresAt)
    const isBusy = busyAlertId === alert.id

    return (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => jumpToChart(alert.companyId)}
          className="h-8 w-8 border-border"
          title="View on chart"
          aria-label="View on chart"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => toggleAlert(alert)}
          disabled={isBusy || expired}
          className="h-8 w-8 border-border"
          title={alert.active ? "Disable alert" : "Enable alert"}
          aria-label={alert.active ? "Disable alert" : "Enable alert"}
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : alert.active ? (
            <BellOff className="h-3.5 w-3.5" />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setDeleteTarget(alert)}
          disabled={isBusy}
          className="h-8 w-8 border-border text-loss hover:text-loss"
          title="Delete alert"
          aria-label="Delete alert"
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    )
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg font-bold text-foreground">Price Alerts</CardTitle>
          <CardDescription>
            Alerts trigger by price direction and can notify by email and push.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
            <Button
              type="button"
              variant={viewMode === "table" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("table")}
              className="h-8 w-8"
              title="Table view"
              aria-label="Table view"
            >
              <Table2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
              className="h-8 w-8"
              title="List view"
              aria-label="List view"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
            {pushStatusLoading ? (
              <span
                className="flex h-8 w-8 items-center justify-center text-muted-foreground"
                title="Checking push status"
                aria-label="Checking push status"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            ) : pushStatus?.supported === false ? (
              <span
                className="flex h-8 w-8 items-center justify-center text-muted-foreground"
                title="Push unsupported"
                aria-label="Push unsupported"
              >
                <BellOff className="h-4 w-4" />
              </span>
            ) : pushStatus?.permission === "denied" ? (
              <span
                className="flex h-8 w-8 items-center justify-center text-loss"
                title="Notifications blocked"
                aria-label="Notifications blocked"
              >
                <BellOff className="h-4 w-4" />
              </span>
            ) : pushStatus?.subscribed ? (
              <>
                <span
                  className="flex h-8 w-8 items-center justify-center text-gain"
                  title="Push enabled"
                  aria-label="Push enabled"
                >
                  <Bell className="h-4 w-4" />
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleDisablePush}
                  disabled={pushBusy}
                  className="h-8 w-8 text-loss hover:text-loss"
                  title="Disable push"
                  aria-label="Disable push"
                >
                  {pushBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                </Button>
              </>
            ) : (
              <>
                <span
                  className="flex h-8 w-8 items-center justify-center text-muted-foreground"
                  title="Push disabled"
                  aria-label="Push disabled"
                >
                  <BellOff className="h-4 w-4" />
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleEnablePush}
                  disabled={pushBusy}
                  className="h-8 w-8"
                  title="Enable push"
                  aria-label="Enable push"
                >
                  {pushBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {pushMessage && (
          <p className="rounded-md border border-border bg-secondary/20 px-2 py-1 text-xs text-muted-foreground">
            {pushMessage}
          </p>
        )}
        {!isLoading && baseAlerts.length > 0 && (
          <div className="grid max-w-5xl grid-cols-2 gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Status</p>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="triggered">Triggered</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-1 lg:col-span-3">
              <p className="mb-1 text-[11px] text-muted-foreground">Date Range</p>
              <div className="flex items-center gap-2">
                <Popover open={isDatePickerOpen} onOpenChange={handleDatePickerOpenChange}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 flex-1 justify-start border-border bg-card px-2 text-xs"
                    >
                      <CalendarDays className="mr-2 h-3.5 w-3.5" />
                      <span className="truncate">{dateFilterLabel}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="!w-fit !max-w-none border-border bg-card p-0"
                  >
                    <div className="inline-block space-y-3 p-3">
                      <p className="text-sm font-medium text-foreground">{dateFilterDraftLabel}</p>
                      <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("today")}>Today</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("yesterday")}>Yesterday</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("currentWeek")}>Current Week</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("previousWeek")}>Previous Week</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("currentMonth")}>Current Month</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("previousMonth")}>Previous Month</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("currentYear")}>Current Year</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("previousYear")}>Previous Year</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 w-full justify-center px-2 text-xs" onClick={() => applyPreset("allTime")}>All Time</Button>
                      </div>
                    </div>
                    <div className="border-t border-border">
                      <Calendar
                        mode="range"
                        selected={draftRangeDate}
                        onSelect={setDraftRangeDate}
                        numberOfMonths={2}
                        initialFocus
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-border p-3">
                      <Button type="button" size="sm" variant="outline" onClick={cancelDatePicker}>
                        Cancel
                      </Button>
                      <Button type="button" size="sm" onClick={applyDatePicker}>
                        Apply
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={clearDateFilter}
                  className="h-8 w-8 border-border"
                  title="Clear date filter"
                  aria-label="Clear date filter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {!isLoading && baseAlerts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {displayedAlerts.length} of {baseAlerts.length} alerts.
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading alerts...</p>
        ) : baseAlerts.length === 0 ? (
          <div className="rounded-md border border-border bg-secondary/10 px-3 py-6 text-center">
            <BellOff className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              No alerts yet. Add one from the chart section.
            </p>
          </div>
        ) : displayedAlerts.length === 0 ? (
          <div className="rounded-md border border-border bg-secondary/10 px-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">No alerts match current filters.</p>
          </div>
        ) : viewMode === "table" ? (
          <Table containerClassName="max-h-[420px] rounded-md border border-border">
            <TableHeader className="sticky top-0 z-20 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="bg-card">
                  <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => toggleSort("company")}>
                    Company {renderSortIcon("company")}
                  </button>
                </TableHead>
                <TableHead className="bg-card">
                  <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => toggleSort("target")}>
                    Target {renderSortIcon("target")}
                  </button>
                </TableHead>
                <TableHead className="bg-card">
                  <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => toggleSort("status")}>
                    Status {renderSortIcon("status")}
                  </button>
                </TableHead>
                <TableHead className="bg-card">
                  <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => toggleSort("createdAt")}>
                    Date Set {renderSortIcon("createdAt")}
                  </button>
                </TableHead>
                <TableHead className="bg-card">
                  <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => toggleSort("expiresAt")}>
                    Expiry {renderSortIcon("expiresAt")}
                  </button>
                </TableHead>
                <TableHead className="bg-card">
                  <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => toggleSort("comment")}>
                    Comment {renderSortIcon("comment")}
                  </button>
                </TableHead>
                <TableHead className="w-[130px] bg-card text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedAlerts.map((alert) => {
                const status = getAlertStatus(alert)
                return (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <p className="font-semibold text-foreground">{alert.companySymbol}</p>
                      <p className="text-xs text-muted-foreground">{alert.companyName}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className="whitespace-nowrap border-border bg-card text-[10px]"
                      >
                        {alert.direction === "above" ? "Above" : "Below"} TZS{" "}
                        {alert.targetPrice.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={cn("whitespace-nowrap text-[10px]", statusBadgeClass(status))}
                      >
                        {formatStatus(status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(alert.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {alert.expiresAt ? new Date(alert.expiresAt).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                      {alert.comment ?? "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">{renderActions(alert)}</div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="space-y-2">
            {displayedAlerts.map((alert) => {
              const status = getAlertStatus(alert)
              return (
                <div key={alert.id} className="rounded-md border border-border bg-secondary/10 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {alert.companySymbol}
                        </span>
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap border-border bg-card text-[10px]"
                        >
                          {alert.direction === "above" ? "Above" : "Below"} TZS{" "}
                          {alert.targetPrice.toLocaleString()}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn("whitespace-nowrap text-[10px]", statusBadgeClass(status))}
                        >
                          {formatStatus(status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.companyName}</p>
                      <p className="text-xs text-muted-foreground">
                        Date set: {new Date(alert.createdAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expiry:{" "}
                        {alert.expiresAt
                          ? new Date(alert.expiresAt).toLocaleString()
                          : "No expiry"}
                      </p>
                      {alert.comment && (
                        <p className="text-xs text-muted-foreground">Comment: {alert.comment}</p>
                      )}
                    </div>
                    {renderActions(alert)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete alert?</DialogTitle>
            <DialogDescription>
              This action cannot be undone
              {deleteTarget ? ` (${deleteTarget.companySymbol})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeletingTarget}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDeleteAlert}
              disabled={isDeletingTarget}
              className="bg-loss text-white hover:bg-loss/90"
            >
              {isDeletingTarget ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
