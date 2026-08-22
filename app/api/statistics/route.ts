import { NextRequest, NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"

interface PriceRow {
  [key: string]: unknown
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "")
}

// The investor portal price feed has no publicly documented field names, so
// fields are resolved through ordered regex candidates against normalized keys.
const DATE_MATCHERS = [
  /^tradedate$/,
  /^sessiondate$/,
  /^businessdate$/,
  /^pricedate$/,
  /^date$/,
  /date$/,
]

const OPEN_MATCHERS = [
  /^(opening|open)(ing)?(price)?$/,
  /^first(trade)?price$/,
  /^open/,
]

const HIGH_MATCHERS = [
  /^(high|highest)(price)?$/,
  /^highprice$/,
  /^dayhigh/,
  /^high/,
]

const LOW_MATCHERS = [
  /^(low|lowest)(price)?$/,
  /^lowprice$/,
  /^daylow/,
  /^low/,
]

const CLOSE_MATCHERS = [
  /^(closing|closed|close)(ing)?price$/,
  /^closingprice$/,
  /^lasttraded?price$/,
  /^lasttrad(e|ed)price$/,
  /^closeprice$/,
  /^lastprice$/,
  /^(closing|closed|close|last)$/,
  /^price$/,
  /price$/,
  /^last/,
]

const VOLUME_MATCHERS = [
  /^(traded)?volume$/,
  /volume/,
  /^tradedshares$/,
  /^tradedquantity$/,
  /^dealings?quantity$/,
]

const TURNOVER_MATCHERS = [
  /^turnover$/,
  /turnover/,
  /^tradedvalue$/,
  /^turn_?over$/,
]

function extractValue(
  row: PriceRow,
  matchers: RegExp[]
): string | number | null | undefined {
  const entries = Object.entries(row)

  for (const matcher of matchers) {
    for (const [rawKey, rawValue] of entries) {
      if (matcher.test(normalizeKey(rawKey))) {
        if (rawValue === null || rawValue === undefined || rawValue === "") continue
        if (typeof rawValue === "number" || typeof rawValue === "string") return rawValue
        return String(rawValue)
      }
    }
  }

  return undefined
}

function normalizeTradeDate(value: unknown): string {
  if (value === null || value === undefined) return ""

  const source = String(value).trim()
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
  const parsed = Date.parse(`${dateStr}T00:00:00Z`)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

function normalizeDays(daysParam: string | null): number {
  const parsed = Number(daysParam ?? "")
  if (!Number.isFinite(parsed) || parsed <= 0) return 365
  return Math.min(5475, Math.max(1, Math.round(parsed)))
}

function extractRows(payload: unknown): PriceRow[] {
  if (Array.isArray(payload)) return payload.filter(isObject)
  if (!isObject(payload)) return []

  const containerKeys = ["data", "content", "rows", "items", "prices", "results", "records"]

  for (const key of containerKeys) {
    const value = payload[key]
    if (Array.isArray(value)) return value.filter(isObject)
    if (isObject(value)) {
      for (const innerKey of containerKeys) {
        const inner = value[innerKey]
        if (Array.isArray(inner)) return inner.filter(isObject)
      }
    }
  }

  return []
}

function normalizeRows(rows: PriceRow[], defaultCompany: string): NormalizedStatisticsRow[] {
  const byDate = new Map<string, NormalizedStatisticsRow>()

  rows.forEach((row, index) => {
    const tradeDate = normalizeTradeDate(extractValue(row, DATE_MATCHERS))
    if (!tradeDate) return

    const close = toNumber(extractValue(row, CLOSE_MATCHERS))
    const open = toNumber(extractValue(row, OPEN_MATCHERS))
    const highRaw = toNumber(extractValue(row, HIGH_MATCHERS))
    const lowRaw = toNumber(extractValue(row, LOW_MATCHERS))

    const base = close > 0 ? close : open
    if (base <= 0) return

    const openingPrice = open > 0 ? open : base
    const closingPrice = close > 0 ? close : openingPrice
    const high =
      highRaw > 0 ? Math.max(highRaw, openingPrice, closingPrice) : Math.max(openingPrice, closingPrice)
    const low =
      lowRaw > 0 ? Math.min(lowRaw, openingPrice, closingPrice) : Math.min(openingPrice, closingPrice)

    byDate.set(tradeDate, {
      id: index + 1,
      trade_date: tradeDate,
      company:
        (row.company ?? row.fullName ?? defaultCompany)?.toString().trim() || defaultCompany,
      turnover: toNumber(extractValue(row, TURNOVER_MATCHERS)),
      volume: toNumber(extractValue(row, VOLUME_MATCHERS)),
      high,
      low,
      opening_price: openingPrice,
      closing_price: closingPrice,
      shares_in_issue: toNumber(row.shares_in_issue ?? row.sharesInIssue),
      market_cap: toNumber(row.market_cap ?? row.marketCap),
    })
  })

  return Array.from(byDate.values()).sort(
    (a, b) => dateToTimestamp(a.trade_date) - dateToTimestamp(b.trade_date)
  )
}

function jsonResponse(payload: NormalizedStatisticsRow[], options: {
  stale: boolean
  source: string
}): NextResponse {
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "x-dse-stale": options.stale ? "1" : "0",
      "x-dse-source": options.source,
      "cache-control": options.stale ? "no-store" : "public, max-age=30, stale-while-revalidate=120",
    },
  })
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase()
  const days = normalizeDays(searchParams.get("days"))

  if (!/^[A-Z0-9.\-]{1,20}$/.test(symbol)) {
    return jsonResponse([], { stale: true, source: "missing-symbol" })
  }

  const cacheKey = `${symbol}:${days}`

  // Public DSE website feed - no authentication required.
  let result: Awaited<ReturnType<typeof fetchJsonWithTimeout<unknown>>> | null = null
  try {
    result = await fetchJsonWithTimeout<unknown>(
      `https://dse.co.tz/api/get/market/prices/for/range/duration` +
        `?security_code=${encodeURIComponent(symbol)}&days=${days}&class=EQUITY`,
      { next: { revalidate: 60 }, timeoutMs: 9000 }
    )
  } catch {
    result = null
  }

  if (result && result.ok) {
    const normalized = normalizeRows(extractRows(result.data), symbol)
    if (normalized.length > 0) {
      statisticsCache.set(cacheKey, normalized)
      return jsonResponse(normalized, { stale: false, source: "dse-public-prices" })
    }
  }

  const cached = statisticsCache.get(cacheKey)
  if (cached) {
    return jsonResponse(cached, { stale: true, source: "cache" })
  }

  return jsonResponse([], {
    stale: true,
    source: result ? (result.ok ? "empty" : "error") : "error",
  })
}
