import { NextRequest, NextResponse } from "next/server"

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

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

async function resolveSymbolFromCompanyId(companyId: string): Promise<string | null> {
  if (!companyId) return null

  const maybeNumber = Number(companyId)
  if (!Number.isNaN(maybeNumber)) {
    const res = await fetch("https://api.dse.co.tz/api/market-data?isBond=false", {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const rows = await res.json()
    const match = (rows as any[]).find((item) => Number(item?.company?.id) === maybeNumber)
    return typeof match?.company?.symbol === "string" ? match.company.symbol : null
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
      return NextResponse.json({ error: "Unknown company symbol" }, { status: 400 })
    }

    const res = await fetch(
      `https://dse.co.tz/api/get/market/prices/for/range/duration?security_code=${encodeURIComponent(symbol)}&days=${encodeURIComponent(days)}&class=EQUITY`,
      { next: { revalidate: 60 } }
    )

    if (!res.ok) throw new Error("Failed to fetch statistics")

    const payload = (await res.json()) as HistoryResponse
    const rows = payload.data ?? []

    const normalized = rows.map((row, index) => ({
      id: row.id ?? index + 1,
      trade_date: row.trade_date,
      company: row.company ?? symbol,
      turnover: toNumber(row.turnover),
      volume: toNumber(row.volume),
      high: toNumber(row.high),
      low: toNumber(row.low),
      opening_price: toNumber(row.opening_price),
      closing_price: toNumber(row.closing_price),
      shares_in_issue: toNumber(row.shares_in_issue),
      market_cap: toNumber(row.market_cap),
    }))

    return NextResponse.json(normalized)
  } catch {
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 })
  }
}
