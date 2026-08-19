"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Ban,
  CalendarIcon,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  Truck,
  User,
  X,
} from "lucide-react"
import { toast } from "sonner"
import type { DateRange } from "react-day-picker"

import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"

type OrderStatus =
  | "pending"
  | "paid"
  | "awaiting_shipping_info"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "expired"

type OrderItem = {
  id?: string
  name?: string
  quantity?: number
  price_cents?: number
  variant_label?: string | null
}

type AdminOrder = {
  id: string
  status: OrderStatus
  total_cents: number
  items: OrderItem[]
  created_at: string
  updated_at: string
  payment_method: string | null
  customer_name: string | null
  customer_email: string | null
  tracking_code: string | null
  carrier: string | null
  shipped_at: string | null
  delivered_at: string | null
  refunded_cents: number
  refund_reason: string | null
  refunded_at: string | null
  gateway: "asaas" | "misticpay" | null
  asaas_payment_id: string | null
  misticpay_transaction_id: string | null
  misticpay_e2e: string | null
  user_id: string | null
  user_display_name: string | null
}

type OrderCustomer = {
  userId: string | null
  name: string | null
  email: string | null
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  awaiting_shipping_info: "Aguardando dados de entrega",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  expired: "Expirado",
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  awaiting_shipping_info: "bg-blue-500/15 text-blue-300",
  shipped: "bg-violet-500/15 text-violet-300",
  delivered: "bg-teal-500/15 text-teal-300",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-sky-500/15 text-sky-400",
  expired: "bg-orange-500/15 text-orange-400",
}

/** Próxima etapa do fluxo pós-venda, ou null quando o pedido não está mais nele. */
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: "awaiting_shipping_info",
  awaiting_shipping_info: "shipped",
  shipped: "delivered",
}

const REFUNDABLE_STATUSES: OrderStatus[] = ["paid", "awaiting_shipping_info", "shipped", "delivered"]

const STATUS_FILTER_ICON_STYLE: Record<OrderStatus | "all", string> = {
  all: "bg-primary/15 text-primary",
  pending: "bg-amber-500/15 text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  awaiting_shipping_info: "bg-blue-500/15 text-blue-300",
  shipped: "bg-violet-500/15 text-violet-300",
  delivered: "bg-teal-500/15 text-teal-300",
  cancelled: "bg-muted-foreground/15 text-muted-foreground",
  refunded: "bg-sky-500/15 text-sky-400",
  expired: "bg-orange-500/15 text-orange-400",
}

const STATUS_FILTERS: Array<{ value: OrderStatus | "all"; label: string; icon: React.ElementType }> = [
  { value: "all", label: "Todos", icon: Package },
  { value: "pending", label: "Aguardando pagamento", icon: Clock },
  { value: "paid", label: "Pago", icon: CheckCircle2 },
  { value: "awaiting_shipping_info", label: "Aguardando dados", icon: Clock },
  { value: "shipped", label: "Enviado", icon: Truck },
  { value: "delivered", label: "Entregue", icon: PackageCheck },
  { value: "cancelled", label: "Cancelado", icon: Ban },
  { value: "refunded", label: "Reembolsado", icon: RotateCcw },
  { value: "expired", label: "Expirado", icon: AlertCircle },
]

const PAGE_SIZE = 20

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** yyyy-mm-dd local (sem componente de hora) — evita off-by-one por fuso ao converter de/para `Date`. */
function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function fromDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function formatDateShort(value: string): string {
  return fromDateInputValue(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="secondary" className={cn("text-[10px]", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

function CustomerFilterCombobox({
  value,
  onChange,
}: {
  value: OrderCustomer | null
  onChange: (customer: OrderCustomer | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<OrderCustomer[]>([])
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set("q", search.trim())
        const res = await fetch(`/api/admin/store/orders/customers?${params.toString()}`)
        const data = (await res.json()) as { customers?: OrderCustomer[] }
        setResults(data.customers ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
        setHasFetched(true)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, search])

  useEffect(() => {
    if (!open) {
      setHasFetched(false)
      setResults([])
    }
  }, [open])

  const customerKey = (c: OrderCustomer) => c.userId ?? `${c.name ?? ""}|${c.email ?? ""}`

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal sm:w-64", !value && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <User className="size-3.5 shrink-0" />
            <span className="truncate">{value ? value.name ?? value.email ?? "Cliente" : "Filtrar por cliente"}</span>
          </span>
          {value ? (
            <X
              className="ml-2 size-3.5 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
            />
          ) : (
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) flex-col gap-0 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar cliente por nome ou e-mail..." value={search} onValueChange={setSearch} />
          <CommandList className="min-h-24">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Carregando clientes...
              </div>
            ) : (
              <>
                {hasFetched && results.length === 0 && <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>}
                <CommandGroup>
                  {results.map((customer) => (
                    <CommandItem
                      key={customerKey(customer)}
                      value={customerKey(customer)}
                      data-checked={value ? customerKey(value) === customerKey(customer) : false}
                      onSelect={() => {
                        onChange(customer)
                        setOpen(false)
                      }}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{customer.name ?? "Sem nome"}</span>
                        {customer.email && (
                          <span className="truncate text-xs text-muted-foreground">{customer.email}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function DateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string
  dateTo: string
  onChange: (range: { dateFrom: string; dateTo: string }) => void
}) {
  const [open, setOpen] = useState(false)

  const range: DateRange | undefined = dateFrom
    ? { from: fromDateInputValue(dateFrom), to: dateTo ? fromDateInputValue(dateTo) : undefined }
    : undefined

  const label = dateFrom
    ? dateTo
      ? `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`
      : `A partir de ${formatDateShort(dateFrom)}`
    : "Filtrar por período"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between font-normal sm:w-64", !dateFrom && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <CalendarIcon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          {dateFrom ? (
            <X
              className="ml-2 size-3.5 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                onChange({ dateFrom: "", dateTo: "" })
              }}
            />
          ) : (
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          defaultMonth={range?.from}
          onSelect={(next) => {
            onChange({
              dateFrom: next?.from ? toDateInputValue(next.from) : "",
              dateTo: next?.to ? toDateInputValue(next.to) : "",
            })
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}

type OrderProductOption = { id: string; name: string }

function ProductFilterCombobox({
  value,
  onChange,
}: {
  value: OrderProductOption | null
  onChange: (product: OrderProductOption | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<OrderProductOption[]>([])
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set("q", search.trim())
        const res = await fetch(`/api/admin/store/orders/products?${params.toString()}`)
        const data = (await res.json()) as { products?: OrderProductOption[] }
        setResults(data.products ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
        setHasFetched(true)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, search])

  useEffect(() => {
    if (!open) {
      setHasFetched(false)
      setResults([])
    }
  }, [open])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal sm:w-56", !value && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <Package className="size-3.5 shrink-0" />
            <span className="truncate">{value ? value.name : "Todos os produtos"}</span>
          </span>
          {value ? (
            <X
              className="ml-2 size-3.5 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
            />
          ) : (
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) flex-col gap-0 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar produto..." value={search} onValueChange={setSearch} />
          <CommandList className="min-h-24">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Carregando produtos...
              </div>
            ) : (
              <>
                {hasFetched && results.length === 0 && <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>}
                <CommandGroup>
                  {results.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={product.id}
                      data-checked={value?.id === product.id}
                      onSelect={() => {
                        onChange(product)
                        setOpen(false)
                      }}
                    >
                      <span className="truncate">{product.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<OrderStatus | "all", number>>({
    all: 0,
    pending: 0,
    paid: 0,
    awaiting_shipping_info: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    refunded: 0,
    expired: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all")
  const [productFilter, setProductFilter] = useState<OrderProductOption | null>(null)
  const [userQuery, setUserQuery] = useState("")
  const [customerFilter, setCustomerFilter] = useState<OrderCustomer | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)

  const [manageOrder, setManageOrder] = useState<AdminOrder | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (productFilter) params.set("productId", productFilter.id)
      if (userQuery.trim()) params.set("q", userQuery.trim())
      if (customerFilter?.userId) params.set("userId", customerFilter.userId)
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString())
      if (dateTo) params.set("dateTo", new Date(`${dateTo}T23:59:59.999`).toISOString())
      params.set("page", String(page))
      params.set("pageSize", String(PAGE_SIZE))

      const res = await fetch(`/api/admin/store/orders?${params.toString()}`)
      const data = (await res.json()) as {
        orders?: AdminOrder[]
        total?: number
        counts?: Record<OrderStatus | "all", number>
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar pedidos")
      setOrders(data.orders ?? [])
      setTotal(data.total ?? 0)
      if (data.counts) setCounts(data.counts)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar pedidos"
      setError(message)
      toast.error("Erro ao carregar pedidos", { description: message })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, productFilter, userQuery, customerFilter, dateFrom, dateTo, page])

  useEffect(() => {
    const timeout = setTimeout(load, userQuery ? 350 : 0)
    return () => clearTimeout(timeout)
  }, [load, userQuery])

  // Qualquer mudança de filtro volta pra primeira página.
  useEffect(() => {
    setPage(1)
  }, [statusFilter, productFilter, userQuery, customerFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters =
    statusFilter !== "all" || productFilter !== null || userQuery.trim() !== "" || customerFilter !== null || dateFrom !== "" || dateTo !== ""

  function clearFilters() {
    setStatusFilter("all")
    setProductFilter(null)
    setUserQuery("")
    setCustomerFilter(null)
    setDateFrom("")
    setDateTo("")
  }

  function applyOrderPatch(id: string, patch: Partial<AdminOrder>) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    setManageOrder((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  usePageHeader("Pedidos", "Acompanhe, gerencie e extorne pedidos da loja.")

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou e-mail do cliente..."
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <CustomerFilterCombobox value={customerFilter} onChange={setCustomerFilter} />
          <ProductFilterCombobox value={productFilter} onChange={setProductFilter} />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}>
            <SelectTrigger className="w-full border-border bg-card text-sm sm:w-64">
              <SelectValue>
                {(() => {
                  const current = STATUS_FILTERS.find((f) => f.value === statusFilter)
                  if (!current) return null
                  const Icon = current.icon
                  return (
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">Status:</span>
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-md",
                          STATUS_FILTER_ICON_STYLE[current.value]
                        )}
                      >
                        <Icon className="size-3" />
                      </span>
                      <span>{current.label}</span>
                      <span className="text-muted-foreground">({counts[current.value] ?? 0})</span>
                    </span>
                  )
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(({ value, label, icon: Icon }) => (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-md",
                        STATUS_FILTER_ICON_STYLE[value]
                      )}
                    >
                      <Icon className="size-3" />
                    </span>
                    <span>{label}</span>
                    <span className="text-muted-foreground">({counts[value] ?? 0})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={({ dateFrom: from, dateTo: to }) => {
              setDateFrom(from)
              setDateTo(to)
            }}
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
              <X className="size-3.5" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <BoxLoader />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Package className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum pedido encontrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedido</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produtos</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setManageOrder(order)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">#{orderNumber(order.id)}</p>
                    {order.tracking_code && (
                      <p className="text-[10px] text-muted-foreground">Rastreio: {order.tracking_code}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{order.customer_name ?? order.user_display_name ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {order.customer_email ?? (order.user_id ? "Usuário cadastrado" : "Convidado")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {order.items.map((item) => `${item.quantity ?? 1}x ${item.name ?? "Produto"}`).join(", ")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-emerald-400">{formatBRL(order.total_cents)}</span>
                    {order.refunded_cents > 0 && (
                      <p className="text-[10px] text-sky-400">-{formatBRL(order.refunded_cents)} extornado</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation()
                        setManageOrder(order)
                      }}
                    >
                      <Eye className="size-3.5" />
                      Ver pedido
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginação */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages} · {total} pedido{total === 1 ? "" : "s"}
            </p>
            {totalPages > 1 && (
              <div className="flex gap-1.5">
                {page > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-border text-xs"
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                )}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = Math.min(Math.max(page - 2, 1) + i, totalPages)
                  return (
                    <Button
                      key={p}
                      size="sm"
                      variant={p === page ? "default" : "outline"}
                      className={cn("h-8 w-8 border-border text-xs", p !== page && "text-muted-foreground")}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                })}
                {page < totalPages && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-border text-xs"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <OrderManageDialog
        order={manageOrder}
        onOpenChange={(open) => !open && setManageOrder(null)}
        onOrderPatched={applyOrderPatch}
      />
    </div>
  )
}

function OrderManageDialog({
  order,
  onOpenChange,
  onOrderPatched,
}: {
  order: AdminOrder | null
  onOpenChange: (open: boolean) => void
  onOrderPatched: (id: string, patch: Partial<AdminOrder>) => void
}) {
  const [trackingCode, setTrackingCode] = useState("")
  const [carrier, setCarrier] = useState("")
  const [advancing, setAdvancing] = useState(false)

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundValue, setRefundValue] = useState("")
  const [refundReason, setRefundReason] = useState("")
  const [refunding, setRefunding] = useState(false)

  useEffect(() => {
    if (!order) return
    setTrackingCode(order.tracking_code ?? "")
    setCarrier(order.carrier ?? "")
    setRefundOpen(false)
    setRefundValue("")
    setRefundReason("")
  }, [order?.id])

  if (!order) {
    return <Dialog open={false} onOpenChange={onOpenChange} />
  }

  const next = NEXT_STATUS[order.status]
  const remainingCents = order.total_cents - order.refunded_cents
  const canRefund = REFUNDABLE_STATUSES.includes(order.status) && remainingCents > 0

  async function handleAdvance() {
    if (!order || !next) return
    setAdvancing(true)
    try {
      const res = await fetch(`/api/admin/store/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance",
          status: next,
          trackingCode: next === "shipped" ? trackingCode.trim() || undefined : undefined,
          carrier: next === "shipped" ? carrier.trim() || undefined : undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar pedido")

      onOrderPatched(order.id, {
        status: next,
        tracking_code: trackingCode.trim() || order.tracking_code,
        carrier: carrier.trim() || order.carrier,
      })
      toast.success(`Pedido marcado como "${STATUS_LABEL[next]}"`, { description: `#${orderNumber(order.id)}` })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar pedido"
      toast.error("Erro ao atualizar pedido", { description: message })
    } finally {
      setAdvancing(false)
    }
  }

  async function handleRefund() {
    if (!order) return
    const trimmedValue = refundValue.trim()
    const valueCents = trimmedValue ? Math.round(Number(trimmedValue.replace(",", ".")) * 100) : undefined
    if (trimmedValue && (!Number.isFinite(valueCents) || (valueCents as number) <= 0)) {
      toast.error("Valor de extorno inválido")
      return
    }

    setRefunding(true)
    try {
      const res = await fetch(`/api/admin/store/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund", valueCents, reason: refundReason.trim() || undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao extornar pedido")

      const refundedNow = valueCents ?? remainingCents
      const newRefundedCents = order.refunded_cents + refundedNow
      onOrderPatched(order.id, {
        refunded_cents: newRefundedCents,
        refund_reason: refundReason.trim() || order.refund_reason,
        refunded_at: new Date().toISOString(),
        status: newRefundedCents >= order.total_cents ? "refunded" : order.status,
      })
      toast.success("Extorno realizado", { description: `${formatBRL(refundedNow)} · #${orderNumber(order.id)}` })
      setRefundOpen(false)
      setRefundValue("")
      setRefundReason("")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao extornar pedido"
      toast.error("Erro ao extornar pedido", { description: message })
    } finally {
      setRefunding(false)
    }
  }

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Pedido #{orderNumber(order.id)}
            <StatusBadge status={order.status} />
          </DialogTitle>
          <DialogDescription>Criado em {formatDateTime(order.created_at)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Cliente */}
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <User className="size-3.5 text-muted-foreground" />
              {order.customer_name ?? order.user_display_name ?? "Cliente não identificado"}
            </p>
            {order.customer_email && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="size-3.5" />
                {order.customer_email}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              {order.user_id ? "Usuário cadastrado" : "Compra como convidado"}
            </p>
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Itens</p>
            <div className="space-y-1.5">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {item.quantity ?? 1}x {item.name ?? "Produto"}
                    {item.variant_label ? ` · ${item.variant_label}` : ""}
                  </span>
                  {typeof item.price_cents === "number" && (
                    <span className="text-muted-foreground">{formatBRL(item.price_cents)}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-emerald-400">{formatBRL(order.total_cents)}</span>
            </div>
            {order.refunded_cents > 0 && (
              <div className="flex items-center justify-between text-xs text-sky-400">
                <span>Extornado</span>
                <span>-{formatBRL(order.refunded_cents)}</span>
              </div>
            )}
          </div>

          {/* Pagamento */}
          <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
            <p className="font-semibold uppercase tracking-wider text-muted-foreground">Pagamento</p>
            <p className="text-foreground">
              {order.gateway === "asaas" ? "Asaas" : order.gateway === "misticpay" ? "MisticPay" : "—"} · PIX
            </p>
            {order.misticpay_e2e && <p className="break-all text-muted-foreground">E2E: {order.misticpay_e2e}</p>}
            {order.asaas_payment_id && (
              <p className="break-all text-muted-foreground">ID Asaas: {order.asaas_payment_id}</p>
            )}
          </div>

          {order.tracking_code && (
            <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground">Rastreio</p>
              <p className="text-foreground">
                {order.carrier ? `${order.carrier} · ` : ""}
                <span className="font-mono">{order.tracking_code}</span>
              </p>
            </div>
          )}

          {order.refund_reason && (
            <div className="space-y-1 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs">
              <p className="font-semibold uppercase tracking-wider text-sky-400">Motivo do extorno</p>
              <p className="text-foreground">{order.refund_reason}</p>
            </div>
          )}

          <Separator />

          {/* Ações de status */}
          {next && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Avançar status
              </p>
              {next === "shipped" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="tracking-code" className="text-xs">Código de rastreio</Label>
                    <Input
                      id="tracking-code"
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      placeholder="Ex: BR123456789"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="carrier" className="text-xs">Transportadora</Label>
                    <Input
                      id="carrier"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="Ex: Correios"
                    />
                  </div>
                </div>
              )}
              <Button onClick={handleAdvance} disabled={advancing} className="w-full gap-2">
                <PackageCheck className="size-4" />
                {advancing ? "Salvando..." : `Marcar como "${STATUS_LABEL[next]}"`}
              </Button>
            </div>
          )}

          {/* Extorno */}
          {canRefund && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Extorno {order.gateway !== "asaas" && "(indisponível)"}
              </p>

              {order.gateway !== "asaas" && (
                <Alert className="border-amber-500/30 bg-amber-500/10 py-2">
                  <AlertCircle className="size-3.5 text-amber-400" />
                  <AlertDescription className="text-xs text-amber-300">
                    Este pedido foi pago via {order.gateway === "misticpay" ? "MisticPay" : "outro meio"}, que não
                    oferece extorno automático por API. Extorne manualmente no painel do gateway e depois marque o
                    pedido como reembolsado.
                  </AlertDescription>
                </Alert>
              )}

              {order.gateway === "asaas" && (
                <Alert className="border-sky-500/30 bg-sky-500/10 py-2">
                  <AlertCircle className="size-3.5 text-sky-400" />
                  <AlertDescription className="text-xs text-sky-300">
                    A chamada de extorno via Asaas ainda precisa ser validada/confirmada manualmente
                    no painel do Asaas para que o dinheiro seja de fato devolvido ao cliente. Marcar
                    o pedido como reembolsado aqui não garante que o valor já caiu.
                  </AlertDescription>
                </Alert>
              )}

              {!refundOpen ? (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => {
                    setRefundValue((remainingCents / 100).toFixed(2))
                    setRefundOpen(true)
                  }}
                  disabled={order.gateway !== "asaas"}
                >
                  <RotateCcw className="size-4" />
                  Extornar pedido
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="space-y-1">
                    <Label htmlFor="refund-value" className="text-xs">
                      Valor a extornar (máx. {formatBRL(remainingCents)})
                    </Label>
                    <Input
                      id="refund-value"
                      inputMode="decimal"
                      value={refundValue}
                      onChange={(e) => setRefundValue(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="refund-reason" className="text-xs">Motivo (opcional)</Label>
                    <Textarea
                      id="refund-reason"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="Ex: Produto com defeito, cliente desistiu..."
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setRefundOpen(false)}
                      disabled={refunding}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 gap-2"
                      onClick={handleRefund}
                      disabled={refunding}
                    >
                      {refunding ? "Extornando..." : "Confirmar extorno"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {order.status === "refunded" && (
            <Alert className="border-sky-500/30 bg-sky-500/10 py-2">
              <CheckCircle2 className="size-3.5 text-sky-400" />
              <AlertDescription className="text-xs text-sky-300">
                Pedido totalmente reembolsado{order.refunded_at ? ` em ${formatDateTime(order.refunded_at)}` : ""}.
                {order.gateway === "asaas" && " Confirme no painel do Asaas se o valor já foi efetivamente devolvido ao cliente."}
              </AlertDescription>
            </Alert>
          )}

          {order.gateway === "asaas" && order.asaas_payment_id && (
            <a
              href={`https://www.asaas.com/payment/show?id=${encodeURIComponent(order.asaas_payment_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Ver cobrança no painel Asaas
            </a>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
