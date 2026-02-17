import { NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"

interface StatusResponse {
  success: boolean
  data?: string
}

interface LastTradeDateResponse {
  success: boolean
  data?: string
}

interface OverviewResponse {
  success: boolean
  volume?: string
  turn_over?: string
  deals?: string
  m_cap_aggregate?: string
}

interface BaseMarketItem {
  marketPrice?: number | string
  volume?: number | string
  marketCap?: number | string
  turnover?: number | string
  turn_over?: number | string
  deals?: number | string
  lastTradeDate?: string | null
  last_trade_date?: string | null
}

interface MarketMetaPayload {
  marketOpen: boolean
  statusText: string
  lastTradeDate: string | null
  overview: {
    volume: number
    turnover: number
    deals: number
    mCapAggregate: number
  } | null
  updatedAt: string
}

function parseNumber(value: number | string | undefined | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeTradeDate(value: string | null | undefined): string | null {
  if (!value) return null
  const source = value.trim()
  if (!source) return null

  const isoSource = source.includes("T") ? source.slice(0, 10) : source
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoSource)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(source)
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`

  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
  const day = String(parsed.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function dateToTimestamp(dateStr: string): number {
  const parsed = Date.parse(`${dateStr}T00:00:00Z`)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

function aggregateMetaFromMarketData(rows: BaseMarketItem[]): {
  volume: number
  turnover: number
  deals: number
  mCapAggregate: number
  lastTradeDate: string | null
  hasData: boolean
} {
  let volume = 0
  let turnover = 0
  let deals = 0
  let mCapAggregate = 0
  let hasDeals = false
  let lastTradeDate: string | null = null
  let latestTimestamp = Number.NEGATIVE_INFINITY

  rows.forEach((row) => {
    const itemVolume = parseNumber(row.volume)
    const itemMarketPrice = parseNumber(row.marketPrice)

    volume += itemVolume
    mCapAggregate += parseNumber(row.marketCap)

    const itemTurnover = parseNumber(row.turnover ?? row.turn_over)
    if (itemTurnover > 0) {
      turnover += itemTurnover
    } else if (itemVolume > 0 && itemMarketPrice > 0) {
      turnover += itemVolume * itemMarketPrice
    }

    const itemDeals = parseNumber(row.deals)
    if (itemDeals > 0) {
      deals += itemDeals
      hasDeals = true
    }

    const normalizedDate = normalizeTradeDate(row.lastTradeDate ?? row.last_trade_date)
    if (!normalizedDate) return
    const timestamp = dateToTimestamp(normalizedDate)
    if (!Number.isFinite(timestamp)) return
    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp
      lastTradeDate = normalizedDate
    }
  })

  return {
    volume,
    turnover,
    deals: hasDeals ? deals : 0,
    mCapAggregate,
    lastTradeDate,
    hasData: rows.length > 0,
  }
}

let cachedMarketMeta: MarketMetaPayload | null = null

export async function GET() {
  try {
    const [marketDataResult, statusResult] = await Promise.all([
      fetchJsonWithTimeout<BaseMarketItem[]>("https://api.dse.co.tz/api/market-data?isBond=false", {
        next: { revalidate: 30 },
        timeoutMs: 7000,
      }),
      fetchJsonWithTimeout<StatusResponse>("https://data.dse.co.tz/api/is/market/closed", {
        next: { revalidate: 60 },
        timeoutMs: 6000,
      }),
    ])

    const statusText = statusResult.ok
      ? statusResult.data?.data ?? "Unknown"
      : cachedMarketMeta?.statusText ?? "Unknown"
    const marketOpen = !/closed/i.test(statusText)

    const baseRows =
      marketDataResult.ok && Array.isArray(marketDataResult.data)
        ? marketDataResult.data
        : []
    const aggregated = aggregateMetaFromMarketData(baseRows)

    let lastTradeDate = aggregated.lastTradeDate
    let overview = aggregated.hasData
      ? {
          volume: aggregated.volume,
          turnover: aggregated.turnover,
          deals: aggregated.deals,
          mCapAggregate: aggregated.mCapAggregate,
        }
      : null

    if (!lastTradeDate) {
      const lastTradeResult = await fetchJsonWithTimeout<LastTradeDateResponse>(
        "https://dse.co.tz/get/last/trade/date",
        {
          next: { revalidate: 120 },
          timeoutMs: 6000,
        }
      )
      if (lastTradeResult.ok) {
        lastTradeDate = normalizeTradeDate(lastTradeResult.data?.data) ?? null
      }
    }

    const needsOverviewFallback =
      !overview ||
      overview.volume <= 0 ||
      overview.turnover <= 0 ||
      overview.mCapAggregate <= 0 ||
      overview.deals <= 0

    if (lastTradeDate && needsOverviewFallback) {
      const fallbackOverviewResult = await fetchJsonWithTimeout<OverviewResponse>(
        `https://dse.co.tz/get/market/over/view?to_date=${encodeURIComponent(lastTradeDate)}`,
        { next: { revalidate: 120 }, timeoutMs: 7000 }
      )

      if (fallbackOverviewResult.ok && fallbackOverviewResult.data) {
        const fallbackOverview = fallbackOverviewResult.data
        overview = {
          volume:
            overview && overview.volume > 0
              ? overview.volume
              : parseNumber(fallbackOverview.volume),
          turnover:
            overview && overview.turnover > 0
              ? overview.turnover
              : parseNumber(fallbackOverview.turn_over),
          deals:
            overview && overview.deals > 0
              ? overview.deals
              : parseNumber(fallbackOverview.deals),
          mCapAggregate:
            overview && overview.mCapAggregate > 0
              ? overview.mCapAggregate
              : parseNumber(fallbackOverview.m_cap_aggregate),
        }
      }
    }

    const payload: MarketMetaPayload = {
      marketOpen,
      statusText,
      lastTradeDate,
      overview,
      updatedAt: new Date().toISOString(),
    }
    cachedMarketMeta = payload

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "x-dse-stale": "0",
        "x-dse-source": "market-data-primary",
      },
    })
  } catch {
    const fallback = cachedMarketMeta ?? {
      marketOpen: true,
      statusText: "Unknown",
      lastTradeDate: null,
      overview: null,
      updatedAt: new Date().toISOString(),
    }
    return NextResponse.json(fallback, {
      status: 200,
      headers: {
        "x-dse-stale": "1",
        "x-dse-source": "cache",
        "cache-control": "no-store",
      },
    })
  }
}
