import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fetchCurrentPriceBySymbol } from "@/lib/market-price"
import { mapPriceAlertRow, toAlertDirection, type PriceAlertRow } from "@/lib/alerts"

const updateAlertSchema = z
  .object({
    targetPrice: z.number().positive().optional(),
    comment: z.string().trim().max(500).optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.targetPrice !== undefined ||
      value.comment !== undefined ||
      value.expiresAt !== undefined ||
      value.active !== undefined,
    {
      message: "No fields provided for update",
    }
  )

async function getAuthedUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { supabase, user } = await getAuthedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = updateAlertSchema.safeParse(await request.json())
    if (!payload.success) {
      return NextResponse.json({ error: "Invalid alert update payload" }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 })
    }

    const patch: Record<string, unknown> = {}
    if (payload.data.targetPrice !== undefined) {
      patch.target_price = payload.data.targetPrice
      const marketPrice = await fetchCurrentPriceBySymbol(
        (existing as PriceAlertRow).company_symbol
      )
      const referencePrice = marketPrice && marketPrice > 0 ? marketPrice : payload.data.targetPrice
      patch.direction = toAlertDirection(payload.data.targetPrice, referencePrice)
      patch.last_checked_price = referencePrice
    }

    if (payload.data.comment !== undefined) {
      patch.comment = payload.data.comment?.trim() || null
    }
    if (payload.data.expiresAt !== undefined) {
      patch.expires_at = payload.data.expiresAt
    }
    if (payload.data.active !== undefined) {
      patch.active = payload.data.active
      if (payload.data.active) {
        patch.triggered_at = null
      }
    }

    const { data, error } = await supabase
      .from("price_alerts")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to update alert" },
        { status: 500 }
      )
    }

    return NextResponse.json(mapPriceAlertRow(data as PriceAlertRow))
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update alert",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { supabase, user } = await getAuthedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("price_alerts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete alert",
      },
      { status: 500 }
    )
  }
}
