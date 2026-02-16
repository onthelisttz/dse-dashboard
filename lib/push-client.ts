"use client"

export interface PushNotificationStatus {
  supported: boolean
  permission: NotificationPermission | "unsupported"
  subscribed: boolean
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch("/api/alerts/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscription),
  })

  if (!response.ok) {
    throw new Error("Failed to save push subscription")
  }
}

async function removeSubscription(endpoint: string) {
  const response = await fetch("/api/alerts/subscriptions", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint }),
  })

  if (!response.ok) {
    throw new Error("Failed to remove push subscription")
  }
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!isPushSupported()) {
    return {
      supported: false,
      permission: "unsupported",
      subscribed: false,
    }
  }

  const permission = Notification.permission
  if (permission !== "granted") {
    return {
      supported: true,
      permission,
      subscribed: false,
    }
  }

  const registration = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  return {
    supported: true,
    permission,
    subscribed: subscription != null,
  }
}

export async function enablePushNotifications() {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser")
  }

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY
  if (!publicKey) {
    throw new Error("Missing NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY")
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error("Notification permission was denied")
  }

  const registration = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready

  const existingSubscription = await registration.pushManager.getSubscription()
  if (existingSubscription) {
    await saveSubscription(existingSubscription)
    return { enabled: true as const, reused: true as const }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  await saveSubscription(subscription)
  return { enabled: true as const, reused: false as const }
}

export async function disablePushNotifications() {
  if (!isPushSupported()) {
    return { disabled: false as const, reason: "not_supported" as const }
  }

  const registration = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    return { disabled: true as const, removed: false as const }
  }

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await removeSubscription(endpoint)

  return { disabled: true as const, removed: true as const }
}
