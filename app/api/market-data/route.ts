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

interface BaseMarketItem {
  id?: number
  company?: {
    id?: number
    uid?: string
    name?: string
    symbol?: string
    securityId?: string
    capSize?: number | string
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
  change?: number | string
  percentageChange?: number | string
  changePercentage?: number | string
  turnover?: number | string
  turn_over?: number | string
  deals?: number | string
  lastTradeDate?: string | null
  last_trade_date?: string | null
  tradeTime?: string | null
  trade_time?: string | null
  lastTradeTime?: string | null
  last_trade_time?: string | null
  time?: string | null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim()
    const parsed = Number(cleaned)
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

function normalizeOverviewRows(payload: OverviewResponse | null | undefined): OverviewRow[] {
  if (!payload || !Array.isArray(payload.gainers_and_losers)) return []
  return payload.gainers_and_losers
}

function buildFallbackFromOverview(overviewRows: OverviewRow[]) {
  return overviewRows
    .map((row, index) => {
      const symbol = row.company?.trim() || `SYM${index + 1}`
      const marketPrice = toNumber(row.price)
      const percentageChange = toNumber(row.change)
      const openingEstimate =
        marketPrice > 0 && Number.isFinite(percentageChange)
          ? marketPrice / (1 + percentageChange / 100)
          : marketPrice
      const openingPrice = openingEstimate > 0 ? openingEstimate : marketPrice

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
        high: Math.max(marketPrice, openingPrice),
        low: Math.min(marketPrice, openingPrice),
        volume: toNumber(row.volume),
        minLimit: marketPrice > 0 ? Math.round(marketPrice * 0.9) : 0,
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

function normalizeBaseRows(baseData: BaseMarketItem[]) {
  return baseData
    .map((item, index) => {
      const symbol =
        item.company?.symbol?.trim() ||
        item.security?.symbol?.trim() ||
        `SYM${index + 1}`

      if (!symbol) return null

      const id =
        toNumber(item.company?.id ?? item.id ?? index + 1) ||
        index + 1

      const openingPriceRaw = toNumber(item.openingPrice)
      const marketPriceRaw = toNumber(item.marketPrice)
      const bestBidPrice = toNumber(item.bestBidPrice ?? item.security?.bestBidPrice)
      const bestOfferPrice = toNumber(item.bestOfferPrice ?? item.security?.bestOfferPrice)
      const marketPrice =
        marketPriceRaw > 0
          ? marketPriceRaw
          : openingPriceRaw > 0
            ? openingPriceRaw
            : bestBidPrice > 0
              ? bestBidPrice
              : bestOfferPrice
      const openingPrice = openingPriceRaw > 0 ? openingPriceRaw : marketPrice

      const highRaw = toNumber(item.high)
      const lowRaw = toNumber(item.low)
      const high =
        highRaw > 0
          ? Math.max(highRaw, openingPrice, marketPrice)
          : Math.max(openingPrice, marketPrice)
      const low =
        lowRaw > 0
          ? Math.min(lowRaw, openingPrice, marketPrice)
          : Math.min(openingPrice, marketPrice)

      const explicitPct = toNumber(item.percentageChange ?? item.changePercentage)
      const computedPct =
        openingPrice > 0 ? ((marketPrice - openingPrice) / openingPrice) * 100 : 0
      const percentageChange = explicitPct !== 0 ? explicitPct : computedPct

      const explicitChange = toNumber(item.change)
      const changeValue =
        openingPrice > 0 ? marketPrice - openingPrice : explicitChange

      const minLimitRaw = toNumber(item.minLimit)
      const maxLimitRaw = toNumber(item.maxLimit)
      const minLimit =
        minLimitRaw > 0
          ? minLimitRaw
          : marketPrice > 0
            ? Math.round(marketPrice * 0.9)
            : 0
      const maxLimit =
        maxLimitRaw > 0
          ? maxLimitRaw
          : marketPrice > 0
            ? Math.round(marketPrice * 1.1)
            : 0

      const lastTradeDate = normalizeTradeDate(item.lastTradeDate ?? item.last_trade_date)
      const tradeTimeRaw =
        item.tradeTime ??
        item.trade_time ??
        item.lastTradeTime ??
        item.last_trade_time ??
        item.time
      const tradeTime =
        typeof tradeTimeRaw === "string" && tradeTimeRaw.trim().length > 0
          ? tradeTimeRaw.trim()
          : null

      return {
        id,
        company: {
          id,
          uid: item.company?.uid ?? symbol,
          name: item.company?.name ?? symbol,
          symbol,
          securityId: item.company?.securityId ?? symbol,
          capSize: toNumber(item.company?.capSize),
        },
        security: {
          id: toNumber(item.security?.id ?? id) || id,
          symbol: item.security?.symbol ?? symbol,
          securityId: item.security?.securityId ?? symbol,
          securityType: item.security?.securityType ?? "EQUITY",
          securityDesc: item.security?.securityDesc ?? symbol,
          bestOfferPrice,
          bestOfferQuantity: toNumber(item.bestOfferQuantity ?? item.security?.bestOfferQuantity),
          bestBidPrice,
          bestBidQuantity: toNumber(item.bestBidQuantity ?? item.security?.bestBidQuantity),
          totalSharesIssued: toNumber(item.security?.totalSharesIssued),
        },
        marketPrice,
        openingPrice,
        change: percentageChange,
        percentageChange,
        changeValue,
        marketCap: toNumber(item.marketCap),
        high,
        low,
        volume: toNumber(item.volume),
        minLimit,
        maxLimit,
        bestOfferPrice,
        bestOfferQuantity: toNumber(item.bestOfferQuantity ?? item.security?.bestOfferQuantity),
        bestBidPrice,
        bestBidQuantity: toNumber(item.bestBidQuantity ?? item.security?.bestBidQuantity),
        lastTradeDate,
        tradeTime,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

let cachedMarketData: unknown[] | null = null

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const isBond = searchParams.get("isBond") === "true"

    const baseResult = await fetchJsonWithTimeout<BaseMarketItem[]>(
      `https://api.dse.co.tz/api/market-data?isBond=${isBond ? "true" : "false"}`,
      {
        next: { revalidate: 30 },
        timeoutMs: 7000,
      }
    )

    if (baseResult.ok && Array.isArray(baseResult.data) && baseResult.data.length > 0) {
      const normalized = normalizeBaseRows(baseResult.data)
      if (normalized.length > 0) {
        cachedMarketData = normalized
        return NextResponse.json(normalized, {
          status: 200,
          headers: {
            "x-dse-stale": "0",
            "x-dse-source": "market-data",
          },
        })
      }
    }

    const overviewResult = await fetchJsonWithTimeout<OverviewResponse>(
      "https://dse.co.tz/get/gainers/losers",
      {
        next: { revalidate: 120 },
        timeoutMs: 7000,
      }
    )
    const overviewRows =
      overviewResult.ok && overviewResult.data
        ? normalizeOverviewRows(overviewResult.data)
        : []

    if (overviewRows.length > 0) {
      const fallback = buildFallbackFromOverview(overviewRows)
      cachedMarketData = fallback
      return NextResponse.json(fallback, {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "x-dse-source": "fallback-overview",
          "cache-control": "no-store",
        },
      })
    }

    if (cachedMarketData) {
      return NextResponse.json(cachedMarketData, {
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
    if (cachedMarketData) {
      return NextResponse.json(cachedMarketData, {
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
