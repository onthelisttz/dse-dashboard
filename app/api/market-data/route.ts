import { NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"

interface OverviewRow {
  company: string
  change: number | string
  price: number | string
  volume: number | string
}

interface OverviewResponse {
  success: boolean
  gainers_and_losers?: OverviewRow[]
}

interface HistoryRow {
  trade_date: string
  opening_price: number
  closing_price: number
  high: number
  low: number
  volume: number
  market_cap: number
}

interface HistoryResponse {
  success: boolean
  data?: HistoryRow[]
}

interface BaseMarketItem {
  id?: number
  company?: {
    id?: number
    uid?: string
    name?: string
    symbol?: string
    securityId?: string
    capSize?: number
  }
  security?: {
    id?: number
    symbol?: string
    securityId?: string
    securityType?: string
    securityDesc?: string
    bestOfferPrice?: number | string
    bestOfferQuantity?: number | string
    bestBidPrice?: number | string
    bestBidQuantity?: number | string
    totalSharesIssued?: number | string
  }
  marketPrice?: number | string
  openingPrice?: number | string
  high?: number | string
  low?: number | string
  volume?: number | string
  marketCap?: number | string
  minLimit?: number | string
  maxLimit?: number | string
  bestOfferPrice?: number | string
  bestOfferQuantity?: number | string
  bestBidPrice?: number | string
  bestBidQuantity?: number | string
  lastTradeDate?: string | null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim()
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeOverviewRows(payload: OverviewResponse | null | undefined): OverviewRow[] {
  if (!payload || !Array.isArray(payload.gainers_and_losers)) return []
  return payload.gainers_and_losers
}

function buildFallbackMarketDataFromOverview(overviewRows: OverviewRow[]) {
  return overviewRows
    .map((row, index) => {
      const symbol = row.company?.trim() || `SYM${index + 1}`
      const marketPrice = toNumber(row.price)
      const percentageChange = toNumber(row.change)

      const openEstimate =
        Number.isFinite(percentageChange) && percentageChange !== -100
          ? marketPrice / (1 + percentageChange / 100)
          : marketPrice
      const openingPrice = Number.isFinite(openEstimate) && openEstimate > 0
        ? openEstimate
        : marketPrice

      const high = Math.max(marketPrice, openingPrice)
      const low = Math.min(
        ...[marketPrice, openingPrice].filter((value) => Number.isFinite(value) && value > 0)
      )
      const normalizedLow = Number.isFinite(low) ? low : marketPrice

      return {
        id: index + 1,
        company: {
          id: index + 1,
          uid: symbol,
          name: symbol,
          symbol,
          securityId: symbol,
          capSize: 0,
        },
        security: {
          id: index + 1,
          symbol,
          securityId: symbol,
          securityType: "EQUITY",
          securityDesc: symbol,
          bestOfferPrice: marketPrice,
          bestOfferQuantity: 0,
          bestBidPrice: marketPrice,
          bestBidQuantity: 0,
          totalSharesIssued: 0,
        },
        marketPrice,
        openingPrice,
        change: percentageChange,
        percentageChange,
        changeValue: marketPrice - openingPrice,
        marketCap: 0,
        high,
        low: normalizedLow,
        volume: toNumber(row.volume),
        minLimit: marketPrice > 0 ? Math.max(0, Math.round(marketPrice * 0.9)) : 0,
        maxLimit: marketPrice > 0 ? Math.round(marketPrice * 1.1) : 0,
        bestOfferPrice: marketPrice,
        bestOfferQuantity: 0,
        bestBidPrice: marketPrice,
        bestBidQuantity: 0,
        lastTradeDate: null,
      }
    })
    .filter((item) => item.company.symbol.length > 0)
}

async function fetchLatestHistoryBySymbol(symbol: string): Promise<HistoryRow | null> {
  const url = `https://dse.co.tz/api/get/market/prices/for/range/duration?security_code=${encodeURIComponent(symbol)}&days=7&class=EQUITY`
  const result = await fetchJsonWithTimeout<HistoryResponse>(url, {
    next: { revalidate: 60 },
    timeoutMs: 7000,
  })
  if (!result.ok || !result.data) return null

  const payload = result.data
  const rows = payload.data ?? []
  if (rows.length === 0) return null
  return rows[rows.length - 1]
}

let cachedMarketData: any[] | null = null

export async function GET() {
  try {
    const [baseResult, overviewResult] = await Promise.all([
      fetchJsonWithTimeout<BaseMarketItem[]>("https://api.dse.co.tz/api/market-data?isBond=false", {
        next: { revalidate: 60 },
        timeoutMs: 7000,
      }),
      fetchJsonWithTimeout<OverviewResponse>("https://dse.co.tz/get/gainers/losers", {
        next: { revalidate: 60 },
        timeoutMs: 7000,
      }),
    ])

    const overviewPayload = overviewResult.ok ? overviewResult.data : null
    const overviewRows = normalizeOverviewRows(overviewPayload)

    if (!baseResult.ok || !Array.isArray(baseResult.data)) {
      if (overviewRows.length > 0) {
        const fallbackFromOverview = buildFallbackMarketDataFromOverview(overviewRows)
        cachedMarketData = fallbackFromOverview
        return NextResponse.json(fallbackFromOverview, {
          status: 200,
          headers: {
            "x-dse-stale": "1",
            "cache-control": "no-store",
          },
        })
      }
      if (cachedMarketData) {
        return NextResponse.json(cachedMarketData, {
          status: 200,
          headers: {
            "x-dse-stale": "1",
            "cache-control": "no-store",
          },
        })
      }
      return NextResponse.json([], {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "cache-control": "no-store",
        },
      })
    }

    const baseData = baseResult.data
    const overviewBySymbol = new Map(
      overviewRows.map((row) => [row.company, row] as const)
    )

    const symbols: string[] = (baseData as BaseMarketItem[])
      .map((item) => item?.company?.symbol)
      .filter((value): value is string => typeof value === "string" && value.length > 0)

    const historyResults = await Promise.allSettled(
      symbols.map((symbol) => fetchLatestHistoryBySymbol(symbol))
    )
    const latestHistoryBySymbol = new Map<string, HistoryRow>()

    symbols.forEach((symbol, index) => {
      const result = historyResults[index]
      if (result.status === "fulfilled" && result.value) {
        latestHistoryBySymbol.set(symbol, result.value)
      }
    })

    const merged = (baseData as BaseMarketItem[]).map((item) => {
      const symbol = item?.company?.symbol
      const overview = symbol ? overviewBySymbol.get(symbol) : undefined
      const latest = symbol ? latestHistoryBySymbol.get(symbol) : undefined

      const marketPrice = latest
        ? toNumber(latest.closing_price)
        : overview
          ? toNumber(overview.price)
          : toNumber(item.marketPrice)

      const openingPrice = latest
        ? toNumber(latest.opening_price)
        : toNumber(item.openingPrice)

      const high = latest ? toNumber(latest.high) : toNumber(item.high)
      const low = latest ? toNumber(latest.low) : toNumber(item.low)
      const volume = latest
        ? toNumber(latest.volume)
        : overview
          ? toNumber(overview.volume)
          : toNumber(item.volume)
      const marketCap = latest ? toNumber(latest.market_cap) : toNumber(item.marketCap)

      const officialPctChange = overview ? toNumber(overview.change) : null
      const computedPctChange =
        openingPrice > 0 ? ((marketPrice - openingPrice) / openingPrice) * 100 : 0
      const percentageChange =
        officialPctChange != null ? officialPctChange : computedPctChange
      const changeValue = marketPrice - openingPrice

      return {
        ...item,
        marketPrice,
        openingPrice,
        high,
        low,
        volume,
        marketCap,
        change: percentageChange,
        percentageChange,
        changeValue,
        lastTradeDate: latest?.trade_date ?? null,
      }
    })

    cachedMarketData = merged

    return NextResponse.json(merged, {
      status: 200,
      headers: {
        "x-dse-stale": "0",
      },
    })
  } catch {
    if (cachedMarketData) {
      return NextResponse.json(cachedMarketData, {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "cache-control": "no-store",
        },
      })
    }
    return NextResponse.json([], {
      status: 200,
      headers: {
        "x-dse-stale": "1",
        "cache-control": "no-store",
      },
    })
  }
}
