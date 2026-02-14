import { NextResponse } from "next/server"

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

function parseNumber(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number(value.replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

export async function GET() {
  try {
    const [statusRes, lastTradeRes] = await Promise.all([
      fetch("https://data.dse.co.tz/api/is/market/closed", { next: { revalidate: 60 } }),
      fetch("https://dse.co.tz/get/last/trade/date", { next: { revalidate: 60 } }),
    ])

    const statusPayload = statusRes.ok ? ((await statusRes.json()) as StatusResponse) : null
    const lastTradePayload = lastTradeRes.ok
      ? ((await lastTradeRes.json()) as LastTradeDateResponse)
      : null

    const statusText = statusPayload?.data ?? "Unknown"
    const marketOpen = !/closed/i.test(statusText)
    const lastTradeDate = lastTradePayload?.data ?? null

    let overview = null
    if (lastTradeDate) {
      const overviewRes = await fetch(
        `https://dse.co.tz/get/market/over/view?to_date=${encodeURIComponent(lastTradeDate)}`,
        { next: { revalidate: 60 } }
      )
      if (overviewRes.ok) {
        const overviewPayload = (await overviewRes.json()) as OverviewResponse
        overview = {
          volume: parseNumber(overviewPayload.volume),
          turnover: parseNumber(overviewPayload.turn_over),
          deals: parseNumber(overviewPayload.deals),
          mCapAggregate: parseNumber(overviewPayload.m_cap_aggregate),
        }
      }
    }

    return NextResponse.json({
      marketOpen,
      statusText,
      lastTradeDate,
      overview,
      updatedAt: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch market meta" }, { status: 500 })
  }
}
