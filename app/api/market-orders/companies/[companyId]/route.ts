import { NextResponse } from "next/server"
import { fetchJsonWithTimeout } from "@/lib/server-fetch"

interface UpstreamOrderRow {
  buyPrice?: number | string | null
  buyQuantity?: number | string | null
  sellPrice?: number | string | null
  sellQuantity?: number | string | null
}

interface UpstreamMarketOrdersResponse {
  bestSellPrice?: number | string | null
  bestBuyPrice?: number | string | null
  orders?: UpstreamOrderRow[] | null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await context.params
  const parsedCompanyId = Number(companyId)

  if (!Number.isInteger(parsedCompanyId) || parsedCompanyId <= 0) {
    return NextResponse.json({ error: "Invalid companyId" }, { status: 400 })
  }

  const result = await fetchJsonWithTimeout<UpstreamMarketOrdersResponse>(
    `https://api.dse.co.tz/api/market-orders/companies/${encodeURIComponent(companyId)}`,
    {
      next: { revalidate: 30 },
      timeoutMs: 7000,
    }
  )

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "Failed to fetch market orders" },
      { status: result.status > 0 ? result.status : 502 }
    )
  }

  const payload = result.data

  return NextResponse.json(
    {
      bestSellPrice: toNumber(payload.bestSellPrice),
      bestBuyPrice: toNumber(payload.bestBuyPrice),
      orders: Array.isArray(payload.orders)
        ? payload.orders.map((order) => ({
            buyPrice: toNumber(order.buyPrice),
            buyQuantity: toNumber(order.buyQuantity),
            sellPrice: toNumber(order.sellPrice),
            sellQuantity: toNumber(order.sellQuantity),
          }))
        : [],
    },
    {
      status: 200,
      headers: {
        "x-dse-stale": "0",
        "x-dse-source": "market-orders",
      },
    }
  )
}
