import { NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"

let cachedLivePrices: unknown = null

export async function GET() {
  try {
    const result = await fetchJsonWithTimeout<unknown>(
      "https://dse.co.tz/api/get/live/market/prices",
      {
      next: { revalidate: 30 },
      timeoutMs: 7000,
      }
    )

    if (!result.ok || !result.data) {
      if (cachedLivePrices) {
        return NextResponse.json(cachedLivePrices, {
          status: 200,
          headers: {
            "x-dse-stale": "1",
            "cache-control": "no-store",
          },
        })
      }
      return NextResponse.json({ success: false, data: [] }, {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "cache-control": "no-store",
        },
      })
    }

    cachedLivePrices = result.data
    return NextResponse.json(result.data, {
      status: 200,
      headers: {
        "x-dse-stale": "0",
      },
    })
  } catch {
    if (cachedLivePrices) {
      return NextResponse.json(cachedLivePrices, {
        status: 200,
        headers: {
          "x-dse-stale": "1",
          "cache-control": "no-store",
        },
      })
    }
    return NextResponse.json({ success: false, data: [] }, {
      status: 200,
      headers: {
        "x-dse-stale": "1",
        "cache-control": "no-store",
      },
    })
  }
}
