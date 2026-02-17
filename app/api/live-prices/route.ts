import { NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"

interface BaseMarketItem {
  id?: number
  company?: {
    id?: number
    symbol?: string
  }
  marketPrice?: number | string
  openingPrice?: number | string
  change?: number | string
  percentageChange?: number | string
  changePercentage?: number | string
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function mapToLivePriceRows(rows: BaseMarketItem[]) {
  return rows
    .map((item, index) => {
      const company = item.company?.symbol?.trim() || `SYM${index + 1}`
      if (!company) return null

      const price = toNumber(item.marketPrice)
      const openingPrice = toNumber(item.openingPrice)
      const explicitChange = toNumber(item.change)
      const explicitPct = toNumber(item.percentageChange ?? item.changePercentage)

      let change = explicitChange
      if (change === 0 && openingPrice > 0 && price > 0) {
        change = ((price - openingPrice) / openingPrice) * 100
      } else if (change === 0 && explicitPct !== 0) {
        change = explicitPct
      }

      return {
        id: toNumber(item.company?.id ?? item.id ?? index + 1) || index + 1,
        company,
        price,
        change,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

let cachedLivePrices: { success: boolean; data: Array<{ id: number; company: string; price: number; change: number }> } | null = null

export async function GET() {
  try {
    const result = await fetchJsonWithTimeout<BaseMarketItem[]>(
      "https://api.dse.co.tz/api/market-data?isBond=false",
      {
        next: { revalidate: 30 },
        timeoutMs: 7000,
      }
    )

    if (!result.ok || !Array.isArray(result.data)) {
      if (cachedLivePrices) {
        return NextResponse.json(cachedLivePrices, {
          status: 200,
          headers: {
            "x-dse-stale": "1",
            "x-dse-source": "cache",
            "cache-control": "no-store",
          },
        })
      }
      return NextResponse.json(
        { success: false, data: [] },
        {
          status: 200,
          headers: {
            "x-dse-stale": "1",
            "x-dse-source": "empty",
            "cache-control": "no-store",
          },
        }
      )
    }

    const mapped = mapToLivePriceRows(result.data)
    const payload = { success: true, data: mapped }
    cachedLivePrices = payload

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "x-dse-stale": "0",
        "x-dse-source": "market-data",
      },
    })
  } catch {
    if (cachedLivePrices) {
      return NextResponse.json(cachedLivePrices, {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "x-dse-source": "cache",
          "cache-control": "no-store",
        },
      })
    }
    return NextResponse.json(
      { success: false, data: [] },
      {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "x-dse-source": "error",
          "cache-control": "no-store",
        },
      }
    )
  }
}
