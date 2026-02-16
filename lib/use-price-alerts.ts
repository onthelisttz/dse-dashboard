"use client"

import useSWR from "swr"
import type {
  CreatePriceAlertInput,
  PriceAlert,
  UpdatePriceAlertInput,
} from "@/lib/types"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error("Failed to fetch alerts")
  }
  return (await res.json()) as PriceAlert[]
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? "Request failed")
  }
  return (await response.json()) as T
}

export function usePriceAlerts() {
  const swr = useSWR<PriceAlert[]>("/api/alerts", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  })

  const createAlert = async (input: CreatePriceAlertInput) => {
    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    })

    const created = await parseJsonResponse<PriceAlert>(response)
    await swr.mutate((prev) => [created, ...(prev ?? [])], false)
    return created
  }

  const updateAlert = async (alertId: string, patch: UpdatePriceAlertInput) => {
    const response = await fetch(`/api/alerts/${alertId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    })

    const updated = await parseJsonResponse<PriceAlert>(response)
    await swr.mutate(
      (prev) =>
        (prev ?? []).map((item) => (item.id === updated.id ? updated : item)),
      false
    )
    return updated
  }

  const deleteAlert = async (alertId: string) => {
    const response = await fetch(`/api/alerts/${alertId}`, {
      method: "DELETE",
    })
    await parseJsonResponse<{ success: true }>(response)
    await swr.mutate((prev) => (prev ?? []).filter((item) => item.id !== alertId), false)
  }

  return {
    ...swr,
    alerts: swr.data ?? [],
    createAlert,
    updateAlert,
    deleteAlert,
  }
}
