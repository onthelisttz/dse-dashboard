import { NextRequest, NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"

interface StatisticsRow {
  id?: number | string
  trade_date?: string
  tradeDate?: string
  date?: string
  company?: string
  symbol?: string
  security_code?: string
  securityCode?: string
  turnover?: number | string
  turn_over?: number | string
  turnOver?: number | string
  volume?: number | string
  high?: number | string
  high_price?: number | string
  highPrice?: number | string
  low?: number | string
  low_price?: number | string
  lowPrice?: number | string
  opening_price?: number | string
  openingPrice?: number | string
  open?: number | string
  closing_price?: number | string
  closingPrice?: number | string
  close?: number | string
  price?: number | string
  shares_in_issue?: number | string
  sharesInIssue?: number | string
  totalSharesIssued?: number | string
  market_cap?: number | string
  marketCap?: number | string
}

interface StatisticsEnvelope {
  success?: boolean
  data?: StatisticsRow[]
  rows?: StatisticsRow[]
  statistics?: StatisticsRow[]
}

interface NormalizedStatisticsRow {
  id: number
  trade_date: string
  company: string
  turnover: number
  volume: number
  high: number
  low: number
  opening_price: number
  closing_price: number
  shares_in_issue: number
  market_cap: number
}

const statisticsCache = new Map<string, NormalizedStatisticsRow[]>()

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeTradeDate(value: string): string {
  const source = value.trim()
  if (!source) return ""

  const isoSource = source.includes("T") ? source.slice(0, 10) : source
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoSource)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(source)
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`

  const parsed = new Date(source)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear()
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
    const day = String(parsed.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  return ""
}

function dateToTimestamp(dateStr: string): number {
  const normalized = normalizeTradeDate(dateStr)
  if (!normalized) return Number.NaN
  const parsed = Date.parse(`${normalized}T00:00:00Z`)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

function isSuccessPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return true
  if (!("success" in payload)) return true
  return (payload as StatisticsEnvelope).success !== false
}

function extractRows(payload: unknown): StatisticsRow[] {
  if (Array.isArray(payload)) return payload as StatisticsRow[]
  if (!payload || typeof payload !== "object") return []

  const envelope = payload as StatisticsEnvelope
  if (Array.isArray(envelope.data)) return envelope.data
  if (Array.isArray(envelope.rows)) return envelope.rows
  if (Array.isArray(envelope.statistics)) return envelope.statistics
  return []
}

function normalizeRows(rows: StatisticsRow[], defaultCompany: string): NormalizedStatisticsRow[] {
  const byDate = new Map<string, NormalizedStatisticsRow>()

  rows.forEach((row, index) => {
    const dateRaw = row.trade_date ?? row.tradeDate ?? row.date ?? ""
    const tradeDate = normalizeTradeDate(dateRaw)
    if (!tradeDate) return

    const close = toNumber(row.closing_price ?? row.closingPrice ?? row.close ?? row.price)
    const open = toNumber(row.opening_price ?? row.openingPrice ?? row.open)
    const highRaw = toNumber(row.high ?? row.high_price ?? row.highPrice)
    const lowRaw = toNumber(row.low ?? row.low_price ?? row.lowPrice)

    const base = close > 0 ? close : open
    if (base <= 0) return

    const openingPrice = open > 0 ? open : base
    const closingPrice = close > 0 ? close : openingPrice
    const high = highRaw > 0 ? Math.max(highRaw, openingPrice, closingPrice) : Math.max(openingPrice, closingPrice)
    const low = lowRaw > 0 ? Math.min(lowRaw, openingPrice, closingPrice) : Math.min(openingPrice, closingPrice)

    const normalized: NormalizedStatisticsRow = {
      id: toNumber(row.id ?? index + 1) || index + 1,
      trade_date: tradeDate,
      company:
        (row.company ?? row.symbol ?? row.security_code ?? row.securityCode ?? defaultCompany)
          ?.toString()
          .trim() || defaultCompany,
      turnover: toNumber(row.turnover ?? row.turn_over ?? row.turnOver),
      volume: toNumber(row.volume),
      high,
      low,
      opening_price: openingPrice,
      closing_price: closingPrice,
      shares_in_issue: toNumber(row.shares_in_issue ?? row.sharesInIssue ?? row.totalSharesIssued),
      market_cap: toNumber(row.market_cap ?? row.marketCap),
    }

    byDate.set(tradeDate, normalized)
  })

  return Array.from(byDate.values()).sort(
    (a, b) => dateToTimestamp(a.trade_date) - dateToTimestamp(b.trade_date)
  )
}

function normalizeDays(daysParam: string): number {
  const parsed = Number(daysParam)
  if (!Number.isFinite(parsed) || parsed <= 0) return 365
  return Math.min(5475, Math.max(1, Math.round(parsed)))
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const companyId = Number(searchParams.get("companyId") ?? "")
  const days = normalizeDays(searchParams.get("days") ?? "365")

  if (!Number.isFinite(companyId) || companyId <= 0) {
    return NextResponse.json([], { status: 200 })
  }

  const cacheKey = `${companyId}:${days}`
  const defaultCompany = String(companyId)

  try {
    const result = await fetchJsonWithTimeout<unknown>(
      `https://api.dse.co.tz/api/market-data/statistics?companyId=${encodeURIComponent(String(companyId))}&days=${encodeURIComponent(String(days))}`,
      { next: { revalidate: 60 }, timeoutMs: 9000 }
    )

    const rows =
      result.ok && isSuccessPayload(result.data)
        ? extractRows(result.data)
        : []

    const normalized = normalizeRows(rows, defaultCompany)
    if (normalized.length > 0) {
      statisticsCache.set(cacheKey, normalized)
      return NextResponse.json(normalized, {
        status: 200,
        headers: {
          "x-dse-stale": "0",
          "x-dse-source": "statistics",
        },
      })
    }

    const cached = statisticsCache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "x-dse-source": "cache",
          "cache-control": "no-store",
        },
      })
    }

    return NextResponse.json([], {
      status: 200,
      headers: {
        "x-dse-stale": "1",
        "x-dse-source": "empty",
        "cache-control": "no-store",
      },
    })
  } catch {
    const cached = statisticsCache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "x-dse-source": "cache",
          "cache-control": "no-store",
        },
      })
    }

    return NextResponse.json([], {
      status: 200,
      headers: {
        "x-dse-stale": "1",
        "x-dse-source": "error",
        "cache-control": "no-store",
      },
    })
  }
}
