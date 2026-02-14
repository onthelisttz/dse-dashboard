import { NextResponse } from "next/server"

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

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim()
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

async function fetchLatestHistoryBySymbol(symbol: string): Promise<HistoryRow | null> {
  const url = `https://dse.co.tz/api/get/market/prices/for/range/duration?security_code=${encodeURIComponent(symbol)}&days=7&class=EQUITY`
  const res = await fetch(url, { next: { revalidate: 60 } })
  if (!res.ok) return null

  const payload = (await res.json()) as HistoryResponse
  const rows = payload.data ?? []
  if (rows.length === 0) return null
  return rows[rows.length - 1]
}

export async function GET() {
  try {
    const [baseRes, overviewRes] = await Promise.all([
      fetch("https://api.dse.co.tz/api/market-data?isBond=false", { next: { revalidate: 60 } }),
      fetch("https://dse.co.tz/get/gainers/losers", { next: { revalidate: 60 } }),
    ])

    if (!baseRes.ok) throw new Error("Failed to fetch base market data")

    const baseData = await baseRes.json()
    const overviewPayload = overviewRes.ok ? ((await overviewRes.json()) as OverviewResponse) : null
    const overviewRows = overviewPayload?.gainers_and_losers ?? []
    const overviewBySymbol = new Map(
      overviewRows.map((row) => [row.company, row] as const)
    )

    const symbols: string[] = (baseData as any[])
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

    const merged = (baseData as any[]).map((item) => {
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

    return NextResponse.json(merged)
  } catch {
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 })
  }
}
