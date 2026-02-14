import { NextResponse } from "next/server"

export async function GET() {
  try {
    const res = await fetch("https://dse.co.tz/api/get/live/market/prices", {
      next: { revalidate: 30 },
    })
    if (!res.ok) throw new Error("Failed to fetch live prices")
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Failed to fetch live prices" }, { status: 500 })
  }
}
