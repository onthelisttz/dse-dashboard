import webPush from "web-push"

interface PushSubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
}

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return true

  const subject = process.env.WEB_PUSH_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY

  if (!subject || !publicKey || !privateKey) {
    return false
  }

  webPush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export function getWebPushPublicKey() {
  return process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? ""
}

export async function sendPushNotification(
  subscription: PushSubscriptionRecord,
  payload: Record<string, unknown>
) {
  if (!ensureVapid()) {
    return { sent: false, reason: "push_not_configured" as const }
  }

  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    )

    return { sent: true as const }
  } catch (error) {
    return {
      sent: false as const,
      reason: "send_failed" as const,
      error,
    }
  }
}
