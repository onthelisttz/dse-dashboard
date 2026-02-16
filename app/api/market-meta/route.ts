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

function parseNumber(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number(value.replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

let cachedMarketMeta: MarketMetaPayload | null = null

export async function GET() {
  try {
    const [statusResult, lastTradeResult] = await Promise.all([
      fetchJsonWithTimeout<StatusResponse>("https://data.dse.co.tz/api/is/market/closed", {
        next: { revalidate: 60 },
        timeoutMs: 6000,
      }),
      fetchJsonWithTimeout<LastTradeDateResponse>("https://dse.co.tz/get/last/trade/date", {
        next: { revalidate: 60 },
        timeoutMs: 6000,
      }),
    ])

    const statusText = statusResult.ok
      ? statusResult.data?.data ?? "Unknown"
      : cachedMarketMeta?.statusText ?? "Unknown"
    const marketOpen = !/closed/i.test(statusText)
    const lastTradeDate = lastTradeResult.ok
      ? lastTradeResult.data?.data ?? null
      : cachedMarketMeta?.lastTradeDate ?? null

    let overview = null
    if (lastTradeDate) {
      const overviewResult = await fetchJsonWithTimeout<OverviewResponse>(
        `https://dse.co.tz/get/market/over/view?to_date=${encodeURIComponent(lastTradeDate)}`,
        { next: { revalidate: 60 }, timeoutMs: 7000 }
      )
      if (overviewResult.ok && overviewResult.data) {
        const overviewPayload = overviewResult.data
        overview = {
          volume: parseNumber(overviewPayload.volume),
          turnover: parseNumber(overviewPayload.turn_over),
          deals: parseNumber(overviewPayload.deals),
          mCapAggregate: parseNumber(overviewPayload.m_cap_aggregate),
        }
      } else {
        overview = cachedMarketMeta?.overview ?? null
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
        "cache-control": "no-store",
      },
    })
  }
}
