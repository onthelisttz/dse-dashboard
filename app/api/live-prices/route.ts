import { NextResponse } from "next/server"
import {
  SNAPSHOT_SUCCESS_CODE,
  extractSnapshotRows,
  fetchMarketWatchSnapshot,
  normalizeSymbol,
  toNumber,
} from "@/lib/dse-investor"

function mapToLivePriceRows(
  rows: ReturnType<typeof extractSnapshotRows>
) {
  return rows
    .map((item, index) => {
      const company = normalizeSymbol(item.symbol) || `SYM${index + 1}`
      if (!company) return null

      const price = toNumber(item.lastPrice)
      const percentageChange = toNumber(item.priceChangePct)

      return {
        id: index + 1,
        company,
        price,
        change: percentageChange,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

let cachedLivePrices: { success: boolean; data: Array<{ id: number; company: string; price: number; change: number }> } | null = null

export async function GET() {
  try {
    const result = await fetchMarketWatchSnapshot(30)

    if (!result.ok || result.data?.code !== SNAPSHOT_SUCCESS_CODE) {
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

    const mapped = mapToLivePriceRows(extractSnapshotRows(result.data))
    const payload = { success: true, data: mapped }
    cachedLivePrices = payload

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "x-dse-stale": "0",
        "x-dse-source": "market-watch-snapshot",
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
