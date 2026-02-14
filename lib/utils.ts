import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatPercent(
  value: number,
  options: { signed?: boolean } = {}
): string {
  if (!Number.isFinite(value) || value === 0) return "0"

  const formatted = percentFormatter.format(Math.abs(value))
  if (options.signed) {
    return value > 0 ? `+${formatted}` : `-${formatted}`
  }

  return value > 0 ? formatted : `-${formatted}`
}
