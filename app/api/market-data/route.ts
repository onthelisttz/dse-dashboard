import { NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"
import {
  SNAPSHOT_SUCCESS_CODE,
  SnapshotRow,
  extractSnapshotRows,
  fetchMarketWatchSnapshot,
  normalizeSymbol,
  round2,
  symbolToId,
  toNumber,
} from "@/lib/dse-investor"

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

interface SecuritySnapshot {
  bestOfferPrice: number
  bestOfferQuantity: number
  bestBidPrice: number
  bestBidQuantity: number
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
      const percentageChange = round2(toNumber(row.change))
      const openingEstimate =
        marketPrice > 0 && Number.isFinite(percentageChange)
          ? marketPrice / (1 + percentageChange / 100)
          : marketPrice
      const openingPrice = round2(openingEstimate > 0 ? openingEstimate : marketPrice)

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
        changeValue: round2(marketPrice - openingPrice),
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

function normalizeSnapshotRows(rows: SnapshotRow[]) {
  return rows
    .map((item) => {
      const symbol = normalizeSymbol(item.symbol)
      if (!symbol) return null

      const id = symbolToId(symbol)
      const name =
        typeof item.name === "string" && item.name.trim().length > 0
          ? item.name.trim()
          : symbol

      const bestBidPrice = toNumber(item.bestBidPrice)
      const bestOfferPrice = toNumber(item.bestOfferPrice)
      const bestBidQuantity = toNumber(item.bestBidQuantity)
      const bestOfferQuantity = toNumber(item.bestOfferQuantity)

      const lastPrice = toNumber(item.lastPrice)
      const priceChange = toNumber(item.priceChange)
      const priceChangePct = toNumber(item.priceChangePct)

      const marketPrice =
        lastPrice > 0
          ? lastPrice
          : bestBidPrice > 0
            ? bestBidPrice
            : bestOfferPrice

      // The snapshot reports the change against the previous close, so the open
      // is recovered by subtracting it back out.
      const openingPrice =
        lastPrice > 0 && priceChange !== 0
          ? round2(lastPrice - priceChange)
          : marketPrice

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

      const percentageChange =
        priceChangePct !== 0
          ? round2(priceChangePct)
          : openingPrice > 0
            ? round2(((marketPrice - openingPrice) / openingPrice) * 100)
            : 0

      const changeValue =
        priceChange !== 0
          ? round2(priceChange)
          : round2(marketPrice - openingPrice)

      const minLimit = marketPrice > 0 ? Math.round(marketPrice * 0.9) : 0
      const maxLimit = marketPrice > 0 ? Math.round(marketPrice * 0.1) + marketPrice : 0

      const tradeTime =
        typeof item.updatedAt === "string" && item.updatedAt.trim().length > 0
          ? item.updatedAt.trim()
          : null
      const lastTradeDate = normalizeTradeDate(tradeTime)

      const securityType =
        typeof item.securityType === "string" && item.securityType.trim().length > 0
          ? item.securityType.trim()
          : "EQUITY"

      const topOfBook: SecuritySnapshot = {
        bestOfferPrice,
        bestOfferQuantity,
        bestBidPrice,
        bestBidQuantity,
      }

      return {
        id,
        company: {
          id,
          uid: symbol,
          name,
          symbol,
          securityId: item.securityId?.trim() || symbol,
          capSize: 0,
        },
        security: {
          id,
          symbol,
          securityId: item.securityId?.trim() || symbol,
          securityType,
          securityDesc: name,
          ...topOfBook,
          totalSharesIssued: 0,
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
        ...topOfBook,
        lastTradeDate,
        tradeTime,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

let cachedMarketData: unknown[] | null = null

export async function GET() {
  try {
    const snapshotResult = await fetchMarketWatchSnapshot(30)

    if (snapshotResult.ok && snapshotResult.data?.code === SNAPSHOT_SUCCESS_CODE) {
      const normalized = normalizeSnapshotRows(extractSnapshotRows(snapshotResult.data))
      if (normalized.length > 0) {
        cachedMarketData = normalized
        return NextResponse.json(normalized, {
          status: 200,
          headers: {
            "x-dse-stale": "0",
            "x-dse-source": "market-watch-snapshot",
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
