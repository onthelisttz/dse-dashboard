import {
  SNAPSHOT_SUCCESS_CODE,
  extractSnapshotRows,
  fetchMarketWatchSnapshot,
  normalizeSymbol,
  toNumber,
} from "@/lib/dse-investor"

export async function fetchCurrentPriceBySymbol(symbol: string): Promise<number | null> {
  const target = normalizeSymbol(symbol)
  if (!target) return null

  const result = await fetchMarketWatchSnapshot(30)
  if (!result.ok || result.data?.code !== SNAPSHOT_SUCCESS_CODE) {
    return null
  }

  const match = extractSnapshotRows(result.data).find(
    (item) => normalizeSymbol(item.symbol) === target
  )
  if (!match) {
    return null
  }

  const lastPrice = toNumber(match.lastPrice)
  if (lastPrice > 0) {
    return lastPrice
  }

  const bestBid = toNumber(match.bestBidPrice)
  return bestBid > 0 ? bestBid : null
}
