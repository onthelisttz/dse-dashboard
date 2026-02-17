"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import type { MarketDataItem } from "@/lib/types"

interface OrderBookProps {
  selectedCompany: MarketDataItem | null
}

type TradeDirection = "buy" | "sell"

const SAMPLE_NOTIONAL = 8400
const FEE_RATES = {
  broker: 169 / SAMPLE_NOTIONAL,
  cmsa: 12 / SAMPLE_NOTIONAL,
  csdr: 6 / SAMPLE_NOTIONAL,
  dse: 14 / SAMPLE_NOTIONAL,
  fidelity: 2 / SAMPLE_NOTIONAL,
} as const
const TOTAL_FEE_RATE = Object.values(FEE_RATES).reduce((sum, rate) => sum + rate, 0)

const FEE_LABELS: Record<keyof typeof FEE_RATES, string> = {
  broker: "Broker",
  cmsa: "CMSA",
  csdr: "CSDR",
  dse: "DSE",
  fidelity: "Fidelity",
}

function parseInputNumber(value: string): number {
  const parsed = Number(value.replace(/,/g, "").trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function formatThousandsInput(value: string): string {
  const digitsOnly = value.replace(/[^\d]/g, "")
  if (!digitsOnly) return ""

  const normalized = digitsOnly.replace(/^0+(?=\d)/, "")
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function toRoundedAmount(value: number): number {
  return Math.round(value)
}

function buildFeeBreakdown(notional: number) {
  const breakdown = {
    broker: toRoundedAmount(notional * FEE_RATES.broker),
    cmsa: toRoundedAmount(notional * FEE_RATES.cmsa),
    csdr: toRoundedAmount(notional * FEE_RATES.csdr),
    dse: toRoundedAmount(notional * FEE_RATES.dse),
    fidelity: toRoundedAmount(notional * FEE_RATES.fidelity),
  }
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0)
  return { breakdown, total }
}

export function OrderBook({ selectedCompany }: OrderBookProps) {
  const [direction, setDirection] = useState<TradeDirection>("buy")
  const [entryPriceInput, setEntryPriceInput] = useState("")
  const [exitPriceInput, setExitPriceInput] = useState("")
  const [sharesInput, setSharesInput] = useState("")
  const [amountInput, setAmountInput] = useState("")
  const [quantityDriver, setQuantityDriver] = useState<"shares" | "amount">("shares")

  useEffect(() => {
    if (!selectedCompany) return
    const seedPrice =
      selectedCompany.marketPrice > 0
        ? selectedCompany.marketPrice
        : selectedCompany.bestOfferPrice > 0
          ? selectedCompany.bestOfferPrice
          : selectedCompany.bestBidPrice
    const safeSeed = seedPrice > 0 ? Math.round(seedPrice) : 0

    setDirection("buy")
    setEntryPriceInput(safeSeed > 0 ? formatThousandsInput(String(safeSeed)) : "")
    setExitPriceInput(safeSeed > 0 ? formatThousandsInput(String(safeSeed)) : "")
    setSharesInput(formatThousandsInput("100"))
    setAmountInput(safeSeed > 0 ? formatThousandsInput(String(safeSeed * 100)) : "")
    setQuantityDriver("shares")
  }, [selectedCompany?.company.id])
  const calculator = useMemo(() => {
    const entryPrice = parseInputNumber(entryPriceInput)
    const exitPrice = parseInputNumber(exitPriceInput)
    const shares = Math.max(0, Math.floor(parseInputNumber(sharesInput)))
    const isValid = entryPrice > 0 && exitPrice > 0 && shares > 0

    if (!isValid) {
      return {
        isValid: false,
        entryPrice,
        exitPrice,
        shares,
        entryGross: 0,
        exitGross: 0,
        entryFees: { breakdown: { broker: 0, cmsa: 0, csdr: 0, dse: 0, fidelity: 0 }, total: 0 },
        exitFees: { breakdown: { broker: 0, cmsa: 0, csdr: 0, dse: 0, fidelity: 0 }, total: 0 },
        netPnl: 0,
        returnPct: 0,
        breakEvenPrice: 0,
      }
    }

    const entryGross = entryPrice * shares
    const exitGross = exitPrice * shares
    const entryFees = buildFeeBreakdown(entryGross)
    const exitFees = buildFeeBreakdown(exitGross)

    const netPnl =
      direction === "buy"
        ? exitGross - exitFees.total - (entryGross + entryFees.total)
        : entryGross - entryFees.total - (exitGross + exitFees.total)

    const baseCapital = entryGross + entryFees.total
    const returnPct = baseCapital > 0 ? (netPnl / baseCapital) * 100 : 0

    const breakEvenPrice =
      direction === "buy"
        ? entryPrice * ((1 + TOTAL_FEE_RATE) / (1 - TOTAL_FEE_RATE))
        : entryPrice * ((1 - TOTAL_FEE_RATE) / (1 + TOTAL_FEE_RATE))

    return {
      isValid: true,
      entryPrice,
      exitPrice,
      shares,
      entryGross,
      exitGross,
      entryFees,
      exitFees,
      netPnl,
      returnPct,
      breakEvenPrice,
    }
  }, [direction, entryPriceInput, exitPriceInput, sharesInput])

  const handleEntryPriceChange = (value: string) => {
    const formattedValue = formatThousandsInput(value)
    setEntryPriceInput(formattedValue)
    const entryPrice = parseInputNumber(formattedValue)

    if (formattedValue.trim() === "" || entryPrice <= 0) {
      return
    }

    if (quantityDriver === "shares") {
      const shares = Math.max(0, Math.floor(parseInputNumber(sharesInput)))
      if (sharesInput.trim() !== "") {
        setAmountInput(formatThousandsInput(String(shares * entryPrice)))
      }
      return
    }

    const amount = Math.max(0, parseInputNumber(amountInput))
    if (amountInput.trim() !== "") {
      setSharesInput(formatThousandsInput(String(Math.floor(amount / entryPrice))))
    }
  }

  const handleSharesChange = (value: string) => {
    const formattedValue = formatThousandsInput(value)
    setSharesInput(formattedValue)
    setQuantityDriver("shares")

    const entryPrice = parseInputNumber(entryPriceInput)
    if (formattedValue.trim() === "" || entryPrice <= 0) {
      setAmountInput("")
      return
    }

    const shares = Math.max(0, Math.floor(parseInputNumber(formattedValue)))
    setAmountInput(formatThousandsInput(String(shares * entryPrice)))
  }

  const handleAmountChange = (value: string) => {
    const formattedValue = formatThousandsInput(value)
    setAmountInput(formattedValue)
    setQuantityDriver("amount")

    const entryPrice = parseInputNumber(entryPriceInput)
    if (formattedValue.trim() === "" || entryPrice <= 0) {
      setSharesInput("")
      return
    }

    const amount = Math.max(0, parseInputNumber(formattedValue))
    setSharesInput(formatThousandsInput(String(Math.floor(amount / entryPrice))))
  }

  const handleDirectionChange = (value: string) => {
    if (value === "buy" || value === "sell") {
      setDirection(value)
    }
  }

  if (!selectedCompany) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Order Book</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a company to view order book</p>
        </CardContent>
      </Card>
    )
  }

  const c = selectedCompany

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Order Book - {c.company.symbol}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="order-book" className="w-full">
          <TabsList className="h-8 w-full bg-secondary/30 p-0.5">
            <TabsTrigger value="order-book" className="h-7 flex-1 text-xs">
              Order Book
            </TabsTrigger>
            <TabsTrigger value="calculator" className="h-7 flex-1 text-xs">
              Calculator
            </TabsTrigger>
          </TabsList>

          <TabsContent value="order-book" className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Best Bid
              </h4>
              <div className="flex items-center justify-between rounded-md bg-gain/10 px-3 py-2">
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="text-sm font-bold text-gain">
                    TZS {c.bestBidPrice?.toLocaleString() ?? "N/A"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="text-sm font-semibold text-foreground">
                    {c.bestBidQuantity?.toLocaleString() ?? "N/A"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Best Offer
              </h4>
              <div className="flex items-center justify-between rounded-md bg-loss/10 px-3 py-2">
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="text-sm font-bold text-loss">
                    TZS {c.bestOfferPrice?.toLocaleString() ?? "N/A"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="text-sm font-semibold text-foreground">
                    {c.bestOfferQuantity?.toLocaleString() ?? "N/A"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Spread
              </h4>
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Bid-Ask Spread</p>
                <p className="text-sm font-semibold text-foreground">
                  TZS{" "}
                  {c.bestOfferPrice != null && c.bestBidPrice != null
                    ? (c.bestOfferPrice - c.bestBidPrice).toLocaleString()
                    : "N/A"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Security Details
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-muted px-2 py-1.5">
                  <span className="text-muted-foreground">Security ID</span>
                  <p className="font-medium text-foreground">{c.security?.securityId ?? "N/A"}</p>
                </div>
                <div className="rounded bg-muted px-2 py-1.5">
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium text-foreground">{c.security?.securityType ?? "N/A"}</p>
                </div>
                <div className="col-span-2 rounded bg-muted px-2 py-1.5">
                  <span className="text-muted-foreground">Description</span>
                  <p className="font-medium text-foreground">{c.security?.securityDesc ?? "N/A"}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="calculator" className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Direction</p>
              <RadioGroup
                value={direction}
                onValueChange={handleDirectionChange}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="direction-buy"
                  className="flex h-8 items-center gap-2 rounded-md border border-border bg-secondary px-2 text-xs font-medium text-foreground"
                >
                  <RadioGroupItem id="direction-buy" value="buy" />
                  Buy
                </Label>
                <Label
                  htmlFor="direction-sell"
                  className="flex h-8 items-center gap-2 rounded-md border border-border bg-secondary px-2 text-xs font-medium text-foreground"
                >
                  <RadioGroupItem id="direction-sell" value="sell" />
                  Sell
                </Label>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Entry Price (TZS)</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  value={entryPriceInput}
                  onChange={(event) => handleEntryPriceChange(event.target.value)}
                  className="h-8 border-border bg-secondary text-xs"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Exit Price (TZS)</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  value={exitPriceInput}
                  onChange={(event) => setExitPriceInput(formatThousandsInput(event.target.value))}
                  className="h-8 border-border bg-secondary text-xs"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Shares</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  value={sharesInput}
                  onChange={(event) => handleSharesChange(event.target.value)}
                  className="h-8 border-border bg-secondary text-xs"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Amount (TZS)</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  value={amountInput}
                  onChange={(event) => handleAmountChange(event.target.value)}
                  className="h-8 border-border bg-secondary text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-muted px-2 py-1.5">
                <p className="text-muted-foreground">Entry Amount</p>
                <p className="font-semibold text-foreground">TZS {calculator.entryGross.toLocaleString()}</p>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <p className="text-muted-foreground">Exit Amount</p>
                <p className="font-semibold text-foreground">TZS {calculator.exitGross.toLocaleString()}</p>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <p className="text-muted-foreground">Entry Fees</p>
                <p className="font-semibold text-foreground">TZS {calculator.entryFees.total.toLocaleString()}</p>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <p className="text-muted-foreground">Exit Fees</p>
                <p className="font-semibold text-foreground">TZS {calculator.exitFees.total.toLocaleString()}</p>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <p className="text-muted-foreground">Break-even Exit</p>
                <p className="font-semibold text-foreground">
                  TZS {calculator.breakEvenPrice > 0 ? Math.round(calculator.breakEvenPrice).toLocaleString() : "0"}
                </p>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <p className="text-muted-foreground">Return</p>
                <p
                  className={cn(
                    "font-semibold",
                    calculator.returnPct > 0
                      ? "text-gain"
                      : calculator.returnPct < 0
                        ? "text-loss"
                        : "text-foreground"
                  )}
                >
                  {calculator.returnPct.toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-secondary/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Estimated Net P/L</p>
              <p
                className={cn(
                  "text-base font-bold",
                  calculator.netPnl > 0
                    ? "text-gain"
                    : calculator.netPnl < 0
                      ? "text-loss"
                      : "text-foreground"
                )}
              >
                TZS {calculator.netPnl.toLocaleString()}
              </p>
            </div>

            <Accordion type="single" collapsible className="w-full rounded-md border border-border">
              <AccordionItem value="fee-profile" className="border-b-0">
                <AccordionTrigger className="px-3 py-2 text-[11px] font-medium text-muted-foreground hover:no-underline">
                  Fee Profile (Estimated from your sample ticket)
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  <div className="grid grid-cols-1 gap-y-1 text-[11px]">
                    {Object.entries(FEE_LABELS).map(([key, label]) => {
                      const feeKey = key as keyof typeof FEE_RATES
                      return (
                        <div key={key} className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium text-foreground">
                            TZS {calculator.entryFees.breakdown[feeKey].toLocaleString()}
                          </span>
                        </div>
                      )
                    })}
                    <div className="mt-1 border-t border-border pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Total (one side)</span>
                        <span className="font-semibold text-foreground">
                          TZS {calculator.entryFees.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {!calculator.isValid && (
              <p className="text-xs text-muted-foreground">
                Enter valid entry price, exit price, and shares to calculate.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
