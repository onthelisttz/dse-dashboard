import { fetchJsonWithTimeout } from "@/lib/server-fetch"

interface MarketDataApiRow {
  company?: {
    id?: number
    symbol?: string
    name?: string
  }
  marketPrice?: number | string
  openingPrice?: number | string
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export async function fetchCurrentPriceBySymbol(symbol: string): Promise<number | null> {
  const result = await fetchJsonWithTimeout<MarketDataApiRow[]>(
    "https://api.dse.co.tz/api/market-data?isBond=false",
    {
      next: { revalidate: 30 },
      timeoutMs: 6000,
    }
  )

  if (!result.ok || !Array.isArray(result.data)) {
    return null
  }

  const rows = result.data
  const match = rows.find((item) => item?.company?.symbol === symbol)
  if (!match) {
    return null
  }

  const marketPrice = toNumber(match.marketPrice)
  if (marketPrice > 0) {
    return marketPrice
  }

  const openingPrice = toNumber(match.openingPrice)
  return openingPrice > 0 ? openingPrice : null
}
