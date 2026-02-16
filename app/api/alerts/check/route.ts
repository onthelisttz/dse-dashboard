import { NextRequest, NextResponse } from "next/server"
import type { AlertDirection } from "@/lib/types"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchCurrentPriceBySymbol } from "@/lib/market-price"
import { mapPriceAlertRow, shouldTriggerAlert, type PriceAlertRow } from "@/lib/alerts"
import { sendAlertEmail } from "@/lib/email"
import { sendPushNotification } from "@/lib/push"

interface PushSubscriptionRow {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  const value = new Date(expiresAt).getTime()
  if (Number.isNaN(value)) return false
  return value <= Date.now()
}

function extractBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null
  const [scheme, token] = authorizationHeader.split(" ")
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== "bearer") return null
  return token
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET || process.env.ALERT_CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json(
        { error: "Missing CRON_SECRET or ALERT_CRON_SECRET" },
        { status: 500 }
      )
    }

    const bearerToken = extractBearerToken(request.headers.get("authorization"))
    const cronHeaderToken = request.headers.get("x-cron-secret")
    const querySecret = request.nextUrl.searchParams.get("secret")

    const providedSecret = bearerToken ?? cronHeaderToken ?? querySecret
    if (providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getSupabaseAdminClient()

    const { data: rawAlerts, error } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("active", true)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const alerts = (rawAlerts ?? []) as PriceAlertRow[]
    if (alerts.length === 0) {
      return NextResponse.json({
        scanned: 0,
        triggered: 0,
        deactivated: 0,
      })
    }

    const expiredAlerts = alerts.filter((alert) => isExpired(alert.expires_at))
    if (expiredAlerts.length > 0) {
      await Promise.all(
        expiredAlerts.map((alert) =>
          supabase
            .from("price_alerts")
            .update({
              active: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", alert.id)
        )
      )
    }

    const activeAlerts = alerts.filter((alert) => !isExpired(alert.expires_at))
    const uniqueSymbols = Array.from(
      new Set(activeAlerts.map((alert) => alert.company_symbol))
    )

    const priceBySymbol = new Map<string, number | null>()
    await Promise.all(
      uniqueSymbols.map(async (symbol) => {
        const price = await fetchCurrentPriceBySymbol(symbol)
        priceBySymbol.set(symbol, price)
      })
    )

    const triggeredAlerts = activeAlerts.filter((alert) => {
      const currentPrice = priceBySymbol.get(alert.company_symbol)
      if (!currentPrice || currentPrice <= 0) return false
      return shouldTriggerAlert(
        alert.direction as AlertDirection,
        Number(alert.target_price),
        currentPrice
      )
    })

    if (triggeredAlerts.length === 0) {
      return NextResponse.json({
        scanned: alerts.length,
        triggered: 0,
        deactivated: expiredAlerts.length,
      })
    }

    const triggeredUserIds = Array.from(new Set(triggeredAlerts.map((alert) => alert.user_id)))

    const { data: subscriptionsRaw } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", triggeredUserIds)
    const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>()

    ;((subscriptionsRaw ?? []) as PushSubscriptionRow[]).forEach((subscription) => {
      const list = subscriptionsByUser.get(subscription.user_id) ?? []
      list.push(subscription)
      subscriptionsByUser.set(subscription.user_id, list)
    })

    const userInfoCache = new Map<string, { email: string | null; name: string | null }>()

    let sentEmails = 0
    let sentPush = 0

    for (const alertRow of triggeredAlerts) {
      const currentPrice = priceBySymbol.get(alertRow.company_symbol)
      if (!currentPrice || currentPrice <= 0) continue

      const userInfo = userInfoCache.get(alertRow.user_id)
      let email = userInfo?.email ?? null
      let name = userInfo?.name ?? null

      if (!userInfo) {
        const { data: userData } = await supabase.auth.admin.getUserById(alertRow.user_id)
        email = userData?.user?.email ?? null
        name =
          (userData?.user?.user_metadata?.full_name as string | undefined) ??
          (userData?.user?.user_metadata?.name as string | undefined) ??
          null
        userInfoCache.set(alertRow.user_id, { email, name })
      }

      const mappedAlert = mapPriceAlertRow(alertRow)

      if (email) {
        const emailResult = await sendAlertEmail({
          to: email,
          recipientName: name,
          alert: mappedAlert,
          currentPrice,
        })
        if (emailResult.sent) {
          sentEmails += 1
        }
      }

      const subscriptions = subscriptionsByUser.get(alertRow.user_id) ?? []
      for (const subscription of subscriptions) {
        const pushResult = await sendPushNotification(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          {
            title: `Price alert: ${alertRow.company_symbol}`,
            body: `Target TZS ${Number(alertRow.target_price).toLocaleString()} reached. Current TZS ${currentPrice.toLocaleString()}.`,
            data: {
              url: "/",
              alertId: alertRow.id,
              companyId: alertRow.company_id,
            },
          }
        )

        if (pushResult.sent) {
          sentPush += 1
        }
      }

      await supabase
        .from("price_alerts")
        .update({
          active: false,
          triggered_at: new Date().toISOString(),
          last_checked_price: currentPrice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertRow.id)
    }

    return NextResponse.json({
      scanned: alerts.length,
      triggered: triggeredAlerts.length,
      deactivated: expiredAlerts.length + triggeredAlerts.length,
      sentEmails,
      sentPush,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process alerts",
      },
      { status: 500 }
    )
  }
}
