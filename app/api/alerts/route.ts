import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fetchCurrentPriceBySymbol } from "@/lib/market-price"
import { mapPriceAlertRow, toAlertDirection, type PriceAlertRow } from "@/lib/alerts"

const createAlertSchema = z.object({
  companyId: z.number().int().positive(),
  companySymbol: z.string().trim().min(1).max(20),
  companyName: z.string().trim().min(1).max(200),
  targetPrice: z.number().positive(),
  comment: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
})

async function getAuthedUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const alerts = ((data ?? []) as PriceAlertRow[]).map(mapPriceAlertRow)
    return NextResponse.json(alerts)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch alerts",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getAuthedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rawPayload = await request.json()
    const parsed = createAlertSchema.safeParse(rawPayload)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid alert payload" }, { status: 400 })
    }

    const payload = parsed.data
    const marketPrice = await fetchCurrentPriceBySymbol(payload.companySymbol)
    const referencePrice = marketPrice && marketPrice > 0 ? marketPrice : payload.targetPrice
    const direction = toAlertDirection(payload.targetPrice, referencePrice)

    const { data, error } = await supabase
      .from("price_alerts")
      .insert({
        user_id: user.id,
        company_id: payload.companyId,
        company_symbol: payload.companySymbol,
        company_name: payload.companyName,
        target_price: payload.targetPrice,
        direction,
        comment: payload.comment?.trim() || null,
        expires_at: payload.expiresAt ?? null,
        active: true,
        last_checked_price: referencePrice,
      })
      .select("*")
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create alert" },
        { status: 500 }
      )
    }

    return NextResponse.json(mapPriceAlertRow(data as PriceAlertRow), { status: 201 })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create alert",
      },
      { status: 500 }
    )
  }
}
