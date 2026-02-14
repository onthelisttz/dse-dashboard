"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, formatPercent } from "@/lib/utils"
import type { MarketDataItem } from "@/lib/types"
import { ChevronsUpDown, Search, Check } from "lucide-react"

interface CompanySelectorProps {
  companies: MarketDataItem[]
  selectedId: number
  onSelect: (id: number) => void
}

export function CompanySelector({ companies, selectedId, onSelect }: CompanySelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query) return companies
    const q = query.toLowerCase()
    return companies.filter(
      (item) =>
        item.company.symbol.toLowerCase().includes(q) ||
        item.company.name.toLowerCase().includes(q)
    )
  }, [companies, query])

  const selected = companies.find((c) => c.company.id === selectedId)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        className="w-[260px] justify-between border-border bg-card text-foreground hover:bg-secondary"
      >
        <span className="flex items-center gap-2 truncate">
          {selected ? (
            <>
              <span className="font-semibold">{selected.company.symbol}</span>
              <span className="text-xs text-muted-foreground">
                TZS {selected.marketPrice?.toLocaleString()}
              </span>
            </>
          ) : (
            "Select a company"
          )}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[320px] rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search by symbol or name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 border-0 bg-transparent p-0 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No companies found</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.company.id}
                  onClick={() => {
                    onSelect(item.company.id)
                    setOpen(false)
                    setQuery("")
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors",
                    selectedId === item.company.id
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-left font-semibold">{item.company.symbol}</span>
                    <span className="text-xs text-muted-foreground">
                      TZS {item.marketPrice?.toLocaleString()}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        item.change > 0
                          ? "text-gain"
                          : item.change < 0
                            ? "text-loss"
                            : "text-muted-foreground"
                      )}
                    >
                      {formatPercent(item.change ?? 0, { signed: true })}%
                    </span>
                  </div>
                  {selectedId === item.company.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
