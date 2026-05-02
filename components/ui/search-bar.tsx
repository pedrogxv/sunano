"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownAZ, ArrowUpAZ, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export interface SearchItem {
  id: string
  title: string
  description: string
  tags: string[]
  creator?: string
}

interface SearchComponentProps {
  data: SearchItem[]
  onFilteredDataChange?: (items: SearchItem[]) => void
  placeholder?: string
  label?: string
}

const SearchComponent = ({
  data,
  onFilteredDataChange,
  placeholder = "Search your data...",
  label = "Sort by",
}: SearchComponentProps) => {
  const [query, setQuery] = useState("")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | "">("")

  const filteredData = useMemo(() => {
    const lowerCaseQuery = query.toLowerCase().trim()
    const matchesQuery = (item: SearchItem) => {
      if (!lowerCaseQuery) return true

      const searchable = [
        item.title,
        item.description,
        item.creator ?? "",
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase()

      return searchable.includes(lowerCaseQuery)
    }

    let results = data.filter(matchesQuery)

    if (sortOrder === "asc") {
      results = [...results].sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortOrder === "desc") {
      results = [...results].sort((a, b) => b.title.localeCompare(a.title))
    }

    return results
  }, [query, sortOrder, data])

  useEffect(() => {
    onFilteredDataChange?.(filteredData)
  }, [filteredData, onFilteredDataChange])

  return (
    <div className="w-full flex flex-col items-center justify-center space-y-4">
      <div className="w-full max-w-lg flex flex-col gap-4 sm:flex-row lg:max-w-none">
        <div className="relative flex-1">
          <Input
            type="text"
            placeholder={placeholder}
            className="w-full border-border bg-card pr-10 text-foreground placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            value={query}
          />
          <Search
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={18}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full border-border bg-card text-foreground hover:bg-muted/40 sm:w-auto">
              {label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 border-border bg-popover text-foreground">
            <DropdownMenuItem
              onClick={() => setSortOrder("asc")}
              className="flex items-center justify-between gap-2 text-foreground focus:bg-muted/40 focus:text-foreground"
            >
              <span>Title Ascending</span>
              <ArrowUpAZ className="ml-2 h-4 w-4 text-primary" />
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSortOrder("desc")}
              className="flex items-center justify-between gap-2 text-foreground focus:bg-muted/40 focus:text-foreground"
            >
              <span>Title Descending</span>
              <ArrowDownAZ className="ml-2 h-4 w-4 text-primary" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  )
}

export { SearchComponent }