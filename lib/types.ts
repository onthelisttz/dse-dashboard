export interface CompanyInfo {
  id: number
  uid: string
  name: string
  symbol: string
  securityId: string
  capSize: number
}

export interface SecurityInfo {
  id: number
  symbol: string
  securityId: string
  securityType: string
  securityDesc: string
  bestOfferPrice: number
  bestOfferQuantity: number
  bestBidPrice: number
  bestBidQuantity: number
  totalSharesIssued: number
}

export interface MarketDataItem {
  id: number
  company: CompanyInfo
  security: SecurityInfo
  marketPrice: number
  openingPrice: number
  // Percentage change from official DSE market overview feed.
  change: number
  percentageChange: number
  // Optional absolute change derived from latest close - open.
  changeValue?: number
  marketCap: number
  high: number
  low: number
  volume: number
  minLimit: number
  maxLimit: number
  bestOfferPrice: number
  bestOfferQuantity: number
  bestBidPrice: number
  bestBidQuantity: number
  // Optional date of the latest row used for this item.
  lastTradeDate?: string | null
}

export interface StatisticsItem {
  id: number
  trade_date: string
  company: string
  turnover: number
  volume: number
  high: number
  low: number
  opening_price: number
  closing_price: number
  shares_in_issue: number
  market_cap: number
}

export interface LivePriceItem {
  id: number
  company: string
  price: number
  change: number
}

export interface LivePriceResponse {
  success: boolean
  data: LivePriceItem[]
}

export interface MarketOverviewMeta {
  volume: number
  turnover: number
  deals: number
  mCapAggregate: number
}

export interface MarketMetaResponse {
  marketOpen: boolean
  statusText: string
  lastTradeDate: string | null
  overview: MarketOverviewMeta | null
  updatedAt: string
}

export type AlertDirection = "above" | "below"

export interface PriceAlert {
  id: string
  userId: string
  companyId: number
  companySymbol: string
  companyName: string
  targetPrice: number
  direction: AlertDirection
  comment: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  active: boolean
  triggeredAt: string | null
  lastCheckedPrice: number | null
}

export interface CreatePriceAlertInput {
  companyId: number
  companySymbol: string
  companyName: string
  targetPrice: number
  comment?: string
  expiresAt?: string | null
}

export interface UpdatePriceAlertInput {
  targetPrice?: number
  comment?: string | null
  expiresAt?: string | null
  active?: boolean
}
