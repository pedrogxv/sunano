"use client"

import * as React from "react"
import { ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  contentClassName?: string
  disabled?: boolean
  "aria-invalid"?: boolean
  /** Quando informado, mostra uma ação "Criar <termo>" quando a busca não bate com nenhuma opção. */
  onCreateOption?: (label: string) => void
  createOptionLabel?: (label: string) => string
  creating?: boolean
  /**
   * Ativa busca assíncrona (server-side): a busca digitada é repassada aqui em vez de
   * filtrar `options` no client. Use junto com `loading`/`onLoadMore` para paginação.
   */
  onSearchChange?: (search: string) => void
  loading?: boolean
  /** Exibido como último item da lista quando há mais páginas a carregar. */
  onLoadMore?: () => void
  loadingMore?: boolean
  hasMore?: boolean
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado encontrado.",
  className,
  contentClassName,
  disabled,
  onCreateOption,
  createOptionLabel = (label) => `Criar "${label}"`,
  creating = false,
  onSearchChange,
  loading = false,
  onLoadMore,
  loadingMore = false,
  hasMore = false,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const selected = options.find((option) => option.value === value)
  const isAsync = Boolean(onSearchChange)

  const trimmedSearch = search.trim()
  const hasExactMatch = options.some(
    (option) => option.label.toLowerCase() === trimmedSearch.toLowerCase()
  )
  const canOffercreate = Boolean(onCreateOption) && trimmedSearch.length > 0 && !hasExactMatch && !loading

  function handleSearchChange(next: string) {
    setSearch(next)
    onSearchChange?.(next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setSearch("")
          onSearchChange?.("")
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className
          )}
          {...props}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-(--radix-popover-trigger-width) flex-col gap-0 p-0", contentClassName)}
      >
        <Command shouldFilter={!isAsync}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={handleSearchChange} />
          <CommandList>
            {!loading && !canOffercreate && <CommandEmpty>{emptyText}</CommandEmpty>}
            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>
            )}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  data-checked={option.value === value}
                  onSelect={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </CommandItem>
              ))}
              {isAsync && hasMore && !loading && (
                <CommandItem
                  value={`__load-more__${trimmedSearch}`}
                  disabled={loadingMore}
                  onSelect={() => onLoadMore?.()}
                  className="justify-center text-muted-foreground"
                >
                  {loadingMore ? "Carregando..." : "Carregar mais"}
                </CommandItem>
              )}
              {canOffercreate && (
                <CommandItem
                  value={`__create__${trimmedSearch}`}
                  disabled={creating}
                  onSelect={() => {
                    onCreateOption?.(trimmedSearch)
                  }}
                >
                  {creating ? "Criando..." : createOptionLabel(trimmedSearch)}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface MultiComboboxProps {
  options: ComboboxOption[]
  values: string[]
  onValuesChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  allLabel?: string
  className?: string
  contentClassName?: string
  disabled?: boolean
  "aria-invalid"?: boolean
}

export function MultiCombobox({
  options,
  values,
  onValuesChange,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado encontrado.",
  allLabel = "Todas",
  className,
  contentClassName,
  disabled,
  ...props
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const toggleValue = (value: string) => {
    onValuesChange(
      values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
    )
  }

  const triggerLabel = React.useMemo(() => {
    if (values.length === 0) return placeholder
    const labels = values
      .map((v) => options.find((o) => o.value === v)?.label ?? v)
    if (labels.length <= 2) return labels.join(", ")
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`
  }, [values, options, placeholder])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            values.length === 0 && "text-muted-foreground",
            className
          )}
          {...props}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-(--radix-popover-trigger-width) flex-col gap-0 p-0", contentClassName)}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onValuesChange([])
                  setOpen(false)
                }}
              >
                <Checkbox checked={values.length === 0} className="pointer-events-none" />
                {allLabel}
              </CommandItem>
              {options.map((option) => {
                const checked = values.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggleValue(option.value)}
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    {option.label}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
