import { fetchJsonWithTimeout } from "@/lib/server-fetch"

const INVESTOR_ORIGIN = "https://investor.dse.co.tz"

export const MARKET_WATCH_SNAPSHOT_URL = `${INVESTOR_ORIGIN}/core/api/v1/market-watch/snapshot`
export const ORDER_BOOK_DEPTH_URL = `${INVESTOR_ORIGIN}/oms/api/v1/order-book`

export const SNAPSHOT_SUCCESS_CODE = "2000"

export interface SnapshotRow {
  symbol?: string | null
  securityId?: string | null
  securityType?: string | null
  name?: string | null
  bestBidQuantity?: number | string | null
  bestBidPrice?: number | string | null
  bestOfferPrice?: number | string | null
  bestOfferQuantity?: number | string | null
  lastPrice?: number | string | null
  priceChange?: number | string | null
  priceChangePct?: number | string | null
  isGain?: boolean | null
  high?: number | string | null
  low?: number | string | null
  volume?: number | string | null
  marketCap?: number | string | null
  updatedAt?: string | null
}

export interface SnapshotResponse {
  code?: string
  data?: {
    lastRefreshedAt?: string | null
    page?: {
      content?: SnapshotRow[] | null
      page?: number
      size?: number
      totalElements?: number
      totalPages?: number
      first?: boolean
      last?: boolean
    } | null
  } | null
}

export interface OrderBookLevel {
  level?: number
  price?: number | string | null
  quantity?: number | string | null
  entryCount?: number | string | null
  mdEntryId?: string | null
}

export interface OrderBookDepthResponse {
  code?: string
  data?: {
    symbol?: string | null
    securityId?: string | null
    spread?: number | string | null
    midPrice?: number | string | null
    bookVersion?: number | null
    bookState?: string | null
    stale?: boolean | null
    staleReason?: string | null
    complete?: boolean | null
    sourceTimestamp?: string | null
    lastUpdatedAt?: string | null
    sourceAgeSeconds?: number | null
    bids?: OrderBookLevel[] | null
    asks?: OrderBookLevel[] | null
  } | null
}

export interface OrderBookRow {
  buyPrice: number
  buyQuantity: number
  sellPrice: number
  sellQuantity: number
}

export interface OrderBookSnapshot {
  symbol: string
  bestBuyPrice: number
  bestSellPrice: number
  spread: number
  midPrice: number
  bookState: string
  stale: boolean
  lastUpdatedAt: string | null
  orders: OrderBookRow[]
}

export function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}

/**
 * The investor portal snapshot is ordered by volume, so a row's index is not a
 * stable identity. Symbols listed here keep a fixed numeric id across refreshes
 * so the UI selection does not jump when the market order changes.
 */
const SYMBOL_IDS: Record<string, number> = {
  TBL: 1,
  NMB: 2,
  CRDB: 3,
  VODA: 4,
  KCB: 5,
  MCB: 6,
  NICO: 7,
  TPCC: 8,
  TOL: 9,
  TCC: 10,
  TTP: 11,
  PAL: 12,
  JHL: 13,
  DCB: 14,
  MUCOBA: 15,
  SWIS: 16,
  EABL: 17,
  MBP: 18,
  MKCB: 19,
  TCCL: 20,
  JATU: 21,
  NMG: 22,
  USL: 23,
  KA: 24,
  DSE: 25,
  "VERTEX-ETF": 26,
  "IEACLC-ETF": 27,
  "AFRIPRISE": 28,
}

const FALLBACK_ID_BASE = 100_000

function hashSymbol(symbol: string): number {
  let hash = 2166136261
  for (let index = 0; index < symbol.length; index += 1) {
    hash ^= symbol.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash % FALLBACK_ID_BASE) + FALLBACK_ID_BASE
}

export function symbolToId(symbol: string): number {
  return SYMBOL_IDS[symbol] ?? hashSymbol(symbol)
}

export function normalizeSymbol(value: string | null | undefined): string {
  if (typeof value !== "string") return ""
  return value.trim().toUpperCase()
}

export async function fetchMarketWatchSnapshot(revalidate = 30) {
  return fetchJsonWithTimeout<SnapshotResponse>(
    `${MARKET_WATCH_SNAPSHOT_URL}?page=0&size=200&sort=volume,desc`,
    {
      next: { revalidate },
      timeoutMs: 8000,
    }
  )
}

export function extractSnapshotRows(payload: SnapshotResponse | null | undefined): SnapshotRow[] {
  const rows = payload?.data?.page?.content
  return Array.isArray(rows) ? rows : []
}

export function extractSnapshotLastRefreshedAt(
  payload: SnapshotResponse | null | undefined
): string | null {
  const value = payload?.data?.lastRefreshedAt
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

export async function fetchOrderBookDepth(symbol: string, levels = 10) {
  return fetchJsonWithTimeout<OrderBookDepthResponse>(
    `${ORDER_BOOK_DEPTH_URL}/${encodeURIComponent(symbol)}/depth?levels=${levels}`,
    {
      cache: "no-store",
      timeoutMs: 8000,
    }
  )
}

interface AggregatedLevel {
  price: number
  quantity: number
}

function aggregateLevels(
  levels: OrderBookLevel[] | null | undefined,
  direction: "desc" | "asc"
): AggregatedLevel[] {
  const totals = new Map<number, number>()

  for (const level of levels ?? []) {
    const price = toNumber(level.price)
    if (price <= 0) continue
    const quantity = toNumber(level.quantity)
    if (quantity <= 0) continue
    totals.set(price, (totals.get(price) ?? 0) + quantity)
  }

  return [...totals.entries()]
    .map(([price, quantity]) => ({ price, quantity }))
    .sort((a, b) => (direction === "desc" ? b.price - a.price : a.price - b.price))
}

export function normalizeOrderBookDepth(
  symbol: string,
  payload: OrderBookDepthResponse | null | undefined
): OrderBookSnapshot {
  const data = payload?.data
  const bids = aggregateLevels(data?.bids, "desc")
  const asks = aggregateLevels(data?.asks, "asc")

  const depth = Math.max(bids.length, asks.length)
  const orders: OrderBookRow[] = Array.from({ length: depth }, (_, index) => ({
    buyPrice: bids[index]?.price ?? 0,
    buyQuantity: bids[index]?.quantity ?? 0,
    sellPrice: asks[index]?.price ?? 0,
    sellQuantity: asks[index]?.quantity ?? 0,
  }))

  const bestBuyPrice = bids[0]?.price ?? 0
  const bestSellPrice = asks[0]?.price ?? 0
  const spread =
    toNumber(data?.spread) || (bestBuyPrice > 0 && bestSellPrice > 0 ? bestSellPrice - bestBuyPrice : 0)
  const midPrice = toNumber(data?.midPrice) || (bestBuyPrice + bestSellPrice) / 2

  return {
    symbol: normalizeSymbol(data?.symbol) || symbol,
    bestBuyPrice,
    bestSellPrice,
    spread: round2(spread),
    midPrice: round2(midPrice),
    bookState: data?.bookState?.trim() ?? "",
    stale: data?.stale === true,
    lastUpdatedAt: data?.lastUpdatedAt ?? data?.sourceTimestamp ?? null,
    orders,
  }
}
