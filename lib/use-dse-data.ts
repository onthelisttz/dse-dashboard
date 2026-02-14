import useSWR from "swr"
import type { MarketDataItem, StatisticsItem, LivePriceResponse, MarketMetaResponse } from "./types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function useMarketData() {
  return useSWR<MarketDataItem[]>("/api/market-data", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
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
      refreshInterval: 60000,
      revalidateOnFocus: true,
    }
  )
}

export function useLivePrices() {
  return useSWR<LivePriceResponse>("/api/live-prices", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  })
}

export function useMarketMeta() {
  return useSWR<MarketMetaResponse>("/api/market-meta", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  })
}
