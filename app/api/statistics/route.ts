import { NextRequest, NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"

interface HistoryRow {
  id?: number
  trade_date: string
  company: string
  turnover: number | string
  volume: number | string
  high: number | string
  low: number | string
  opening_price: number | string
  closing_price: number | string
  shares_in_issue: number | string
  market_cap: number | string
}

interface HistoryResponse {
  success: boolean
  data?: HistoryRow[]
}

interface BaseMarketItem {
  company?: {
    id?: number
    symbol?: string
  }
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeTradeDate(value: string): string {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }

  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear()
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
    const day = String(parsed.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  return value
}

const symbolByCompanyIdCache = new Map<number, string>()
const statisticsCache = new Map<string, ReturnType<typeof normalizeRows>>()

function normalizeRows(rows: HistoryRow[], symbol: string) {
  return rows.map((row, index) => {
    const close = toNumber(row.closing_price)
    const open = toNumber(row.opening_price)
    const highRaw = toNumber(row.high)
    const lowRaw = toNumber(row.low)
    const fallback = close > 0 ? close : open
    const high = highRaw > 0 ? highRaw : Math.max(open, close, fallback)
    const low = lowRaw > 0 ? lowRaw : Math.min(...[open, close, fallback].filter((v) => v > 0))

    return {
      id: row.id ?? index + 1,
      trade_date: normalizeTradeDate(row.trade_date),
      company: row.company ?? symbol,
      turnover: toNumber(row.turnover),
      volume: toNumber(row.volume),
      high,
      low: Number.isFinite(low) ? low : fallback,
      opening_price: open > 0 ? open : fallback,
      closing_price: close > 0 ? close : fallback,
      shares_in_issue: toNumber(row.shares_in_issue),
      market_cap: toNumber(row.market_cap),
    }
  })
}

async function resolveSymbolFromCompanyId(companyId: string): Promise<string | null> {
  if (!companyId) return null

  const maybeNumber = Number(companyId)
  if (!Number.isNaN(maybeNumber)) {
    const cachedSymbol = symbolByCompanyIdCache.get(maybeNumber)
    if (cachedSymbol) return cachedSymbol

    const result = await fetchJsonWithTimeout<BaseMarketItem[]>(
      "https://api.dse.co.tz/api/market-data?isBond=false",
      { next: { revalidate: 60 }, timeoutMs: 6000 }
    )
    if (!result.ok || !Array.isArray(result.data)) return null

    for (const row of result.data) {
      const id = Number(row?.company?.id)
      const symbol = row?.company?.symbol
      if (!Number.isNaN(id) && typeof symbol === "string" && symbol.length > 0) {
        symbolByCompanyIdCache.set(id, symbol)
      }
    }

    return symbolByCompanyIdCache.get(maybeNumber) ?? null
  }

  return companyId
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const companyId = searchParams.get("companyId") || ""
  const days = searchParams.get("days") || "365"
  const symbolParam = searchParams.get("symbol")

  try {
    const symbol = symbolParam || (await resolveSymbolFromCompanyId(companyId))
    if (!symbol) {
      return NextResponse.json([], { status: 200 })
    }

    const cacheKey = `${symbol}:${days}`
    const result = await fetchJsonWithTimeout<HistoryResponse>(
      `https://dse.co.tz/api/get/market/prices/for/range/duration?security_code=${encodeURIComponent(symbol)}&days=${encodeURIComponent(days)}&class=EQUITY`,
      { next: { revalidate: 60 }, timeoutMs: 9000 }
    )

    const payload = result.data
    const hasArrayRows = !!payload && Array.isArray(payload.data)
    const rows = hasArrayRows ? payload.data ?? [] : []
    const upstreamFailure =
      !result.ok ||
      !payload ||
      !hasArrayRows ||
      payload.success === false

    if (upstreamFailure || rows.length === 0) {
      const cached = statisticsCache.get(cacheKey)
      if (cached) {
        return NextResponse.json(cached, {
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

    const normalized = normalizeRows(rows, symbol)
    statisticsCache.set(cacheKey, normalized)

    return NextResponse.json(normalized, {
      status: 200,
      headers: {
        "x-dse-stale": "0",
      },
    })
  } catch {
    return NextResponse.json([], {
      status: 200,
      headers: {
        "x-dse-stale": "1",
        "cache-control": "no-store",
      },
    })
  }
}
