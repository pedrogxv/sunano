"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  AlertCircle,
  CalendarIcon,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  LifeBuoy,
  Loader2,
  Search,
  User,
  X,
  XCircle,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"

import { SunanoLoader } from "@/components/ui/SunanoLoader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { cn } from "@/lib/utils"

type TicketStatus = "open" | "resolved" | "cancelled"
type WaitingOn = "user" | "admin" | "closed"
type StatusFilter = TicketStatus | "all"
type WaitingFilter = WaitingOn | "all"

type SupportTicket = {
  id: string
  subject: string
  status: TicketStatus
  waiting_on: WaitingOn
  message_count: number
  last_message_at: string
  last_message_preview: string | null
  last_message_sender: "user" | "admin" | null
  rating: number | null
  created_at: string
  order_id: string | null
  product_id: string | null
  user_id: string
  user_display_name: string | null
}

type SupportCustomer = { userId: string; name: string }

type SupportStats = { open: number; resolved: number; cancelled: number }

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "Todos",
  open: "Aberto",
  resolved: "Resolvido",
  cancelled: "Cancelado",
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "bg-sky-500/15 text-sky-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
}

/** Pílula do select de status na tabela — mesmo padrão do status de produto em `/admin/store`. */
const STATUS_SELECT_STYLE: Record<TicketStatus, string> = {
  open: "border-sky-500/30 bg-sky-500/10 text-sky-400 dark:bg-sky-500/10 dark:hover:bg-sky-500/20",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20",
  cancelled: "border-border bg-slate-500/10 text-muted-foreground dark:bg-slate-500/10 dark:hover:bg-slate-500/20",
}

const TICKET_STATUSES: TicketStatus[] = ["open", "resolved", "cancelled"]

const STATUS_FILTER_ICON_STYLE: Record<StatusFilter, string> = {
  all: "bg-primary/15 text-primary",
  open: "bg-sky-500/15 text-sky-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-muted-foreground/15 text-muted-foreground",
}

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string; icon: React.ElementType }> = [
  { value: "all", label: "Todos", icon: LifeBuoy },
  { value: "open", label: "Aberto", icon: Clock },
  { value: "resolved", label: "Resolvido", icon: CheckCircle2 },
  { value: "cancelled", label: "Cancelado", icon: XCircle },
]

const WAITING_LABEL: Record<WaitingFilter, string> = {
  all: "Qualquer turno",
  admin: "Aguardando você",
  user: "Aguardando o cliente",
  closed: "Encerrados",
}

const PAGE_SIZE = 20

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

function CustomerFilterCombobox({
  value,
  onChange,
}: {
  value: SupportCustomer | null
  onChange: (customer: SupportCustomer | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<SupportCustomer[]>([])
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (search.trim().length < 2) {
      setResults([])
      setHasFetched(false)
      return
    }
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: search.trim() })
        const res = await fetch(`/api/admin/support/customers?${params.toString()}`)
        const data = (await res.json()) as { customers?: SupportCustomer[] }
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
      setSearch("")
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            <span className="truncate">{value ? value.name : "Filtrar por usuário"}</span>
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
          <CommandInput placeholder="Buscar usuário por nome..." value={search} onValueChange={setSearch} />
          <CommandList className="min-h-24">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Carregando usuários...
              </div>
            ) : search.trim().length < 2 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Digite ao menos 2 letras</div>
            ) : (
              <>
                {hasFetched && results.length === 0 && <CommandEmpty>Nenhum usuário encontrado.</CommandEmpty>}
                <CommandGroup>
                  {results.map((customer) => (
                    <CommandItem
                      key={customer.userId}
                      value={customer.userId}
                      data-checked={value?.userId === customer.userId}
                      onSelect={() => {
                        onChange(customer)
                        setOpen(false)
                      }}
                    >
                      <span className="truncate">{customer.name}</span>
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

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<SupportStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open")
  const [waitingFilter, setWaitingFilter] = useState<WaitingFilter>("all")
  const [customerFilter, setCustomerFilter] = useState<SupportCustomer | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)
  const [canWrite, setCanWrite] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  // Encerrar (resolver/cancelar) passa por confirmação, como na página do
  // chamado: o cliente é notificado. Reabrir não precisa.
  const [pendingClose, setPendingClose] = useState<{ ticket: SupportTicket; status: "resolved" | "cancelled" } | null>(
    null
  )

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (waitingFilter !== "all") params.set("waiting", waitingFilter)
      if (customerFilter?.userId) params.set("userId", customerFilter.userId)
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString())
      if (dateTo) params.set("dateTo", new Date(`${dateTo}T23:59:59.999`).toISOString())
      params.set("page", String(page))
      params.set("pageSize", String(PAGE_SIZE))

      const res = await fetch(`/api/admin/support?${params.toString()}`)
      const data = (await res.json()) as {
        tickets?: SupportTicket[]
        total?: number
        stats?: SupportStats
        canWrite?: boolean
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar chamados")
      setTickets(data.tickets ?? [])
      setTotal(data.total ?? 0)
      if (data.stats) setStats(data.stats)
      setCanWrite(data.canWrite === true)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar chamados"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, waitingFilter, customerFilter, dateFrom, dateTo, page])

  useEffect(() => { load() }, [load])

  // Qualquer mudança de filtro volta pra primeira página.
  useEffect(() => {
    setPage(1)
  }, [statusFilter, waitingFilter, customerFilter, dateFrom, dateTo])

  async function changeStatus(ticket: SupportTicket, status: TicketStatus) {
    if (ticket.status === status) return
    setSavingId(ticket.id)
    try {
      const res = await fetch(`/api/admin/support/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar o chamado")
      toast.success(`Status: ${STATUS_LABEL[status]}`, { description: ticket.subject })
      // Recarrega em vez de editar a linha: o turno muda junto, os contadores
      // do topo também, e o chamado pode sair do filtro atual.
      await load({ silent: true })
    } catch (err) {
      toast.error("Não foi possível atualizar o chamado", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSavingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters =
    statusFilter !== "open" || waitingFilter !== "all" || customerFilter !== null || dateFrom !== "" || dateTo !== ""

  function clearFilters() {
    setStatusFilter("open")
    setWaitingFilter("all")
    setCustomerFilter(null)
    setDateFrom("")
    setDateTo("")
  }

  usePageHeader("Ticket", "Chamados abertos pelos clientes da loja.")

  return (
    <div className="space-y-6">
      <AlertDialog open={pendingClose !== null} onOpenChange={(open) => !open && setPendingClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingClose?.status === "cancelled" ? "Cancelar este chamado?" : "Fechar este chamado?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingClose?.ticket.subject}&rdquo; será marcado como{" "}
              {pendingClose?.status === "cancelled" ? "cancelado" : "resolvido"}. O cliente será notificado
              {pendingClose?.status === "resolved" ? " e poderá avaliar o atendimento" : ""}. Você pode reabri-lo depois
              pelo mesmo seletor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingClose) void changeStatus(pendingClose.ticket, pendingClose.status)
                setPendingClose(null)
              }}
              className={pendingClose?.status === "cancelled" ? "bg-red-600 text-white hover:bg-red-500" : undefined}
            >
              {pendingClose?.status === "cancelled" ? "Cancelar chamado" : "Fechar chamado"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resumo rápido — criados (abertos), resolvidos e cancelados */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <Clock className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums text-foreground">{stats.open}</p>
              <p className="truncate text-xs text-muted-foreground">Abertos</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums text-foreground">{stats.resolved}</p>
              <p className="truncate text-xs text-muted-foreground">Resolvidos</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <XCircle className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums text-foreground">{stats.cancelled}</p>
              <p className="truncate text-xs text-muted-foreground">Cancelados</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <CustomerFilterCombobox value={customerFilter} onChange={setCustomerFilter} />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
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
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {statusFilter !== "resolved" && statusFilter !== "cancelled" && (
            <Select value={waitingFilter} onValueChange={(v) => setWaitingFilter(v as WaitingFilter)}>
              <SelectTrigger className="w-full border-border bg-card text-sm sm:w-56">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">Turno:</span>
                    <span>{WAITING_LABEL[waitingFilter]}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(["all", "admin", "user"] as WaitingFilter[]).map((w) => (
                  <SelectItem key={w} value={w}>
                    {WAITING_LABEL[w]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
          <SunanoLoader />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Search className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum chamado encontrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assunto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Turno</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Última atividade</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="max-w-[260px] truncate text-sm font-semibold text-foreground">{ticket.subject}</p>
                    {ticket.last_message_preview && (
                      <p className="max-w-[260px] truncate text-xs text-muted-foreground">{ticket.last_message_preview}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{ticket.user_display_name ?? "Usuário"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {canWrite ? (
                      <Select
                        value={ticket.status}
                        onValueChange={(v) => {
                          const status = v as TicketStatus
                          if (status === "open") void changeStatus(ticket, status)
                          else if (status !== ticket.status) setPendingClose({ ticket, status })
                        }}
                        disabled={savingId === ticket.id}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label="Status do chamado"
                          className={cn(
                            "h-7 w-auto gap-1.5 rounded-full px-2.5 text-[11px] font-semibold",
                            STATUS_SELECT_STYLE[ticket.status]
                          )}
                        >
                          <SelectValue>{STATUS_LABEL[ticket.status]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {TICKET_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className={cn("text-[10px]", STATUS_STYLE[ticket.status])}>
                        {STATUS_LABEL[ticket.status]}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {ticket.status === "open" && ticket.waiting_on === "admin" ? (
                      <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-[10px] text-amber-400">
                        <LifeBuoy className="size-3" />
                        Aguardando você
                      </Badge>
                    ) : ticket.status === "open" ? (
                      <span className="text-xs text-muted-foreground">Aguardando o cliente</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/suporte/${ticket.id}`}>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        Ver chamado
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginação */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages} · {total} chamado{total === 1 ? "" : "s"}
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
    </div>
  )
}
