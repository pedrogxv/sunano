"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RouteLink } from "@/components/ui/route-link"
import {
  AlertCircle,
  Ban,
  Banknote,
  CalendarIcon,
  CheckCircle2,
  ChevronsUpDown,
  ClipboardList,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  FlaskConical,
  LifeBuoy,
  Loader2,
  Mail,
  MapPinOff,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  Sparkles,
  Truck,
  User,
  Wrench,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { AuraIcon } from "@/components/ui/AuraIcon"
import {
  ORDER_PAYMENT_SOURCE_FILTERS,
  ORDER_PAYMENT_SOURCE_LABEL,
  PAYMENT_GATEWAY_LABEL,
  orderPaymentGateway,
  type OrderPaymentSourceFilter,
} from "@/lib/payment-gateways"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { ORDER_STATUS_GROUPS, orderStatusLabel, type OrderStatusGroup } from "@/lib/order-status"
import { STORE_CARRIERS, findStoreCarrier, type StoreCarrier } from "@/lib/store-carriers"
import { formatCpfInput } from "@/components/store/CheckoutPayerCard"
import { SHIPPING_RESIDENCE_TYPE_LABELS, isoToBirthDateInput } from "@/components/store/ShippingAddressFields"
import { serviceFormLines } from "@/lib/store-service-form"
import { ServiceFormAnswerValue } from "@/components/store/ServiceFormAnswerValue"
import { OrderComplementSection } from "@/components/admin/store/OrderComplementSection"
// `import type` é apagado no build: não puxa `server-only` para o bundle.
import type {
  AdminOrderRow,
  ManualPaymentMethod,
  OrderManualPayment,
  OrderShippingAddress,
} from "@/lib/server/repositories/orders-repository"

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
  variant_options?: { group: string; label: string }[] | null
  /** Código da combinação no momento da compra (snapshot do checkout). */
  sku?: string | null
  /** Lote da pré-venda em que a reserva entrou. */
  preorder_batch?: string | null
  /** Campos do formulário pós-compra de serviço (snapshot do checkout). */
  service_form?: unknown
}

type AdminOrder = {
  id: string
  status: OrderStatus
  total_cents: number
  /** Preço à vista no PIX (pedido de cartão). Null em pedido criado no PIX. */
  pix_price_cents: number | null
  items: OrderItem[]
  created_at: string
  updated_at: string
  payment_method: string | null
  /** Não-nulo = resgate de produto físico da Central pago com Aura (payment_method='aura'). */
  aura_cost_paid: number | null
  customer_name: string | null
  customer_email: string | null
  customer_cpf: string | null
  tracking_code: string | null
  carrier: string | null
  shipped_at: string | null
  delivered_at: string | null
  refunded_cents: number
  refund_reason: string | null
  refunded_at: string | null
  asaas_payment_id: string | null
  stripe_payment_intent_id: string | null
  stripe_session_id: string | null
  card_review: AdminOrderRow["card_review"]
  fraud_warning: AdminOrderRow["fraud_warning"]
  chargeback: AdminOrderRow["chargeback"]
  user_id: string | null
  user_display_name: string | null
  oversold: OrderOversoldFlag | null
  /** Para onde despachar. Null = o cliente ainda não informou. */
  shipping_address: OrderShippingAddress | null
  /** false = pedido de serviço/digital: não há o que despachar, e a falta de endereço não é pendência. */
  requires_shipping_address: boolean
  /** true = pedido pago contra a Asaas sandbox (dinheiro de teste). */
  is_sandbox: boolean
  /** Chamado aberto sozinho quando o serviço foi pago. Null em pedido físico. */
  service_ticket_id: string | null
  /** O que o cliente preencheu no formulário pós-compra de serviço. */
  service_form_answers: AdminOrderRow["service_form_answers"]
  /** Pago por fora do site e registrado no painel. */
  manual_payment: OrderManualPayment | null
  /** Complemento de Pagamento cobrado neste pedido. */
  complement: AdminOrderRow["complement"]
  /** Este pedido é o pagamento de complemento de outro. */
  complement_for: AdminOrderRow["complement_for"]
}

/**
 * Recorte de ambiente da fila. Espelha `OrderEnvironment` do repositório — a
 * fila abre em "production" porque pedido de teste não é trabalho a fazer;
 * "sandbox"/"all" existem para conferir o que foi testado.
 */
type OrderEnvironment = "production" | "sandbox" | "all"

/**
 * Aba da fila. Espelha `OrderKind` do repositório: produto tem pacote a
 * despachar, serviço se resolve conversando com o cliente no chamado.
 */
type OrderKind = "all" | "product" | "service"

const KIND_TABS: { value: OrderKind; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "Todos", icon: Package },
  { value: "product", label: "Produtos", icon: Truck },
  { value: "service", label: "Serviços", icon: Wrench },
]

const ENVIRONMENT_FILTERS: { value: OrderEnvironment; label: string }[] = [
  { value: "production", label: "Produção" },
  { value: "sandbox", label: "Sandbox (teste)" },
  { value: "all", label: "Todos" },
]

/** Pedido que precisa de endereço, ainda não tem, e já foi pago. */
function isMissingShippingAddress(order: AdminOrder): boolean {
  return (
    order.requires_shipping_address &&
    !order.shipping_address &&
    (order.status === "paid" || order.status === "awaiting_shipping_info")
  )
}

/**
 * Pedido pago depois de expirar cujo estoque não pôde ser re-reservado — o
 * item esgotou entre a expiração (que devolveu o estoque) e a confirmação do
 * pagamento. Precisa de decisão humana: repor ou estornar.
 */
type OrderOversoldFlag = {
  reason: string
  items: string[]
  detected_at: string
}

type OrderCustomer = {
  userId: string | null
  name: string | null
  email: string | null
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  awaiting_shipping_info: "bg-amber-500/15 text-amber-400",
  shipped: "bg-violet-500/15 text-violet-300",
  delivered: "bg-teal-500/15 text-teal-300",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-sky-500/15 text-sky-400",
  expired: "bg-orange-500/15 text-orange-400",
}

/**
 * Próxima etapa que o ADMIN marca, ou undefined quando não há nenhuma.
 *
 * `awaiting_shipping_info` não tem: quem destrava é o cliente informando o
 * endereço, e o banco passa o pedido para `paid` ("Pedido feito") sozinho
 * (ver 20261206000002_order_shipping_stage_auto.sql).
 */
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: "shipped",
  shipped: "delivered",
}

/**
 * Pedido de serviço/digital não passa por "enviado": não há endereço nem
 * pacote, e o back-end recusa esse degrau (ver ORDER_DIGITAL_FULFILLMENT_FLOW
 * em orders-repository). O admin conclui direto depois do pagamento.
 */
const NEXT_STATUS_DIGITAL: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: "delivered",
}

function nextStatusFor(order: AdminOrder): OrderStatus | undefined {
  return order.requires_shipping_address
    ? NEXT_STATUS[order.status]
    : NEXT_STATUS_DIGITAL[order.status]
}

const REFUNDABLE_STATUSES: OrderStatus[] = ["paid", "awaiting_shipping_info", "shipped", "delivered"]

/**
 * Onde cabe "Registrar pagamento manual". Espelha `MANUAL_PAYABLE_STATUSES`
 * do repositório: `pending` fica fora porque o link do site ainda cobra.
 */
const MANUAL_PAYABLE_STATUSES: OrderStatus[] = ["expired", "cancelled"]

const MANUAL_PAYMENT_METHOD_LABEL: Record<ManualPaymentMethod, string> = {
  pix: "PIX",
  credit_card: "Cartão",
}

/** Valor esperado do pedido no método escolhido. Pedido criado no PIX já tem o total do PIX. */
function manualPaymentExpectedCents(order: AdminOrder, method: ManualPaymentMethod): number {
  return method === "pix" ? order.pix_price_cents ?? order.total_cents : order.total_cents
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",")
}

/** "5.055,56", "5055,56" ou "5055.56" → centavos. NaN quando não é número. */
function parseBrlInput(value: string): number {
  const trimmed = value.trim()
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed
  return Math.round(Number(normalized) * 100)
}

const STATUS_FILTER_ICON_STYLE: Record<OrderStatus | "all", string> = {
  all: "bg-primary/15 text-primary",
  pending: "bg-amber-500/15 text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  awaiting_shipping_info: "bg-amber-500/15 text-amber-400",
  shipped: "bg-violet-500/15 text-violet-300",
  delivered: "bg-teal-500/15 text-teal-300",
  cancelled: "bg-muted-foreground/15 text-muted-foreground",
  refunded: "bg-sky-500/15 text-sky-400",
  expired: "bg-orange-500/15 text-orange-400",
}

const STATUS_FILTERS: Array<{ value: OrderStatus | "all"; label: string; icon: React.ElementType }> = [
  { value: "all", label: "Todos", icon: Package },
  { value: "pending", label: "Aguardando pagamento", icon: Clock },
  { value: "awaiting_shipping_info", label: "Aguardando dados", icon: MapPinOff },
  { value: "paid", label: "Pedido feito", icon: CheckCircle2 },
  { value: "shipped", label: "Enviado", icon: Truck },
  { value: "delivered", label: "Entregue", icon: PackageCheck },
  { value: "cancelled", label: "Cancelado", icon: Ban },
  { value: "refunded", label: "Reembolsado", icon: RotateCcw },
  { value: "expired", label: "Expirado", icon: AlertCircle },
]

/**
 * Abas de status. Abre em "Ativos": o que ainda pede ação é o trabalho do
 * dia, e expirado/cancelado/reembolsado só enchiam a fila. Os status de
 * cada aba moram em `ORDER_STATUS_GROUPS` (a rota recorta pelo mesmo mapa).
 */
const STATUS_GROUP_TABS: Array<{ value: OrderStatusGroup; label: string; icon: React.ElementType }> = [
  { value: "active", label: "Ativos", icon: Clock },
  { value: "completed", label: "Concluídos", icon: PackageCheck },
  { value: "expired", label: "Expirados", icon: AlertCircle },
  { value: "cancelled", label: "Cancelados", icon: Ban },
  { value: "refunded", label: "Reembolsados", icon: RotateCcw },
  { value: "all", label: "Todos", icon: Package },
]

function statusesOfGroup(group: OrderStatusGroup): OrderStatus[] {
  return group === "all" ? STATUS_FILTERS.flatMap((f) => (f.value === "all" ? [] : [f.value])) : ORDER_STATUS_GROUPS[group]
}

function groupCount(counts: Record<OrderStatus | "all", number>, group: OrderStatusGroup): number {
  return group === "all" ? counts.all : ORDER_STATUS_GROUPS[group].reduce((sum, status) => sum + (counts[status] ?? 0), 0)
}

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

function StatusBadge({ order }: { order: Pick<AdminOrder, "status" | "requires_shipping_address"> }) {
  return (
    <Badge variant="secondary" className={cn("text-[10px]", STATUS_STYLE[order.status])}>
      {orderStatusLabel(order.status, order.requires_shipping_address)}
    </Badge>
  )
}

function CustomerFilterCombobox({
  value,
  onChange,
  environment,
}: {
  value: OrderCustomer | null
  onChange: (customer: OrderCustomer | null) => void
  environment: OrderEnvironment
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
        params.set("environment", environment)
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
  }, [open, search, environment])

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
          className={cn("w-full min-w-0 justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <User className="size-3.5 shrink-0" />
            <span className="truncate">{value ? value.name ?? value.email ?? "Cliente" : "Todos os clientes"}</span>
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
    : "Qualquer período"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full min-w-0 justify-between font-normal", !dateFrom && "text-muted-foreground")}
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
          className={cn("w-full min-w-0 justify-between font-normal", !value && "text-muted-foreground")}
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
  // Aba, não filtro: "Limpar filtros" não mexe nela.
  const [statusGroup, setStatusGroup] = useState<OrderStatusGroup>("active")
  // Etapa dentro da aba (só aparece quando a aba tem mais de um status).
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all")
  const [productFilter, setProductFilter] = useState<OrderProductOption | null>(null)
  const [userQuery, setUserQuery] = useState("")
  const [customerFilter, setCustomerFilter] = useState<OrderCustomer | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  // Fila operacional: pagos, de item físico, ainda sem endereço. Resolvido no
  // banco (não filtrando a página já carregada), senão o total e a paginação
  // mentem.
  const [missingShippingOnly, setMissingShippingOnly] = useState(false)
  // Ambiente do gateway. Abre em "production": os pedidos de sandbox são
  // pagamento de teste e não são trabalho a fazer — mas continuam no banco,
  // acessíveis trocando este seletor.
  const [environment, setEnvironment] = useState<OrderEnvironment>("production")
  // Gateway que cobrou o pedido (ou Aura). A lista vem de lib/payment-gateways:
  // gateway novo aparece aqui sem mexer na tela.
  const [paymentSource, setPaymentSource] = useState<OrderPaymentSourceFilter>("all")
  // Aba, não filtro: "Limpar filtros" não mexe nela.
  const [kind, setKind] = useState<OrderKind>("all")
  const [page, setPage] = useState(1)

  const [manageOrder, setManageOrder] = useState<AdminOrder | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusGroup !== "all") params.set("group", statusGroup)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (productFilter) params.set("productId", productFilter.id)
      if (userQuery.trim()) params.set("q", userQuery.trim())
      if (customerFilter?.userId) params.set("userId", customerFilter.userId)
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString())
      if (dateTo) params.set("dateTo", new Date(`${dateTo}T23:59:59.999`).toISOString())
      if (missingShippingOnly && kind !== "service") params.set("missingShipping", "1")
      params.set("environment", environment)
      if (paymentSource !== "all") params.set("gateway", paymentSource)
      if (kind !== "all") params.set("kind", kind)
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
  }, [statusGroup, statusFilter, productFilter, userQuery, customerFilter, dateFrom, dateTo, missingShippingOnly, environment, paymentSource, kind, page])

  useEffect(() => {
    const timeout = setTimeout(load, userQuery ? 350 : 0)
    return () => clearTimeout(timeout)
  }, [load, userQuery])

  // Qualquer mudança de filtro volta pra primeira página.
  useEffect(() => {
    setPage(1)
  }, [statusGroup, statusFilter, productFilter, userQuery, customerFilter, dateFrom, dateTo, missingShippingOnly, environment, paymentSource, kind])

  const groupStatuses = statusesOfGroup(statusGroup)
  const statusOptions = STATUS_FILTERS.filter((f) => f.value === "all" || groupStatuses.includes(f.value))

  function changeStatusGroup(group: OrderStatusGroup) {
    setStatusGroup(group)
    // A etapa escolhida pode não existir na aba nova.
    setStatusFilter("all")
    // "Sem endereço" é fila de pedido pago: fora de Ativos/Todos só daria vazio.
    if (group !== "active" && group !== "all") setMissingShippingOnly(false)
  }

  function toggleMissingShipping() {
    const next = !missingShippingOnly
    setMissingShippingOnly(next)
    if (next && statusGroup !== "active" && statusGroup !== "all") {
      setStatusGroup("active")
      setStatusFilter("all")
    }
  }

  // Trocar de ambiente invalida o cliente escolhido: ele pode não ter pedido
  // nenhum do outro lado, e a fila voltaria vazia sem explicação.
  useEffect(() => {
    setCustomerFilter(null)
  }, [environment])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters =
    statusFilter !== "all" || productFilter !== null || userQuery.trim() !== "" || customerFilter !== null || dateFrom !== "" || dateTo !== "" || missingShippingOnly || environment !== "production" || paymentSource !== "all"

  function clearFilters() {
    setStatusFilter("all")
    setProductFilter(null)
    setUserQuery("")
    setCustomerFilter(null)
    setDateFrom("")
    setDateTo("")
    setMissingShippingOnly(false)
    setEnvironment("production")
    setPaymentSource("all")
  }

  function applyOrderPatch(id: string, patch: Partial<AdminOrder>) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    setManageOrder((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  usePageHeader("Pedidos", "Acompanhe, gerencie e estorne pedidos da loja.")

  return (
    <div className="space-y-4">
      {/* Abas: tipo de pedido + etapa da fila, na mesma linha quando cabe. */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <Tabs value={kind} onValueChange={(value) => setKind(value as OrderKind)}>
          <TabsList>
            {KIND_TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="size-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={statusGroup}
          onValueChange={(value) => changeStatusGroup(value as OrderStatusGroup)}
          className="min-w-0"
        >
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList>
              {STATUS_GROUP_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="gap-1.5">
                  <Icon className="size-3.5" />
                  {label}
                  <span className="text-muted-foreground">({groupCount(counts, value)})</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      </div>

      {/* Filtros: busca + atalhos em cima, recortes numa grade de largura igual. */}
      <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou e-mail do cliente..."
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            {kind !== "service" && (
              <Button
                type="button"
                variant={missingShippingOnly ? "default" : "outline"}
                onClick={toggleMissingShipping}
                className={cn(
                  "gap-1.5",
                  missingShippingOnly && "bg-amber-500 text-black hover:bg-amber-400"
                )}
                title="Pedidos pagos de item físico que ainda estão sem endereço"
              >
                <MapPinOff className="size-3.5" />
                Sem endereço
              </Button>
            )}
            {hasActiveFilters && (
              <Button variant="ghost" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
                <X className="size-3.5" />
                Limpar
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <CustomerFilterCombobox
            value={customerFilter}
            onChange={setCustomerFilter}
            environment={environment}
          />
          <ProductFilterCombobox value={productFilter} onChange={setProductFilter} />
          {/* Sempre na grade (mesmo com uma etapa só) para os campos não pularem de lugar ao trocar de aba. */}
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}
            disabled={statusOptions.length <= 2}
          >
            <SelectTrigger className="w-full min-w-0 border-border bg-card text-sm">
              <SelectValue>
                {(() => {
                  const current = statusOptions.find((f) => f.value === statusFilter)
                  if (!current) return null
                  const Icon = current.icon
                  const label = current.value === "all" ? "Todas as etapas" : current.label
                  const count = current.value === "all" ? groupCount(counts, statusGroup) : counts[current.value] ?? 0
                  return (
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-md",
                          STATUS_FILTER_ICON_STYLE[current.value]
                        )}
                      >
                        <Icon className="size-3" />
                      </span>
                      <span className="truncate">{label}</span>
                      <span className="shrink-0 text-muted-foreground">({count})</span>
                    </span>
                  )
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(({ value, label, icon: Icon }) => (
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
                    <span>{value === "all" ? "Todas as etapas" : label}</span>
                    <span className="text-muted-foreground">
                      ({value === "all" ? groupCount(counts, statusGroup) : counts[value] ?? 0})
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={({ dateFrom: from, dateTo: to }) => {
              setDateFrom(from)
              setDateTo(to)
            }}
          />
          <Select value={environment} onValueChange={(v) => setEnvironment(v as OrderEnvironment)}>
            <SelectTrigger
              className={cn(
                "w-full min-w-0 border-border bg-card text-sm",
                environment !== "production" && "border-amber-500/50 text-amber-300"
              )}
            >
              <SelectValue>
                <span className="flex min-w-0 items-center gap-2">
                  <FlaskConical className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">Ambiente:</span>
                  <span className="truncate">{ENVIRONMENT_FILTERS.find((e) => e.value === environment)?.label}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ENVIRONMENT_FILTERS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentSource} onValueChange={(v) => setPaymentSource(v as OrderPaymentSourceFilter)}>
            <SelectTrigger
              className={cn(
                "w-full min-w-0 border-border bg-card text-sm",
                paymentSource !== "all" && "border-sky-500/50 text-sky-300"
              )}
            >
              <SelectValue>
                <span className="flex min-w-0 items-center gap-2">
                  <CreditCard className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">Gateway:</span>
                  <span className="truncate">{ORDER_PAYMENT_SOURCE_LABEL[paymentSource]}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDER_PAYMENT_SOURCE_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2">
                    {value === "aura" && <AuraIcon size="sm" />}
                    {value === "aura" ? "Aura (resgate, sem gateway)" : ORDER_PAYMENT_SOURCE_LABEL[value]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                    {order.payment_method === "aura" ? (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-400">
                        <Sparkles className="size-3.5" />
                        {(order.aura_cost_paid ?? 0).toLocaleString("pt-BR")} Aura
                      </span>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-emerald-400">{formatBRL(order.total_cents)}</span>
                        <p className="text-[10px] text-muted-foreground">
                          via {PAYMENT_GATEWAY_LABEL[orderPaymentGateway(order)]}
                        </p>
                      </>
                    )}
                    {order.refunded_cents > 0 && (
                      <p className="text-[10px] text-sky-400">-{formatBRL(order.refunded_cents)} estornado</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge order={order} />
                      {order.payment_method === "aura" && (
                        <span
                          title="Resgate da Central de Aura: pago com Aura, sem cobrança em dinheiro"
                          className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-400"
                        >
                          <Sparkles className="size-2.5" strokeWidth={2.5} />
                          PAGO COM AURA
                        </span>
                      )}
                      {order.oversold && (
                        <span
                          title="Pago após expirar, sem estoque para re-reservar"
                          className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-red-400"
                        >
                          <AlertCircle className="size-2.5" strokeWidth={2.5} />
                          SEM ESTOQUE
                        </span>
                      )}
                      {order.card_review && order.status === "pending" && (
                        <span
                          title="Cartão autorizado e segurado para revisão: aprovar ou cancelar no pedido"
                          className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-400"
                        >
                          <AlertCircle className="size-2.5" strokeWidth={2.5} />
                          REVISAR PAGAMENTO
                        </span>
                      )}
                      {(order.fraud_warning || order.chargeback) && (
                        <span
                          title={order.chargeback ? "Disputa (chargeback) no cartão" : "Aviso de fraude do emissor"}
                          className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-red-400"
                        >
                          <AlertCircle className="size-2.5" strokeWidth={2.5} />
                          {order.chargeback ? "DISPUTA" : "AVISO DE FRAUDE"}
                        </span>
                      )}
                      {order.complement_for && (
                        <span
                          title={`Pagamento de complemento do pedido #${order.complement_for.order_number}`}
                          className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-violet-300"
                        >
                          COMPLEMENTO DE #{order.complement_for.order_number}
                        </span>
                      )}
                      {order.complement.pendingCents > 0 && (
                        <span
                          title="Complemento cobrado e ainda não pago pelo cliente"
                          className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-400"
                        >
                          FALTA {formatBRL(order.complement.pendingCents)}
                        </span>
                      )}
                      {!order.requires_shipping_address && !order.complement_for && (
                        <span
                          title="Serviço/item digital: sem entrega, o atendimento é combinado no chamado de suporte"
                          className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-cyan-400"
                        >
                          <Wrench className="size-2.5" strokeWidth={2.5} />
                          SERVIÇO
                        </span>
                      )}
                      {isMissingShippingAddress(order) && (
                        <span
                          title="Pedido pago de item físico sem endereço; o cliente ainda precisa informar em “Meus Pedidos”"
                          className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-400"
                        >
                          <MapPinOff className="size-2.5" strokeWidth={2.5} />
                          SEM ENDEREÇO
                        </span>
                      )}
                      {order.is_sandbox && (
                        <span
                          title={`Pedido de teste (sandbox${order.payment_method === "aura" ? "" : ` da ${PAYMENT_GATEWAY_LABEL[orderPaymentGateway(order)]}`}): não gerou receita nem comissão`}
                          className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-violet-400"
                        >
                          <FlaskConical className="size-2.5" strokeWidth={2.5} />
                          SANDBOX
                        </span>
                      )}
                    </div>
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

function CarrierSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: StoreCarrier | ""
  onChange: (value: StoreCarrier) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as StoreCarrier)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        {STORE_CARRIERS.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const [carrier, setCarrier] = useState<StoreCarrier | "">("")
  const [advancing, setAdvancing] = useState(false)
  const [savingTracking, setSavingTracking] = useState(false)

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundValue, setRefundValue] = useState("")
  const [refundReason, setRefundReason] = useState("")
  const [refunding, setRefunding] = useState(false)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const [approvingReview, setApprovingReview] = useState(false)

  const [manualOpen, setManualOpen] = useState(false)
  const [manualMethod, setManualMethod] = useState<ManualPaymentMethod>("pix")
  const [manualAmount, setManualAmount] = useState("")
  const [manualReference, setManualReference] = useState("")
  const [registeringManual, setRegisteringManual] = useState(false)

  useEffect(() => {
    if (!order) return
    setTrackingCode(order.tracking_code ?? "")
    // Pedido antigo com texto livre que não casa com a lista: fica vazio e o
    // salvar mantém o texto gravado (ver handleUpdateTracking).
    setCarrier(findStoreCarrier(order.carrier) ?? "")
    setRefundOpen(false)
    setRefundValue("")
    setRefundReason("")
    setCancelOpen(false)
    setCancelReason("")
    setManualOpen(false)
    setManualMethod("pix")
    setManualAmount("")
    setManualReference("")
  }, [order?.id])

  if (!order) {
    return <Dialog open={false} onOpenChange={onOpenChange} />
  }

  const next = nextStatusFor(order)
  const isAuraOrder = order.payment_method === "aura"
  const remainingCents = order.total_cents - order.refunded_cents
  // Pedido de Aura não tem cobrança em dinheiro — não há o que estornar pelo gateway.
  const canRefund = !isAuraOrder && REFUNDABLE_STATUSES.includes(order.status) && remainingCents > 0
  // Cobrança no gateway que o painel sabe estornar: Asaas ou Stripe.
  const hasGatewayCharge = Boolean(order.asaas_payment_id || order.stripe_payment_intent_id)
  const canRegisterManual = !isAuraOrder && MANUAL_PAYABLE_STATUSES.includes(order.status)

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
          carrier: next === "shipped" ? carrier || undefined : undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar pedido")

      // Só o envio grava rastreio; ao marcar "Entregue", um código digitado e
      // não salvo no campo de edição não foi para o banco.
      onOrderPatched(
        order.id,
        next === "shipped"
          ? {
              status: next,
              tracking_code: trackingCode.trim() || order.tracking_code,
              carrier: carrier || order.carrier,
            }
          : { status: next }
      )
      toast.success(`Pedido marcado como "${orderStatusLabel(next, order.requires_shipping_address)}"`, { description: `#${orderNumber(order.id)}` })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar pedido"
      toast.error("Erro ao atualizar pedido", { description: message })
    } finally {
      setAdvancing(false)
    }
  }

  // O código muda em alguns casos quando a encomenda chega ao Brasil; o
  // cliente é avisado (site + e-mail) só quando o CÓDIGO muda.
  async function handleUpdateTracking() {
    if (!order) return
    const code = trackingCode.trim()
    setSavingTracking(true)
    try {
      const res = await fetch(`/api/admin/store/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Sem transportadora escolhida, o servidor mantém a gravada.
        body: JSON.stringify({ action: "update_tracking", trackingCode: code, carrier: carrier || undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar rastreio")

      onOrderPatched(order.id, { tracking_code: code, carrier: carrier || order.carrier })
      toast.success("Rastreio atualizado", {
        description:
          code !== order.tracking_code ? "O cliente foi avisado do novo código." : `#${orderNumber(order.id)}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar rastreio"
      toast.error("Erro ao atualizar rastreio", { description: message })
    } finally {
      setSavingTracking(false)
    }
  }

  // Cartão segurado para revisão: aprovar captura a autorização e libera o
  // pedido. Recusar é o "Cancelar pedido" abaixo (solta a autorização).
  async function handleApproveCardReview() {
    if (!order) return
    setApprovingReview(true)
    try {
      const res = await fetch(`/api/admin/store/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_card_review" }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao aprovar pagamento")
      // O status real (pago / aguardando endereço) vem do trigger; recarregar
      // a lista traz o certo. Aqui só tira o alerta.
      onOrderPatched(order.id, { card_review: null, status: "paid" })
      toast.success("Pagamento capturado", { description: `#${orderNumber(order.id)}` })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao aprovar pagamento"
      toast.error("Erro ao aprovar pagamento", { description: message })
    } finally {
      setApprovingReview(false)
    }
  }

  async function handleRefund() {
    if (!order) return
    const trimmedValue = refundValue.trim()
    const valueCents = trimmedValue ? Math.round(Number(trimmedValue.replace(",", ".")) * 100) : undefined
    if (trimmedValue && (!Number.isFinite(valueCents) || (valueCents as number) <= 0)) {
      toast.error("Valor de estorno inválido")
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
      if (!res.ok) throw new Error(data.error ?? "Erro ao estornar pedido")

      const refundedNow = valueCents ?? remainingCents
      const newRefundedCents = order.refunded_cents + refundedNow
      onOrderPatched(order.id, {
        refunded_cents: newRefundedCents,
        refund_reason: refundReason.trim() || order.refund_reason,
        refunded_at: new Date().toISOString(),
        status: newRefundedCents >= order.total_cents ? "refunded" : order.status,
      })
      toast.success("Estorno realizado", { description: `${formatBRL(refundedNow)} · #${orderNumber(order.id)}` })
      setRefundOpen(false)
      setRefundValue("")
      setRefundReason("")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao estornar pedido"
      toast.error("Erro ao estornar pedido", { description: message })
    } finally {
      setRefunding(false)
    }
  }

  async function handleCancel() {
    if (!order) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/admin/store/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason: cancelReason.trim() || undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao cancelar pedido")

      onOrderPatched(order.id, { status: "cancelled" })
      toast.success("Pedido cancelado", { description: `#${orderNumber(order.id)}` })
      setCancelOpen(false)
      setCancelReason("")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao cancelar pedido"
      toast.error("Erro ao cancelar pedido", { description: message })
    } finally {
      setCancelling(false)
    }
  }

  function selectManualMethod(method: ManualPaymentMethod) {
    if (!order) return
    setManualMethod(method)
    setManualAmount(centsToInput(manualPaymentExpectedCents(order, method)))
  }

  async function handleManualPayment() {
    if (!order) return
    const amountCents = parseBrlInput(manualAmount)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error("Valor recebido inválido")
      return
    }

    setRegisteringManual(true)
    try {
      const res = await fetch(`/api/admin/store/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_payment",
          method: manualMethod,
          amountCents,
          reference: manualReference.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        status?: OrderStatus
        totalCents?: number
        manualPayment?: OrderManualPayment
      }
      if (!res.ok || !data.status) throw new Error(data.error ?? "Erro ao registrar pagamento")

      onOrderPatched(order.id, {
        status: data.status,
        payment_method: manualMethod,
        total_cents: data.totalCents ?? amountCents,
        manual_payment: data.manualPayment ?? null,
      })
      toast.success("Pagamento registrado", {
        description: `${formatBRL(amountCents)} · #${orderNumber(order.id)}`,
      })
      setManualOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao registrar pagamento"
      toast.error("Erro ao registrar pagamento", { description: message })
    } finally {
      setRegisteringManual(false)
    }
  }

  // O flag guarda ids (produto ou variante); mostrar o nome do item é bem
  // mais útil que um UUID para quem vai decidir repor ou estornar.
  const oversoldNames = (order.oversold?.items ?? [])
    .map((id) => order.items.find((item) => item.id === id)?.name)
    .filter((name): name is string => Boolean(name))

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Pedido #{orderNumber(order.id)}
            <StatusBadge order={order} />
          </DialogTitle>
          <DialogDescription>Criado em {formatDateTime(order.created_at)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Estoque insuficiente: pago depois de expirar. Vem primeiro no
              diálogo de propósito — é uma decisão a tomar antes de avançar
              o pedido no fluxo. */}
          {order.oversold && (
            <Alert className="border-red-500/40 bg-red-500/10">
              <AlertCircle className="size-4 text-red-400" />
              <AlertDescription className="space-y-1.5 text-xs">
                <p className="font-bold text-red-400">Vendido sem estoque</p>
                <p className="text-foreground">
                  O pagamento foi confirmado depois do PIX expirar. O estoque já tinha sido
                  devolvido e não havia mais unidades para reservar de novo
                  {oversoldNames.length > 0 ? ": " : "."}
                  {oversoldNames.length > 0 && (
                    <span className="font-semibold">{oversoldNames.join(", ")}</span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  Detectado em {formatDateTime(order.oversold.detected_at)}. Reponha o estoque
                  para enviar normalmente, ou estorne o pagamento abaixo.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Cartão autorizado e SEGURADO: nada foi cobrado. Decidir antes de
              tudo — a autorização vence sozinha em ~7 dias. */}
          {order.card_review && order.status === "pending" && (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertCircle className="size-4 text-amber-400" />
              <AlertDescription className="space-y-2 text-xs">
                <p className="font-bold text-amber-400">Pagamento em revisão</p>
                <p className="text-foreground">
                  O cartão foi autorizado, mas a cobrança foi segurada: {order.card_review.reason}
                </p>
                <p className="text-muted-foreground">
                  Risco no Radar: {order.card_review.risk_level ?? "?"} · 3DS:{" "}
                  {order.card_review.three_d_secure ?? "não houve"} · desde{" "}
                  {formatDateTime(order.card_review.held_at)}. Aprovar cobra o cliente; recusar é
                  cancelar o pedido (a autorização é solta e nada é cobrado).
                </p>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleApproveCardReview}
                  disabled={approvingReview}
                >
                  {approvingReview ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  Aprovar e capturar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {order.fraud_warning && (
            <Alert className="border-red-500/40 bg-red-500/10">
              <AlertCircle className="size-4 text-red-400" />
              <AlertDescription className="space-y-1 text-xs">
                <p className="font-bold text-red-400">Aviso de fraude do emissor</p>
                <p className="text-foreground">
                  O banco avisou que esta compra pode ser fraude ({formatDateTime(order.fraud_warning.detected_at)}).
                  Pedido não enviado é estornado sozinho; se já saiu, tente segurar a entrega.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {order.chargeback && (
            <Alert className="border-red-500/40 bg-red-500/10">
              <AlertCircle className="size-4 text-red-400" />
              <AlertDescription className="space-y-1 text-xs">
                <p className="font-bold text-red-400">
                  Disputa no cartão{order.chargeback.lost ? " — PERDIDA" : ""} ({order.chargeback.dispute_status})
                </p>
                <p className="text-foreground">
                  {order.chargeback.reason ? `Motivo: ${order.chargeback.reason}. ` : ""}
                  {order.chargeback.evidence_due_by
                    ? `Responder no painel do gateway até ${formatDateTime(order.chargeback.evidence_due_by)}.`
                    : "Acompanhe no painel do gateway."}
                </p>
              </AlertDescription>
            </Alert>
          )}

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

          {/* Formulário pós-compra de serviço: o que o cliente pediu (Xianyu: produto, link, cor). */}
          {serviceFormLines(order.items).length > 0 && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ClipboardList className="size-3.5" />
                Informações do serviço
              </p>
              {order.service_form_answers ? (
                <>
                  {order.service_form_answers.lines.map((line) => (
                    <dl key={line.line} className="space-y-1.5">
                      {order.service_form_answers!.lines.length > 1 && (
                        <p className="text-xs font-medium text-foreground">{line.product_name}</p>
                      )}
                      {line.answers.map((answer) => (
                        <div key={answer.field_id} className="text-xs">
                          <dt className="text-muted-foreground">{answer.label}</dt>
                          <dd className="whitespace-pre-wrap break-words text-foreground">
                            <ServiceFormAnswerValue answer={answer} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    Enviado em {formatDateTime(order.service_form_answers.submitted_at)}
                    {order.service_form_answers.updated_at !== order.service_form_answers.submitted_at
                      ? ` · editado em ${formatDateTime(order.service_form_answers.updated_at)}`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="text-xs text-amber-400">
                  {order.status === "pending"
                    ? "O cliente preenche depois do pagamento."
                    : "O cliente ainda não preencheu."}
                </p>
              )}
            </div>
          )}

          <OrderComplementSection
            orderId={order.id}
            status={order.status}
            complement={order.complement}
            complementFor={order.complement_for}
            onSaved={(complement) => onOrderPatched(order.id, { complement })}
          />

          {/* Endereço de entrega — snapshot do pedido, não o do perfil atual do cliente */}
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Endereço de entrega
            </p>
            {!order.requires_shipping_address ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Pedido de serviço/item digital: não precisa de endereço de entrega.
                </p>
                {order.service_ticket_id ? (
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <RouteLink href={`/admin/suporte/${order.service_ticket_id}`}>
                      <LifeBuoy className="size-3.5" />
                      Abrir chamado do atendimento
                    </RouteLink>
                  </Button>
                ) : order.complement_for ? (
                  <p className="text-xs text-muted-foreground">
                    O atendimento é o do pedido #{order.complement_for.order_number}.
                  </p>
                ) : (
                  REFUNDABLE_STATUSES.includes(order.status) && (
                    <p className="text-xs text-muted-foreground">
                      Sem chamado vinculado (pedido de convidado ou pago antes da abertura
                      automática). Combine o atendimento pelo e-mail do cliente.
                    </p>
                  )
                )}
              </div>
            ) : order.shipping_address ? (
              <>
                <p className="text-sm text-foreground">{order.shipping_address.recipient}</p>
                <p className="text-xs text-muted-foreground">
                  {order.shipping_address.residence_type
                    ? `${SHIPPING_RESIDENCE_TYPE_LABELS[order.shipping_address.residence_type]} · `
                    : null}
                  {[
                    `${order.shipping_address.street}, ${order.shipping_address.number}`,
                    order.shipping_address.complement || null,
                    order.shipping_address.neighborhood,
                    `${order.shipping_address.city}/${order.shipping_address.state}`,
                    order.shipping_address.postal_code,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {!order.shipping_address.residence_type && (
                  <p className="text-xs text-amber-400">
                    Sem casa/apartamento (endereço informado antes do campo existir).
                  </p>
                )}
                {order.shipping_address.cpf ? (
                  <p className="text-xs text-muted-foreground">
                    CPF: {formatCpfInput(order.shipping_address.cpf)}
                  </p>
                ) : order.customer_cpf ? (
                  // Endereço anterior ao CPF de quem recebe: o do comprador é o
                  // melhor que há, mas pode não ser o do destinatário.
                  <p className="text-xs text-amber-400">
                    CPF do comprador (sem CPF de quem recebe): {formatCpfInput(order.customer_cpf)}
                  </p>
                ) : (
                  <p className="text-xs text-amber-400">Sem CPF de quem recebe nem do comprador.</p>
                )}
                {order.shipping_address.phone && (
                  <p className="text-xs text-muted-foreground">Celular: {order.shipping_address.phone}</p>
                )}
                {order.shipping_address.birth_date ? (
                  <p className="text-xs text-muted-foreground">
                    Nascimento: {isoToBirthDateInput(order.shipping_address.birth_date)}
                  </p>
                ) : (
                  <p className="text-xs text-amber-400">
                    Sem data de nascimento (endereço informado antes do campo existir).
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-amber-400">
                Não informado; o cliente ainda precisa preencher em &ldquo;Meus Pedidos&rdquo;.
              </p>
            )}
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Itens</p>
            <div className="space-y-1.5">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 text-foreground">
                    {item.quantity ?? 1}x {item.name ?? "Produto"}
                    {[item.variant_label, ...(item.variant_options ?? []).map((o) => o.label)]
                      .filter(Boolean)
                      .map((label) => ` · ${label}`)
                      .join("")}
                    {/* SKU e lote: o que a separação precisa para pegar a caixa certa. */}
                    {(item.sku || item.preorder_batch) && (
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        {item.sku && <span className="font-mono">SKU {item.sku}</span>}
                        {item.preorder_batch && <span>{item.preorder_batch}</span>}
                      </span>
                    )}
                  </span>
                  {!isAuraOrder && typeof item.price_cents === "number" && (
                    <span className="text-muted-foreground">{formatBRL(item.price_cents)}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm font-semibold">
              <span className="text-foreground">Total</span>
              {isAuraOrder ? (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <Sparkles className="size-3.5" />
                  {(order.aura_cost_paid ?? 0).toLocaleString("pt-BR")} Aura
                </span>
              ) : (
                <span className="text-emerald-400">{formatBRL(order.total_cents)}</span>
              )}
            </div>
            {order.refunded_cents > 0 && (
              <div className="flex items-center justify-between text-xs text-sky-400">
                <span>Estornado</span>
                <span>-{formatBRL(order.refunded_cents)}</span>
              </div>
            )}
          </div>

          {/* Pagamento */}
          <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
            <p className="font-semibold uppercase tracking-wider text-muted-foreground">Pagamento</p>
            {isAuraOrder ? (
              <p className="flex items-center gap-1.5 text-amber-400">
                <Sparkles className="size-3.5" />
                Resgate da Central de Aura · {(order.aura_cost_paid ?? 0).toLocaleString("pt-BR")} Aura
              </p>
            ) : (
              <>
                {order.manual_payment ? (
                  <>
                    <p className="text-foreground">
                      Registrado à mão · {MANUAL_PAYMENT_METHOD_LABEL[order.manual_payment.method]} ·{" "}
                      {formatBRL(order.manual_payment.amount_cents)}
                    </p>
                    {order.manual_payment.reference && (
                      <p className="break-all text-muted-foreground">Ref.: {order.manual_payment.reference}</p>
                    )}
                    <p className="text-muted-foreground">
                      Em {formatDateTime(order.manual_payment.registered_at)}
                    </p>
                  </>
                ) : (
                  <p className="text-foreground">
                    {order.asaas_payment_id
                      ? "Asaas"
                      : order.stripe_payment_intent_id || order.stripe_session_id
                        ? "Stripe"
                        : "—"}{" "}
                    ·{" "}
                    {order.payment_method === "credit_card" ? "Cartão" : "PIX"}
                  </p>
                )}
                {order.asaas_payment_id && (
                  <p className="break-all text-muted-foreground">ID Asaas: {order.asaas_payment_id}</p>
                )}
                {order.stripe_payment_intent_id && (
                  <p className="break-all text-muted-foreground">ID Stripe: {order.stripe_payment_intent_id}</p>
                )}
              </>
            )}
          </div>

          {order.tracking_code && order.status !== "shipped" && (
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
              <p className="font-semibold uppercase tracking-wider text-sky-400">Motivo do estorno</p>
              <p className="text-foreground">{order.refund_reason}</p>
            </div>
          )}

          <Separator />

          {/* Pago sem endereço: não há botão, a pendência é do cliente. */}
          {order.status === "awaiting_shipping_info" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Próxima etapa
              </p>
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <MapPinOff className="mt-px size-3.5 shrink-0" />
                O cliente ainda não informou o endereço de entrega. Assim que ele preencher em Meus
                Pedidos, o pedido passa sozinho para &quot;Pedido feito&quot;.
              </p>
            </div>
          )}

          {/* Enviado: o código pode mudar quando a encomenda entra no Brasil. */}
          {order.status === "shipped" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rastreio
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-tracking-code" className="text-xs">Código de rastreio</Label>
                  <Input
                    id="edit-tracking-code"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="Ex: BR123456789"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-carrier" className="text-xs">Transportadora</Label>
                  <CarrierSelect id="edit-carrier" value={carrier} onChange={setCarrier} />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleUpdateTracking}
                disabled={
                  savingTracking ||
                  !trackingCode.trim() ||
                  (trackingCode.trim() === (order.tracking_code ?? "") &&
                    (!carrier || carrier === order.carrier))
                }
                className="w-full gap-2"
              >
                <Truck className="size-4" />
                {savingTracking ? "Salvando..." : order.tracking_code ? "Salvar novo rastreio" : "Salvar rastreio"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Em alguns casos o código muda quando a encomenda chega ao Brasil. Ao trocar o código, o
                cliente recebe uma notificação e um e-mail com o novo.
              </p>
            </div>
          )}

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
                    <CarrierSelect id="carrier" value={carrier} onChange={setCarrier} />
                  </div>
                </div>
              )}
              {next === "shipped" && (
                <p className="text-[11px] text-muted-foreground">
                  O cliente recebe o link de rastreio da transportadora e o aviso de que o código pode
                  levar cerca de 7 dias para mostrar movimentação. Dá para trocar o código depois.
                </p>
              )}
              {next === "shipped" && order.requires_shipping_address && !order.shipping_address && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  Sem endereço de entrega informado; não há para onde despachar.
                </p>
              )}
              <Button
                onClick={handleAdvance}
                disabled={
                  advancing ||
                  (next === "shipped" && order.requires_shipping_address && !order.shipping_address) ||
                  // Código sem transportadora: o cliente ficaria sem o link de rastreio.
                  (next === "shipped" && Boolean(trackingCode.trim()) && !carrier)
                }
                className="w-full gap-2"
              >
                {next === "shipped" ? <Truck className="size-4" /> : <PackageCheck className="size-4" />}
                {advancing ? "Salvando..." : `Marcar como "${orderStatusLabel(next, order.requires_shipping_address)}"`}
              </Button>
              {order.status === "shipped" && (
                <p className="text-[11px] text-muted-foreground">
                  O cliente também pode fechar o pedido em Meus Pedidos, pelo botão &quot;Já recebi meu produto&quot;.
                </p>
              )}
            </div>
          )}

          {/* Pago por fora do site: link avulso da Asaas, PIX direto. O site
              não recebe aviso desse pagamento, então o admin registra. */}
          {canRegisterManual && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pagamento por fora do site
              </p>

              {!manualOpen ? (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    selectManualMethod("pix")
                    setManualReference("")
                    setManualOpen(true)
                  }}
                >
                  <Banknote className="size-4" />
                  Registrar pagamento manual
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-xs text-muted-foreground">
                    Use só depois de conferir no painel da Asaas que o dinheiro entrou. O pedido vira pago na
                    conta do cliente, o estoque é reservado de novo e ele recebe a notificação e o e-mail de
                    compra confirmada.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["pix", "credit_card"] as const).map((method) => (
                      <Button
                        key={method}
                        type="button"
                        variant="outline"
                        onClick={() => selectManualMethod(method)}
                        className={cn(
                          manualMethod === method && "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                        )}
                      >
                        {MANUAL_PAYMENT_METHOD_LABEL[method]}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-amount" className="text-xs">
                      Valor recebido (pedido no {MANUAL_PAYMENT_METHOD_LABEL[manualMethod]}:{" "}
                      {formatBRL(manualPaymentExpectedCents(order, manualMethod))})
                    </Label>
                    <Input
                      id="manual-amount"
                      inputMode="decimal"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-reference" className="text-xs">Referência (opcional)</Label>
                    <Input
                      id="manual-reference"
                      value={manualReference}
                      onChange={(e) => setManualReference(e.target.value)}
                      placeholder="Ex: ID da cobrança na Asaas"
                      maxLength={120}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Estorno deste pagamento não sai pelo botão do painel: o site não tem a cobrança. Faça direto
                    na Asaas.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setManualOpen(false)}
                      disabled={registeringManual}
                    >
                      Voltar
                    </Button>
                    <Button className="flex-1 gap-2" onClick={handleManualPayment} disabled={registeringManual}>
                      {registeringManual ? "Registrando..." : "Confirmar pagamento"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancelamento — só pedidos aguardando pagamento */}
          {order.status === "pending" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cancelamento
              </p>

              {!cancelOpen ? (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban className="size-4" />
                  Cancelar pedido
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <p className="text-xs text-muted-foreground">
                    O pedido será cancelado
                    {order.asaas_payment_id
                      ? " e a cobrança removida no Asaas"
                      : order.stripe_payment_intent_id || order.stripe_session_id
                        ? " e a cobrança encerrada no Stripe"
                        : ""}
                    , e o estoque reservado será devolvido.
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="cancel-reason" className="text-xs">Motivo (opcional)</Label>
                    <Textarea
                      id="cancel-reason"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Ex: Cliente desistiu, suspeita de fraude..."
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setCancelOpen(false)}
                      disabled={cancelling}
                    >
                      Voltar
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 gap-2"
                      onClick={handleCancel}
                      disabled={cancelling}
                    >
                      {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Estorno */}
          {canRefund && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estorno {!hasGatewayCharge && "(indisponível)"}
              </p>

              {!hasGatewayCharge && (
                <Alert className="border-amber-500/30 bg-amber-500/10 py-2">
                  <AlertCircle className="size-3.5 text-amber-400" />
                  <AlertDescription className="text-xs text-amber-300">
                    {order.manual_payment
                      ? "Este pedido foi pago por fora do site e registrado à mão. Estorne direto no painel da Asaas."
                      : "Este pedido não tem cobrança Asaas associada (pago por um gateway anterior). Estorne manualmente no painel do gateway e depois marque o pedido como reembolsado."}
                  </AlertDescription>
                </Alert>
              )}

              {order.asaas_payment_id && (
                <Alert className="border-sky-500/30 bg-sky-500/10 py-2">
                  <AlertCircle className="size-3.5 text-sky-400" />
                  <AlertDescription className="text-xs text-sky-300">
                    A chamada de estorno via Asaas ainda precisa ser validada/confirmada manualmente
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
                  disabled={!hasGatewayCharge}
                >
                  <RotateCcw className="size-4" />
                  Estornar pedido
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="space-y-1">
                    <Label htmlFor="refund-value" className="text-xs">
                      Valor a estornar (máx. {formatBRL(remainingCents)})
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
                      {refunding ? "Estornando..." : "Confirmar estorno"}
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
                {order.asaas_payment_id && " Confirme no painel do Asaas se o valor já foi efetivamente devolvido ao cliente."}
              </AlertDescription>
            </Alert>
          )}

          {order.asaas_payment_id && (
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

          {order.stripe_payment_intent_id && (
            <a
              href={`https://dashboard.stripe.com/${order.is_sandbox ? "test/" : ""}payments/${encodeURIComponent(order.stripe_payment_intent_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Ver pagamento no painel Stripe
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
