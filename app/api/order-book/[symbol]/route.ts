import { NextResponse } from "next/server"
import {
  SNAPSHOT_SUCCESS_CODE,
  fetchOrderBookDepth,
  normalizeOrderBookDepth,
  normalizeSymbol,
} from "@/lib/dse-investor"

const DEFAULT_LEVELS = 10
const MAX_LEVELS = 50

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await context.params
  const symbol = normalizeSymbol(decodeURIComponent(rawSymbol))

  if (!symbol) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const requestedLevels = Number(searchParams.get("levels"))
  const levels =
    Number.isInteger(requestedLevels) && requestedLevels > 0
      ? Math.min(requestedLevels, MAX_LEVELS)
      : DEFAULT_LEVELS

  const result = await fetchOrderBookDepth(symbol, levels)

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "Failed to fetch order book" },
      { status: result.status > 0 ? result.status : 502 }
    )
  }

  if (result.data.code !== SNAPSHOT_SUCCESS_CODE) {
    return NextResponse.json(
      { error: `Order book unavailable for ${symbol}` },
      { status: 404, headers: { "x-dse-source": "order-book" } }
    )
  }

  return NextResponse.json(normalizeOrderBookDepth(symbol, result.data), {
    status: 200,
    headers: {
      "x-dse-stale": "0",
      "x-dse-source": "order-book",
      "cache-control": "no-store",
    },
  })
}
