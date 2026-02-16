import type { AlertDirection, PriceAlert } from "@/lib/types"

export interface PriceAlertRow {
  id: string
  user_id: string
  company_id: number
  company_symbol: string
  company_name: string
  target_price: number | string
  direction: AlertDirection
  comment: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
  active: boolean
  triggered_at: string | null
  last_checked_price: number | string | null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function toAlertDirection(targetPrice: number, currentPrice: number): AlertDirection {
  return targetPrice >= currentPrice ? "above" : "below"
}

export function shouldTriggerAlert(
  direction: AlertDirection,
  targetPrice: number,
  currentPrice: number
) {
  if (direction === "above") {
    return currentPrice >= targetPrice
  }
  return currentPrice <= targetPrice
}

export function mapPriceAlertRow(row: PriceAlertRow): PriceAlert {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    companySymbol: row.company_symbol,
    companyName: row.company_name,
    targetPrice: toNumber(row.target_price),
    direction: row.direction,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    active: row.active,
    triggeredAt: row.triggered_at,
    lastCheckedPrice:
      row.last_checked_price == null ? null : toNumber(row.last_checked_price),
  }
}
