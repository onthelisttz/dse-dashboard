self.addEventListener("push", (event) => {
  let payload = {
    title: "Price Alert",
    body: "A tracked price alert was triggered.",
    data: { url: "/" },
  }

  try {
    const data = event.data?.json()
    if (data && typeof data === "object") {
      payload = {
        ...payload,
        ...data,
      }
    }
  } catch {
    // Keep defaults when payload cannot be parsed.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: payload.data,
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url || "/"

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
      return null
    })
  )
})
