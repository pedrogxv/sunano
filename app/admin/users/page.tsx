"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ShieldCheck,
  Users as UsersIcon,
  UserPlus,
  Lock,
  Save,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Crown,
  Sparkles,
  Search,
  Trash2,
  ShieldAlert,
  ShieldBan,
  ShieldOff,
  UserCog,
  User as UserIcon,
  Pencil,
  Store,
  Headset,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  UserX,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { AnimatedCounter } from "@/components/animated-counter"
import BoxLoader from "@/components/ui/box-loader"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { usePageHeader } from "@/components/providers/page-header-context"
import { getTierCapabilities, type AccountTier } from "@/lib/account-tier"
import {
  ADMIN_FEATURES,
  ADMIN_ROLE_ORDER,
  getRolePermissions,
  normalizePermissions,
  type AdminProfile,
  type AdminRole,
} from "@/lib/admin-permissions"
import { getSpecialTag } from "@/lib/special-tag"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RoleBadge, adminRoleLabel } from "@/components/people/RoleBadge"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/use-t"
import { useLocale } from "@/components/providers/locale-context"
import { formatRelativeTime } from "@/lib/format-tierlist-date"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"

type UserRole = AdminProfile["role"] | "user"

type AdminUser = Omit<AdminProfile, "role"> & {
  role: UserRole
  /** Cargo persistido no servidor (não muda com a edição local do select). */
  originalRole: UserRole
  account_tier: AccountTier
  display_slug: string | null
  account_banned_at: string | null
  account_ban_reason: string | null
  /** Liberação individual do "pacote Loja" (Loja + Afiliados) mesmo com a manutenção ligada. */
  store_access: boolean
  /** false = conta sem linha em `user_profiles` (órfã de OAuth). */
  has_profile: boolean
  last_sign_in_at: string | null
  created_at: string
  updated_at: string
}

type UserStats = {
  total: number
  regular: number
  banned: number
  vip: number
  store_access: number
  no_profile: number
  new_30d: number
  active_30d: number
  by_role: Record<string, number>
}

type UsersResponse = {
  ok?: boolean
  error?: string
  current_user_id?: string
  current_user_role?: string
  users?: AdminUser[]
  total?: number
  page?: number
  pageSize?: number
  stats?: UserStats
}

type StatusFilter = "all" | "banned" | "vip" | "store_access" | "no_profile"
type SortOption = "recent" | "oldest" | "name-asc" | "name-desc" | "email-asc"

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const

// Web Master exige a promoção com confirmação dedicada; "user" não se convida, é o estado sem cargo.
type CreatableRole = Exclude<AdminRole, "webmaster">

type NewUserForm = {
  email: string
  displayName: string
  role: CreatableRole
}

type RoleFilter = "all" | UserRole

const ROLE_RING: Record<UserRole, string> = {
  webmaster: "ring-2 ring-amber-400/40",
  admin: "ring-2 ring-cyan-400/30",
  moderator: "ring-2 ring-violet-400/30",
  editor: "ring-2 ring-sky-400/30",
  vendedor: "ring-2 ring-emerald-400/30",
  suporte: "ring-2 ring-orange-400/30",
  user: "ring-1 ring-border",
}

// Metadados visuais dos StatChips de cargo, na mesma ordem de poder de ADMIN_ROLE_ORDER.
const ROLE_STAT_META: Record<AdminRole, {
  icon: React.ElementType
  colorClass: string
  hoverClass: string
  labelKey: "statWebMasters" | "statAdmins" | "statModerators" | "statEditors" | "statVendedores" | "statSuportes"
}> = {
  webmaster: { icon: Crown, colorClass: "bg-amber-500/15 text-amber-300", hoverClass: "hover:border-amber-400/40 hover:bg-amber-500/5", labelKey: "statWebMasters" },
  admin: { icon: ShieldCheck, colorClass: "bg-cyan-500/15 text-cyan-300", hoverClass: "hover:border-cyan-400/40 hover:bg-cyan-500/5", labelKey: "statAdmins" },
  moderator: { icon: UserCog, colorClass: "bg-violet-500/15 text-violet-300", hoverClass: "hover:border-violet-400/40 hover:bg-violet-500/5", labelKey: "statModerators" },
  editor: { icon: Pencil, colorClass: "bg-sky-500/15 text-sky-300", hoverClass: "hover:border-sky-400/40 hover:bg-sky-500/5", labelKey: "statEditors" },
  vendedor: { icon: Store, colorClass: "bg-emerald-500/15 text-emerald-300", hoverClass: "hover:border-emerald-400/40 hover:bg-emerald-500/5", labelKey: "statVendedores" },
  suporte: { icon: Headset, colorClass: "bg-orange-500/15 text-orange-300", hoverClass: "hover:border-orange-400/40 hover:bg-orange-500/5", labelKey: "statSuportes" },
}

/* ── Read-only permission indicator ──────────────────────── */
function PermissionDot({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {on ? "✓" : "–"}
    </span>
  )
}

/* ── Permission grid — somente leitura: permissões vêm 100% do cargo ── */
function PermissionGrid({ permissions }: { permissions: Record<string, boolean> }) {
  const t = useT()
  const features = ADMIN_FEATURES.filter((f) => f.key !== "dashboard")
  const norm = normalizePermissions(permissions)

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {features.map((feature) => {
        const canRead = norm[feature.readKey]
        const canWrite = norm[feature.writeKey]
        return (
          <div key={feature.key} className={`rounded-xl border p-3 transition-colors ${canWrite ? "border-primary/20 bg-primary/5" : canRead ? "border-border bg-muted/10" : "border-border/40 bg-muted/5"}`}>
            <p className="mb-2.5 text-xs font-semibold text-foreground">{feature.label}</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{t.admin.users.read}</span>
                <PermissionDot on={canRead} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{t.admin.users.edit}</span>
                <PermissionDot on={canWrite} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Tier badge ──────────────────────────────────────────── */
function TierBadge({ tier }: { tier: AccountTier }) {
  if (tier === "common") return null
  const { label } = getTierCapabilities(tier)
  return (
    <Badge
      className="border"
      style={{ backgroundColor: "var(--vip-accent-soft)", color: "var(--vip-accent)", borderColor: "var(--vip-accent-soft)" }}
    >
      <Crown className="mr-1 size-3" />
      {label}
    </Badge>
  )
}

/* ── Banned badge — mostra o motivo no tooltip ──────────────── */
function BannedBadge({ reason }: { reason: string | null }) {
  const t = useT()
  return (
    <Badge
      variant="destructive"
      className="gap-1"
      title={reason ? `${t.admin.users.banReasonPrefix}: ${reason}` : undefined}
    >
      <ShieldBan className="size-3" />
      {t.admin.users.bannedBadge}
    </Badge>
  )
}

/* ── Conta sem linha em user_profiles ───────────────────────
 * Não é cosmético: a conta loga mas não existe no /pessoas, no ranking nem
 * em nada que leia o perfil. Só esta tela consegue mostrá-la. */
function NoProfileBadge({ hint }: { hint: string }) {
  const t = useT()
  return (
    <Badge
      variant="outline"
      className="gap-1 border-orange-500/40 text-orange-400"
      title={hint}
    >
      <UserX className="size-3" />
      {t.admin.users.noProfileBadge}
    </Badge>
  )
}

/* ── Special tag badge (ex: SUNANO) — aglutina com o TierBadge ─ */
function SpecialTagBadge({ slug }: { slug: string | null }) {
  const tag = getSpecialTag(slug)
  if (!tag) return null
  return (
    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20">
      <Sparkles className="mr-1 size-3" />
      {tag.label}
    </Badge>
  )
}

/* ── User card ───────────────────────────────────────────── */
function UserCard({
  user,
  isCurrentUser,
  isCurrentUserWebMaster,
  savingId,
  deletingId,
  vipSavingId,
  storeAccessSavingId,
  banningId,
  onRoleChange,
  onSave,
  onDelete,
  onVipToggle,
  onStoreAccessToggle,
  onBan,
  onUnban,
}: {
  user: AdminUser
  isCurrentUser: boolean
  isCurrentUserWebMaster: boolean
  savingId: string | null
  deletingId: string | null
  vipSavingId: string | null
  storeAccessSavingId: string | null
  banningId: string | null
  onRoleChange: (id: string, role: UserRole) => void
  onSave: (user: AdminUser) => void
  onDelete: (user: AdminUser) => Promise<void>
  onVipToggle: (user: AdminUser) => Promise<void>
  onStoreAccessToggle: (user: AdminUser) => Promise<void>
  onBan: (user: AdminUser, reason: string) => Promise<void>
  onUnban: (user: AdminUser) => Promise<void>
}) {
  const t = useT()
  const { locale } = useLocale()
  const [expanded, setExpanded] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [banDialogOpen, setBanDialogOpen] = useState(false)
  const [banReason, setBanReason] = useState("")
  const [unbanDialogOpen, setUnbanDialogOpen] = useState(false)
  const [impDialogOpen, setImpDialogOpen] = useState(false)
  const [impReason, setImpReason] = useState("")
  const [impTicket, setImpTicket] = useState("")
  const [impStarting, setImpStarting] = useState(false)
  // A trava usa o cargo PERSISTIDO (não o que está sendo editado no select),
  // senão escolher "WEB Master" travaria a própria linha antes de salvar.
  const isPersistedWebMaster = user.originalRole === "webmaster"
  const isRegularUser = user.role === "user"
  // VIP manual só se aplica a quem NÃO tem cargo persistido — com cargo, o VIP
  // é automático (garantido pela API) e a UI só exibe o estado, travada.
  const isPersistedRegular = user.originalRole === "user"
  const canEditVip = isPersistedRegular && !isCurrentUser
  const isVip = user.account_tier !== "common"
  const locked = isPersistedWebMaster
  // Promoção a WEB Master (a partir de um cargo menor) exige confirmação.
  const isPromotingToWebmaster = user.role === "webmaster" && user.originalRole !== "webmaster"
  const canChangeThisPassword = isCurrentUserWebMaster && (!isPersistedWebMaster || isCurrentUser)
  // Excluir é exclusivo do WEB Master, nunca a própria conta nem outro WEB Master.
  const canDeleteThisUser = isCurrentUserWebMaster && !isCurrentUser && !isPersistedWebMaster
  // Banir tem as mesmas travas do excluir — exclusivo do WEB Master, nunca a
  // própria conta nem outro WEB Master.
  const canBanThisUser = isCurrentUserWebMaster && !isCurrentUser && !isPersistedWebMaster
  // "Logar como" — só o WEB Master, só contas de usuário COMUM (nunca outro
  // cargo), nunca a própria conta, nunca conta banida. Espelha a trava do
  // endpoint (app/api/admin/users/[id]/impersonate/route.ts).
  const canImpersonateThisUser =
    isCurrentUserWebMaster &&
    !isCurrentUser &&
    isPersistedRegular &&
    !Boolean(user.account_banned_at)
  const isBanned = Boolean(user.account_banned_at)
  // "Pacote Loja": exclusivo do WEB Master, para qualquer conta, inclusive a
  // própria. O cargo não fura mais a manutenção sozinho, então é assim que o
  // WEB Master liga a Loja para si quando precisa testar.
  const canEditStoreAccess = isCurrentUserWebMaster
  const hasStoreAccess = Boolean(user.store_access)
  const isSavingStoreAccess = storeAccessSavingId === user.id
  const isBanning = banningId === user.id
  const initials = (user.display_name ?? user.email ?? "?").slice(0, 2).toUpperCase()
  const isDeleting = deletingId === user.id
  const deleteConfirmMatches =
    !!user.email && deleteConfirmText.trim().toLowerCase() === user.email.trim().toLowerCase()

  async function handleBanConfirm() {
    if (!banReason.trim()) return
    await onBan(user, banReason.trim())
    setBanDialogOpen(false)
    setBanReason("")
  }

  async function handleUnbanConfirm() {
    await onUnban(user)
    setUnbanDialogOpen(false)
  }

  async function handlePasswordSave() {
    if (!newPassword || newPassword.length < 8) return
    try {
      setSavingPassword(true)
      const res = await fetch(`/api/admin/users/${user.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToChangePassword)
      toast.success(t.admin.users.passwordChanged, { description: user.display_name || user.email })
      setNewPassword("")
      setShowPasswordForm(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToChangePassword
      toast.error(t.admin.users.failedToChangePassword, { description: message })
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirmMatches) return
    await onDelete(user)
    setDeleteDialogOpen(false)
    setDeleteConfirmText("")
  }

  async function handleImpersonateConfirm() {
    if (impReason.trim().length < 10 || impStarting) return
    try {
      setImpStarting(true)
      const res = await fetch(`/api/admin/users/${user.id}/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: impReason.trim(),
          ticket: impTicket.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; redirectTo?: string }
        | null
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Falha ao iniciar o acesso.")
      }
      // A sessão agora é do usuário-alvo; recarrega já no site público.
      window.location.href = data.redirectTo ?? "/"
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao iniciar o acesso."
      toast.error("Não foi possível acessar a conta", { description: message })
      setImpStarting(false)
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border transition-colors",
        expanded ? "border-border bg-card/80" : "border-border/60 bg-card/40"
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        {/* Avatar */}
        {/* O anel aqui é de CARGO administrativo, eixo diferente da moldura de
            perfil (`lib/profile-frames.ts`): ele responde "que poder esta
            conta tem no painel", não "o que o usuário conquistou". Por isso
            fica no wrapper e a foto em si vem do componente único. */}
        <div className={cn("shrink-0 rounded-full", ROLE_RING[user.role])}>
          <ProfileAvatar
            name={user.display_name || user.email || "?"}
            avatarUrl={user.avatar_url}
            size="md"
            // Sem moldura na tabela do painel: aqui o sinal que importa é o
            // cargo (anel do wrapper), e duas molduras concorrentes no mesmo
            // avatar só confundem quem está moderando.
            frameOverride={null}
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{user.display_name || user.email}</p>
            <RoleBadge role={user.role} />
            <TierBadge tier={user.account_tier} />
            <SpecialTagBadge slug={user.display_slug} />
            {isBanned && <BannedBadge reason={user.account_ban_reason} />}
            {!user.has_profile && <NoProfileBadge hint={t.admin.users.noProfileHint} />}
            {isCurrentUser && <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">Você</Badge>}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="truncate">{user.email}</span>
            <span className="text-muted-foreground/50">
              {user.last_sign_in_at
                ? t.admin.users.lastSeen(formatRelativeTime(user.last_sign_in_at, locale))
                : t.admin.users.neverSignedIn}
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {!locked && (
            isPromotingToWebmaster ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={savingId === user.id} className="gap-1.5 text-xs">
                    <Save className="size-3.5" />
                    {savingId === user.id ? t.admin.users.saving : t.admin.users.save}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t.admin.users.makeWebMaster(user.display_name || user.email || "")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t.admin.users.makeWebMasterDesc}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.admin.users.cancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onSave(user)} className="bg-amber-500 text-black hover:bg-amber-400">
                      {t.admin.users.confirmMakeWebMaster}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSave(user)}
                disabled={savingId === user.id}
                className="gap-1.5 text-xs"
              >
                <Save className="size-3.5" />
                {savingId === user.id ? t.admin.users.saving : t.admin.users.save}
              </Button>
            )
          )}
          {canChangeThisPassword && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowPasswordForm((v) => !v); setNewPassword("") }}
              className="gap-1.5 text-xs"
            >
              <KeyRound className="size-3.5" />
              <span className="hidden sm:inline">{t.admin.users.password}</span>
            </Button>
          )}
          {canImpersonateThisUser && (
            <Dialog
              open={impDialogOpen}
              onOpenChange={(open) => {
                setImpDialogOpen(open)
                if (!open) { setImpReason(""); setImpTicket("") }
              }}
            >
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImpDialogOpen(true)}
                className="gap-1.5 border-amber-500/30 text-xs text-amber-500 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400"
              >
                <Eye className="size-3.5" />
                <span className="hidden sm:inline">Logar como</span>
              </Button>
              <DialogContent className="border border-border bg-card">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-amber-500">
                    <Eye className="size-4.5" />
                    Acessar a conta de {user.display_name || user.email}
                  </DialogTitle>
                  <DialogDescription className="space-y-2">
                    <span className="block">
                      Você entrará no site <strong>como este usuário</strong>, em modo{" "}
                      <strong>somente leitura</strong>: nenhuma ação em nome dele é permitida.
                      A sessão expira em 30 minutos e fica registrada na auditoria (quem, quando,
                      motivo).
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Base legal: legítimo interesse / execução de contrato para suporte técnico
                      (LGPD Art. 7º, V e IX). Use apenas para diagnosticar um problema concreto.
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Motivo do acesso <span className="text-red-400">*</span>
                    </label>
                    <Input
                      value={impReason}
                      onChange={(e) => setImpReason(e.target.value)}
                      placeholder="Ex.: investigar erro ao finalizar pedido relatado pelo usuário"
                      autoComplete="off"
                      className="border-border bg-background"
                    />
                    {impReason.trim().length > 0 && impReason.trim().length < 10 && (
                      <p className="text-[11px] text-red-400">Mínimo de 10 caracteres.</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Chamado / ticket (opcional)
                    </label>
                    <Input
                      value={impTicket}
                      onChange={(e) => setImpTicket(e.target.value)}
                      placeholder="Ex.: #1234"
                      autoComplete="off"
                      className="border-border bg-background"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setImpDialogOpen(false)}
                    disabled={impStarting}
                  >
                    {t.admin.users.cancel}
                  </Button>
                  <Button
                    onClick={handleImpersonateConfirm}
                    disabled={impReason.trim().length < 10 || impStarting}
                    className="bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
                  >
                    <Eye className="mr-1.5 size-3.5" />
                    {impStarting ? "Iniciando…" : "Acessar conta"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canBanThisUser && (
            isBanned ? (
              <Dialog open={unbanDialogOpen} onOpenChange={setUnbanDialogOpen}>
                <DialogContent className="border border-border bg-card">
                  <DialogHeader>
                    <DialogTitle>{t.admin.users.unbanUserTitle(user.display_name || user.email || "")}</DialogTitle>
                    <DialogDescription>{t.admin.users.unbanUserDesc}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setUnbanDialogOpen(false)} disabled={isBanning}>
                      {t.admin.users.cancel}
                    </Button>
                    <Button onClick={handleUnbanConfirm} disabled={isBanning}>
                      <ShieldOff className="mr-1.5 size-3.5" />
                      {isBanning ? t.admin.users.saving : t.admin.users.confirmUnban}
                    </Button>
                  </DialogFooter>
                </DialogContent>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBanning}
                  onClick={() => setUnbanDialogOpen(true)}
                  className="gap-1.5 text-xs"
                >
                  <ShieldOff className="size-3.5" />
                  <span className="hidden sm:inline">{t.admin.users.unbanUser}</span>
                </Button>
              </Dialog>
            ) : (
              <Dialog open={banDialogOpen} onOpenChange={(open) => { setBanDialogOpen(open); if (!open) setBanReason("") }}>
                <DialogContent className="border border-border bg-card">
                  <DialogHeader>
                    <DialogTitle>{t.admin.users.banUserTitle(user.display_name || user.email || "")}</DialogTitle>
                    <DialogDescription>{t.admin.users.banUserDesc}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t.admin.users.banReasonLabel}</label>
                    <Input
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder={t.admin.users.banReasonPlaceholder}
                      autoComplete="off"
                      className="border-border bg-background"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setBanDialogOpen(false)} disabled={isBanning}>
                      {t.admin.users.cancel}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleBanConfirm}
                      disabled={!banReason.trim() || isBanning}
                    >
                      <ShieldBan className="mr-1.5 size-3.5" />
                      {isBanning ? t.admin.users.saving : t.admin.users.confirmBan}
                    </Button>
                  </DialogFooter>
                </DialogContent>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBanning}
                  onClick={() => setBanDialogOpen(true)}
                  className="gap-1.5 border-red-500/30 text-xs text-red-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                >
                  <ShieldBan className="size-3.5" />
                  <span className="hidden sm:inline">{t.admin.users.banUser}</span>
                </Button>
              </Dialog>
            )
          )}
          {canDeleteThisUser && (
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                setDeleteDialogOpen(open)
                if (!open) setDeleteConfirmText("")
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isDeleting}
                  className="gap-1.5 border-red-500/30 text-xs text-red-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                  {isDeleting ? t.common.deleting : <span className="hidden sm:inline">{t.common.delete}</span>}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-red-400">
                    <ShieldAlert className="size-4.5" />
                    {t.admin.users.deleteUserTitle(user.display_name || user.email || "")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>{t.admin.users.deleteUserDesc}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t.admin.users.deleteConfirmLabel(user.email ?? "")}
                  </label>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={user.email ?? ""}
                    autoComplete="off"
                    className="border-border bg-background"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.admin.users.cancel}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault()
                      void handleDeleteConfirm()
                    }}
                    disabled={!deleteConfirmMatches || isDeleting}
                    className="bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    {isDeleting ? t.common.deleting : t.admin.users.confirmDelete}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {locked && !isCurrentUser && (
            <div className="flex items-center gap-1 text-xs text-amber-400/80">
              <Lock className="size-3.5" />
              <span className="hidden sm:inline">{t.admin.users.locked}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="space-y-4 border-t border-border px-4 pb-4 pt-4">
          {/* Role selector */}
          {!locked && (
            <div className="flex items-center gap-3">
              <label className="min-w-16 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.admin.users.role}</label>
              <Select value={user.role} onValueChange={(v) => onRoleChange(user.id, v as UserRole)}>
                <SelectTrigger className="w-44 border-border bg-card/50 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_ROLE_ORDER.filter((r) => r !== "webmaster" || isCurrentUserWebMaster).map((r) => (
                    <SelectItem key={r} value={r}>{adminRoleLabel(t, r)}</SelectItem>
                  ))}
                  <SelectItem value="user">{t.admin.users.user}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isRegularUser && (
            <p className="text-xs text-muted-foreground">
              {t.admin.users.regularUserNote}
            </p>
          )}

          {/* VIP — automático por cargo (travado) ou manual para Usuário comum */}
          {!locked && (
            <div className="flex items-center gap-3">
              <label className="min-w-16 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t.admin.users.vipLabel}
              </label>
              {canEditVip ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={vipSavingId === user.id}
                  onClick={() => onVipToggle(user)}
                  className="gap-1.5 text-xs"
                  style={isVip ? { borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" } : undefined}
                >
                  <Crown className="size-3.5" />
                  {vipSavingId === user.id
                    ? t.admin.users.saving
                    : isVip
                      ? t.admin.users.vipManualRevoke
                      : t.admin.users.vipManualGrant}
                </Button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5" />
                  {t.admin.users.vipAutoByRole}
                </div>
              )}
            </div>
          )}

          {/* Pacote Loja — libera Loja + Afiliados para ESTE usuário mesmo com
              STORE_MAINTENANCE_MODE ligada. Não dá privilégio nenhum além
              disso: o usuário compra e indica como qualquer um faria com a
              loja aberta. Só o WEB Master concede. */}
          {canEditStoreAccess && (
            <div className="flex items-start gap-3">
              <label className="min-w-16 shrink-0 pt-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t.admin.users.storeAccessLabel}
              </label>
              <div className="space-y-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSavingStoreAccess}
                  onClick={() => onStoreAccessToggle(user)}
                  className="gap-1.5 text-xs"
                  style={
                    hasStoreAccess
                      ? { borderColor: "rgb(16 185 129 / 0.4)", color: "rgb(52 211 153)" }
                      : undefined
                  }
                >
                  <Store className="size-3.5" />
                  {isSavingStoreAccess
                    ? t.admin.users.saving
                    : hasStoreAccess
                      ? t.admin.users.storeAccessRevoke
                      : t.admin.users.storeAccessGrant}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {hasStoreAccess
                    ? t.admin.users.storeAccessOnHint
                    : t.admin.users.storeAccessOffHint}
                </p>
              </div>
            </div>
          )}

          {locked && !isCurrentUser && (
            <p className="text-xs text-amber-400/80">
              {t.admin.users.webMasterProtected}
            </p>
          )}

          <PermissionGrid
            permissions={getRolePermissions(user.role)}
          />
        </div>
      )}

      {/* Password change form */}
      {showPasswordForm && canChangeThisPassword && (
        <div className="border-t border-border px-4 pb-4 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.admin.users.changePassword}
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.admin.users.newPasswordPlaceholder}
              className="border-border bg-background"
              onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSave() }}
            />
            <Button
              size="sm"
              onClick={handlePasswordSave}
              disabled={savingPassword || newPassword.length < 8}
              className="shrink-0 gap-1.5"
            >
              <KeyRound className="size-3.5" />
              {savingPassword ? t.admin.users.saving : t.admin.users.save}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowPasswordForm(false); setNewPassword("") }}
              className="shrink-0"
            >
              {t.admin.users.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Seção de lista de usuários (título + contador + cards) ──
 * Nome específico (`UserListSection`) para não colidir com o
 * componente de página `AdminUsersPage` nem com o rótulo genérico
 * `common.users`: cada seção tem seu próprio título dedicado. */
function UserListSection({
  title,
  icon: Icon,
  users,
  total,
  rangeLabel,
  emptyLabel,
  currentUserId,
  isCurrentUserWebMaster,
  savingId,
  deletingId,
  vipSavingId,
  storeAccessSavingId,
  banningId,
  onRoleChange,
  onSave,
  onDelete,
  onVipToggle,
  onStoreAccessToggle,
  onBan,
  onUnban,
}: {
  title: string
  icon: React.ElementType
  users: AdminUser[]
  /** Total da consulta inteira, não só desta página. */
  total: number
  rangeLabel: string
  emptyLabel: string
  currentUserId: string | null
  isCurrentUserWebMaster: boolean
  savingId: string | null
  deletingId: string | null
  vipSavingId: string | null
  storeAccessSavingId: string | null
  banningId: string | null
  onRoleChange: (id: string, role: UserRole) => void
  onSave: (user: AdminUser) => void
  onDelete: (user: AdminUser) => Promise<void>
  onVipToggle: (user: AdminUser) => Promise<void>
  onStoreAccessToggle: (user: AdminUser) => Promise<void>
  onBan: (user: AdminUser, reason: string) => Promise<void>
  onUnban: (user: AdminUser) => Promise<void>
}) {
  return (
    <Card className="border-border bg-card/90">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" />
          {title}
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">{total}</span>
          <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">{rangeLabel}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {users.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : users.map((user, index) => (
          <div
            key={user.id}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
          >
            <UserCard
              user={user}
              isCurrentUser={user.id === currentUserId}
              isCurrentUserWebMaster={isCurrentUserWebMaster}
              savingId={savingId}
              deletingId={deletingId}
              vipSavingId={vipSavingId}
              storeAccessSavingId={storeAccessSavingId}
              banningId={banningId}
              onRoleChange={onRoleChange}
              onSave={onSave}
              onDelete={onDelete}
              onVipToggle={onVipToggle}
              onStoreAccessToggle={onStoreAccessToggle}
              onBan={onBan}
              onUnban={onUnban}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/* ── Stat chip — também funciona como atalho de filtro por cargo ─ */
function StatChip({
  icon: Icon,
  value,
  label,
  colorClass,
  active,
  hoverClass,
  onClick,
}: {
  icon: React.ElementType
  value: number
  label: string
  colorClass: string
  active: boolean
  hoverClass: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border p-3 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5",
        active ? "border-primary/50 bg-primary/10" : "border-border bg-card/60",
        hoverClass
      )}
    >
      <div className={cn("flex size-7 items-center justify-center rounded-lg", colorClass)}>
        <Icon className="size-3.5" />
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-foreground">
        <AnimatedCounter value={value} duration={800} />
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </button>
  )
}

/* ── Main page ───────────────────────────────────────────── */
export default function AdminUsersPage() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [vipSavingId, setVipSavingId] = useState<string | null>(null)
  const [storeAccessSavingId, setStoreAccessSavingId] = useState<string | null>(null)
  const [banningId, setBanningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)

  // ── Estado da listagem: TUDO isto é resolvido no servidor ──────────
  // A tela antes carregava a base inteira e filtrava no navegador. Agora cada
  // mudança aqui vira uma query paginada.
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 350)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<SortOption>("recent")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(24)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<UserStats | null>(null)

  // O cargo do próprio WEB Master não pode depender de ele estar na página
  // atual — com paginação ele quase nunca está. Vem do servidor.
  const [isCurrentUserWebMaster, setIsCurrentUserWebMaster] = useState(false)
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: "",
    displayName: "",
    role: "admin",
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeTo = Math.min(page * pageSize, total)
  const hasActiveFilters =
    search.trim() !== "" || roleFilter !== "all" || statusFilter !== "all" || sort !== "recent"

  // Volta de uma sessão "logado como" que expirou (o proxy redireciona pra cá).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("impersonation") === "expired") {
      toast.info("A sessão de acesso expirou e foi encerrada.")
      window.history.replaceState({}, "", "/admin/users")
    }
  }, [])

  const loadUsers = useCallback(async (opts?: { withStats?: boolean }) => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        role: roleFilter,
        status: statusFilter,
        sort,
      })
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())
      // Os contadores valem pra base inteira: não mudam ao virar de página
      // nem ao filtrar, então só são pedidos quando podem ter mudado.
      if (opts?.withStats === false) params.set("stats", "0")

      const res = await fetch(`/api/admin/users?${params}`)
      const data = await res.json().catch(() => null) as UsersResponse | null
      if (!res.ok || !data?.users) throw new Error(data?.error ?? t.admin.users.failedToLoad)

      setCurrentUserId(data.current_user_id ?? null)
      setIsCurrentUserWebMaster(data.current_user_role === "webmaster")
      setUsers(data.users.map((u) => ({ ...u, permissions: normalizePermissions(u.permissions), originalRole: u.role })))
      setTotal(data.total ?? 0)
      if (data.stats) setStats(data.stats)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToLoad
      setError(message)
      toast.error(t.admin.users.failedToLoad, { description: message })
    } finally {
      setLoading(false)
    }
  // `t` é estável o suficiente aqui; recriar o callback a cada render dispararia refetch em loop.
  }, [page, pageSize, roleFilter, statusFilter, sort, debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadUsers() }, [loadUsers])

  // Qualquer mudança de filtro volta pra primeira página — senão o admin fica
  // olhando uma página 7 que não existe mais no resultado novo.
  useEffect(() => { setPage(1) }, [debouncedSearch, roleFilter, statusFilter, sort, pageSize])


  function updateUserRole(userId: string, nextRole: UserRole) {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: nextRole } : u))
  }

  async function saveUser(user: AdminUser) {
    try {
      setSavingId(user.id)
      setError(null)
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, role: user.role }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToSave)
      toast.success(t.admin.users.userUpdated, {
        description: user.display_name || user.email,
      })
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToSave
      setError(message)
      toast.error(t.admin.users.failedToSaveUser, { description: message })
    } finally {
      setSavingId(null)
    }
  }

  async function toggleVip(user: AdminUser) {
    const nextTier = user.account_tier === "common" ? "vip" : "common"
    try {
      setVipSavingId(user.id)
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, account_tier: nextTier }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToUpdateVip)
      toast.success(t.admin.users.userUpdated, { description: user.display_name || user.email })
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToUpdateVip
      toast.error(t.admin.users.failedToUpdateVip, { description: message })
    } finally {
      setVipSavingId(null)
    }
  }

  // Liga/desliga o "pacote Loja" (Loja + Afiliados) para um usuário. A
  // autorização real é do servidor (PATCH /api/admin/users só aceita de WEB
  // Master); aqui a UI só já esconde o botão de quem não pode.
  async function toggleStoreAccess(user: AdminUser) {
    const next = !user.store_access
    try {
      setStoreAccessSavingId(user.id)
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, store_access: next }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToUpdateStoreAccess)
      toast.success(
        next ? t.admin.users.storeAccessGranted : t.admin.users.storeAccessRevoked,
        { description: user.display_name || user.email || undefined }
      )
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToUpdateStoreAccess
      toast.error(t.admin.users.failedToUpdateStoreAccess, { description: message })
    } finally {
      setStoreAccessSavingId(null)
    }
  }

  async function banUser(user: AdminUser, reason: string) {
    try {
      setBanningId(user.id)
      const res = await fetch("/api/admin/users/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, reason }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToBan)
      toast.success(t.admin.users.userBanned, { description: user.display_name || user.email || undefined })
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToBan
      toast.error(t.admin.users.failedToBan, { description: message })
    } finally {
      setBanningId(null)
    }
  }

  async function unbanUser(user: AdminUser) {
    try {
      setBanningId(user.id)
      const res = await fetch("/api/admin/users/ban", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToUnban)
      toast.success(t.admin.users.userUnbanned, { description: user.display_name || user.email || undefined })
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToUnban
      toast.error(t.admin.users.failedToUnban, { description: message })
    } finally {
      setBanningId(null)
    }
  }

  async function deleteUser(user: AdminUser) {
    try {
      setDeletingId(user.id)
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToDelete)
      toast.success(t.admin.users.userDeleted, { description: user.display_name || user.email || undefined })
      // Recarrega em vez de só tirar a linha do array: com paginação, remover
      // um item muda o total e puxa um usuário da página seguinte pra cá.
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToDelete
      toast.error(t.admin.users.failedToDelete, { description: message })
    } finally {
      setDeletingId(null)
    }
  }

  async function createUser() {
    try {
      setCreating(true)
      setCreateError(null)
      setCreateSuccess(false)
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUser.email.trim(),
          display_name: newUser.displayName.trim() || undefined,
          role: newUser.role,
        }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToCreate)
      const createdEmail = newUser.email.trim()
      setNewUser({ email: "", displayName: "", role: "admin" })
      setCreateSuccess(true)
      setShowCreateForm(false)
      toast.success(t.admin.users.inviteSent, { description: createdEmail })
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToCreate
      setCreateError(message)
      toast.error(t.admin.users.failedToCreateUser, { description: message })
    } finally {
      setCreating(false)
    }
  }

  usePageHeader(t.admin.users.pageTitle, t.admin.users.pageDescription)

  return (
    <div className="space-y-6">
      {/* Hero — identidade visual consistente com o dashboard (gradiente sutil) */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.08),transparent_40%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <ShieldCheck className="size-3.5" />
              {t.admin.users.webMasterOnly}
            </p>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground md:text-2xl">{t.admin.users.pageTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.admin.users.pageDescription}</p>
          </div>
          <Button onClick={() => { setShowCreateForm((v) => !v); setCreateError(null) }} className="shrink-0 gap-2">
            <UserPlus className="size-4" />
            {t.admin.users.newUser}
          </Button>
        </div>

        {/* Stats — descrevem a BASE INTEIRA (vêm do banco), não a página
            exibida. Cada chip também é um atalho de filtro. */}
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <StatChip
            icon={UsersIcon}
            value={stats?.total ?? 0}
            label={t.admin.users.statTotal}
            colorClass="bg-primary/15 text-primary"
            active={roleFilter === "all" && statusFilter === "all"}
            hoverClass="hover:border-primary/40 hover:bg-primary/5"
            onClick={() => { setRoleFilter("all"); setStatusFilter("all") }}
          />
          {ADMIN_ROLE_ORDER.map((r) => {
            const meta = ROLE_STAT_META[r]
            return (
              <StatChip
                key={r}
                icon={meta.icon}
                value={stats?.by_role?.[r] ?? 0}
                label={t.admin.users[meta.labelKey]}
                colorClass={meta.colorClass}
                active={roleFilter === r}
                hoverClass={meta.hoverClass}
                onClick={() => setRoleFilter((prev) => (prev === r ? "all" : r))}
              />
            )
          })}
        </div>

        {/* Segunda faixa: recortes que não são cargo. "Sem perfil" é o único
            lugar do painel que enxerga conta autenticável sem linha em
            user_profiles — ela não aparece no /pessoas nem em lugar nenhum. */}
        <div className="relative mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatChip
            icon={UserIcon}
            value={stats?.regular ?? 0}
            label={t.admin.users.statRegular}
            colorClass="bg-slate-500/15 text-slate-300"
            active={roleFilter === "user"}
            hoverClass="hover:border-slate-400/40 hover:bg-slate-500/5"
            onClick={() => setRoleFilter((prev) => (prev === "user" ? "all" : "user"))}
          />
          <StatChip
            icon={Crown}
            value={stats?.vip ?? 0}
            label={t.admin.users.statVip}
            colorClass="bg-amber-500/15 text-amber-300"
            active={statusFilter === "vip"}
            hoverClass="hover:border-amber-400/40 hover:bg-amber-500/5"
            onClick={() => setStatusFilter((prev) => (prev === "vip" ? "all" : "vip"))}
          />
          <StatChip
            icon={ShieldBan}
            value={stats?.banned ?? 0}
            label={t.admin.users.statBanned}
            colorClass="bg-red-500/15 text-red-300"
            active={statusFilter === "banned"}
            hoverClass="hover:border-red-400/40 hover:bg-red-500/5"
            onClick={() => setStatusFilter((prev) => (prev === "banned" ? "all" : "banned"))}
          />
          <StatChip
            icon={UserPlus}
            value={stats?.new_30d ?? 0}
            label={t.admin.users.statNew30d}
            colorClass="bg-emerald-500/15 text-emerald-300"
            active={sort === "recent"}
            hoverClass="hover:border-emerald-400/40 hover:bg-emerald-500/5"
            onClick={() => setSort("recent")}
          />
          <StatChip
            icon={UserX}
            value={stats?.no_profile ?? 0}
            label={t.admin.users.statNoProfile}
            colorClass="bg-orange-500/15 text-orange-300"
            active={statusFilter === "no_profile"}
            hoverClass="hover:border-orange-400/40 hover:bg-orange-500/5"
            onClick={() => setStatusFilter((prev) => (prev === "no_profile" ? "all" : "no_profile"))}
          />
        </div>
      </div>

      {/* Errors */}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {createSuccess && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{t.admin.users.userCreated}</div>}

      {/* Create user form */}
      {showCreateForm && (
        <Card className="animate-in fade-in slide-in-from-top-2 border-border bg-card/90 duration-200">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="size-4 text-primary" />
              {t.admin.users.inviteNewUser}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {createError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{createError}</div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
                <Input
                  value={newUser.email}
                  onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                  placeholder="nome@email.com"
                  type="email"
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.admin.users.displayName}</label>
                <Input
                  value={newUser.displayName}
                  onChange={(e) => setNewUser((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder={t.admin.users.displayNamePlaceholder}
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.admin.users.role}</label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as CreatableRole }))}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADMIN_ROLE_ORDER.filter((r): r is CreatableRole => r !== "webmaster").map((r) => (
                      <SelectItem key={r} value={r}>{adminRoleLabel(t, r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.admin.users.initialPermissions}</p>
              <PermissionGrid permissions={getRolePermissions(newUser.role)} />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>{t.admin.users.cancel}</Button>
              <Button onClick={createUser} disabled={creating || !newUser.email.trim()} className="gap-2">
                <UserPlus className="size-4" />
                {creating ? t.admin.users.sending : t.admin.users.sendInvite}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar — busca, filtros e ordenação. Todos resolvidos no servidor. */}
      <div className="space-y-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.admin.users.searchPlaceholder}
              className="border-border bg-card/50 pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t.admin.users.clearFilters}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
            <SelectTrigger className="w-full border-border bg-card/50 lg:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.all}</SelectItem>
              {ADMIN_ROLE_ORDER.map((r) => (
                <SelectItem key={r} value={r}>{adminRoleLabel(t, r)}</SelectItem>
              ))}
              <SelectItem value="user">{t.admin.users.user}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-full border-border bg-card/50 lg:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.admin.users.filterStatusAll}</SelectItem>
              <SelectItem value="banned">{t.admin.users.filterStatusBanned}</SelectItem>
              <SelectItem value="vip">{t.admin.users.filterStatusVip}</SelectItem>
              <SelectItem value="store_access">{t.admin.users.filterStatusStoreAccess}</SelectItem>
              <SelectItem value="no_profile">{t.admin.users.filterStatusNoProfile}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-full border-border bg-card/50 lg:w-44">
              <SlidersHorizontal className="mr-1 size-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{t.admin.users.sortRecent}</SelectItem>
              <SelectItem value="oldest">{t.admin.users.sortOldest}</SelectItem>
              <SelectItem value="name-asc">{t.admin.users.sortNameAsc}</SelectItem>
              <SelectItem value="name-desc">{t.admin.users.sortNameDesc}</SelectItem>
              <SelectItem value="email-asc">{t.admin.users.sortEmailAsc}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{t.admin.users.searchHint}</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); setSort("recent") }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <X className="size-3" />
              {t.admin.users.clearFilters}
            </button>
          )}
        </div>
      </div>

      {/* Lista — UMA página vinda do servidor. Não há mais separação Staff /
          Membros: com paginação a página é um recorte de um único conjunto
          ordenado, e o filtro de cargo faz esse papel melhor. */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <BoxLoader />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <UserIcon className="size-6 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters ? t.admin.users.noResultsFiltered : t.admin.users.noUsersFound}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); setSort("recent") }}
            >
              {t.admin.users.clearFilters}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <UserListSection
            title={t.admin.users.pageTitle}
            icon={UsersIcon}
            users={users}
            total={total}
            rangeLabel={t.admin.users.showingRange(rangeFrom, rangeTo, total)}
            emptyLabel={t.admin.users.noResultsFiltered}
            currentUserId={currentUserId}
            isCurrentUserWebMaster={isCurrentUserWebMaster}
            savingId={savingId}
            deletingId={deletingId}
            vipSavingId={vipSavingId}
            storeAccessSavingId={storeAccessSavingId}
            banningId={banningId}
            onRoleChange={updateUserRole}
            onSave={saveUser}
            onDelete={deleteUser}
            onVipToggle={toggleVip}
            onStoreAccessToggle={toggleStoreAccess}
            onBan={banUser}
            onUnban={unbanUser}
          />

          {/* Paginação */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 sm:flex-row">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{t.admin.users.showingRange(rangeFrom, rangeTo, total)}</span>
              <span className="hidden sm:inline">·</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-[4.5rem] border-border bg-background text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="hidden sm:inline">{t.admin.users.perPage}</span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="size-8 p-0"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                aria-label={t.admin.users.prevPage}
              >
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
                <span className="hidden sm:inline">{t.admin.users.prevPage}</span>
              </Button>

              <span className="px-2 text-xs tabular-nums text-muted-foreground">
                {t.admin.users.pageOf(page, totalPages)}
              </span>

              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <span className="hidden sm:inline">{t.admin.users.nextPage}</span>
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="size-8 p-0"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                aria-label={t.admin.users.nextPage}
              >
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
