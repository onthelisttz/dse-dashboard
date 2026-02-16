import nodemailer from "nodemailer"
import type { PriceAlert } from "@/lib/types"

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (transporter) return transporter

  const host = process.env.MAIL_HOST
  const port = Number(process.env.MAIL_PORT ?? "465")
  const username = process.env.MAIL_USERNAME
  const password = process.env.MAIL_PASSWORD

  if (!host || !username || !password) {
    return null
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || process.env.MAIL_ENCRYPTION === "ssl",
    auth: {
      user: username,
      pass: password,
    },
  })

  return transporter
}

export async function sendAlertEmail(input: {
  to: string
  recipientName?: string | null
  alert: PriceAlert
  currentPrice: number
}) {
  const mailer = getTransporter()
  if (!mailer) {
    return { sent: false, reason: "mailer_not_configured" as const }
  }

  const fromAddress =
    process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME || "noreply@example.com"
  const fromName = process.env.MAIL_FROM_NAME || "DSE Dashboard"

  const directionWord = input.alert.direction === "above" ? "rose to" : "dropped to"
  const expiredNote = input.alert.expiresAt
    ? `Expiry: ${new Date(input.alert.expiresAt).toLocaleString()}`
    : "No expiry"

  await mailer.sendMail({
    from: `${fromName} <${fromAddress}>`,
    to: input.to,
    subject: `Price alert triggered: ${input.alert.companySymbol}`,
    text: [
      `Hello ${input.recipientName ?? "there"},`,
      "",
      `Your alert for ${input.alert.companySymbol} has triggered.`,
      `Target: TZS ${input.alert.targetPrice.toLocaleString()}`,
      `Current price ${directionWord} TZS ${input.currentPrice.toLocaleString()}`,
      expiredNote,
      input.alert.comment ? `Comment: ${input.alert.comment}` : "",
      "",
      "This alert is now marked inactive.",
    ]
      .filter(Boolean)
      .join("\n"),
  })

  return { sent: true as const }
}
