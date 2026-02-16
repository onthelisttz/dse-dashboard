import useSWR from "swr"
import type { MarketDataItem, StatisticsItem, LivePriceResponse, MarketMetaResponse } from "./types"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "Request failed")
        : "Request failed"
    throw new Error(errorMessage)
  }

  return payload
}

const SWR_BASE_CONFIG = {
  revalidateOnFocus: false,
  dedupingInterval: 8000,
  focusThrottleInterval: 10000,
  errorRetryCount: 1,
  errorRetryInterval: 8000,
} as const

export function useMarketData() {
  return useSWR<MarketDataItem[]>("/api/market-data", fetcher, {
    ...SWR_BASE_CONFIG,
    refreshInterval: 60000,
  })
}

export function useStatistics(companyId: number, days: number, symbol?: string) {
  const params = new URLSearchParams({ days: String(days) })
  if (symbol) {
    params.set("symbol", symbol)
  } else {
    params.set("companyId", String(companyId))
  }

  return useSWR<StatisticsItem[]>(
    `/api/statistics?${params.toString()}`,
    fetcher,
    {
      ...SWR_BASE_CONFIG,
      keepPreviousData: true,
      refreshInterval: 60000,
    }
  )
}

export function useLivePrices() {
  return useSWR<LivePriceResponse>("/api/live-prices", fetcher, {
    ...SWR_BASE_CONFIG,
    refreshInterval: 30000,
  })
}

export function useMarketMeta() {
  return useSWR<MarketMetaResponse>("/api/market-meta", fetcher, {
    ...SWR_BASE_CONFIG,
    refreshInterval: 60000,
  })
}
