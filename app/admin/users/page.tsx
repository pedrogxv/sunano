"use client"

import { useEffect, useMemo, useState } from "react"
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
  UserCog,
  User as UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AnimatedCounter } from "@/components/animated-counter"
import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { ACCOUNT_TIERS, getTierCapabilities, type AccountTier } from "@/lib/account-tier"
import { ADMIN_FEATURES, createDefaultPermissions, normalizePermissions, type AdminProfile } from "@/lib/admin-permissions"
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
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RoleBadge } from "@/components/people/RoleBadge"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/use-t"

type UserRole = AdminProfile["role"] | "user"

type AdminUser = Omit<AdminProfile, "role"> & {
  role: UserRole
  /** Cargo persistido no servidor (não muda com a edição local do select). */
  originalRole: UserRole
  account_tier: AccountTier
  display_slug: string | null
  created_at: string
  updated_at: string
}

type UsersResponse = {
  ok?: boolean
  error?: string
  current_user_id?: string
  users?: AdminUser[]
}

type NewUserForm = {
  email: string
  displayName: string
  role: "admin" | "moderator"
  permissions: Record<string, boolean>
}

type RoleFilter = "all" | UserRole

const ROLE_RING: Record<UserRole, string> = {
  webmaster: "ring-2 ring-amber-400/40",
  admin: "ring-2 ring-cyan-400/30",
  moderator: "ring-2 ring-violet-400/30",
  user: "ring-1 ring-border",
}

/* ── Toggle switch component ─────────────────────────────── */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  )
}

/* ── Permission grid for a user ─────────────────────────── */
function PermissionGrid({
  permissions,
  locked,
  onChange,
}: {
  permissions: Record<string, boolean>
  locked: boolean
  onChange: (key: string, value: boolean) => void
}) {
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
                <Toggle
                  checked={canRead}
                  disabled={locked}
                  onChange={(v) => onChange(feature.readKey, v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{t.admin.users.edit}</span>
                <Toggle
                  checked={canWrite}
                  disabled={locked}
                  onChange={(v) => onChange(feature.writeKey, v)}
                />
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
    <Badge className={tier === "vip_plus" ? "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30 hover:bg-fuchsia-500/20" : "bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"}>
      <Crown className="mr-1 size-3" />
      {label}
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
  onRoleChange,
  onPermissionChange,
  onSave,
  onTierSave,
  onDelete,
}: {
  user: AdminUser
  isCurrentUser: boolean
  isCurrentUserWebMaster: boolean
  savingId: string | null
  deletingId: string | null
  onRoleChange: (id: string, role: UserRole) => void
  onPermissionChange: (id: string, key: string, value: boolean) => void
  onSave: (user: AdminUser) => void
  onTierSave: (userId: string, tier: AccountTier) => Promise<void>
  onDelete: (user: AdminUser) => Promise<void>
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingTier, setSavingTier] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  // A trava usa o cargo PERSISTIDO (não o que está sendo editado no select),
  // senão escolher "WEB Master" travaria a própria linha antes de salvar.
  const isPersistedWebMaster = user.originalRole === "webmaster"
  const isRegularUser = user.role === "user"
  const locked = isPersistedWebMaster
  // Permissões só fazem sentido para admin/moderador.
  const gridLocked = locked || user.role === "user" || user.role === "webmaster"
  // Promoção a WEB Master (a partir de um cargo menor) exige confirmação.
  const isPromotingToWebmaster = user.role === "webmaster" && user.originalRole !== "webmaster"
  const canChangeThisPassword = isCurrentUserWebMaster && (!isPersistedWebMaster || isCurrentUser)
  // Excluir é exclusivo do WEB Master, nunca a própria conta nem outro WEB Master.
  const canDeleteThisUser = isCurrentUserWebMaster && !isCurrentUser && !isPersistedWebMaster
  const initials = (user.display_name ?? user.email ?? "?").slice(0, 2).toUpperCase()
  const isDeleting = deletingId === user.id
  const deleteConfirmMatches =
    !!user.email && deleteConfirmText.trim().toLowerCase() === user.email.trim().toLowerCase()

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

  async function handleTierChange(nextTier: AccountTier) {
    try {
      setSavingTier(true)
      await onTierSave(user.id, nextTier)
    } finally {
      setSavingTier(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirmMatches) return
    await onDelete(user)
    setDeleteDialogOpen(false)
    setDeleteConfirmText("")
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
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground", ROLE_RING[user.role])}>
          {user.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={user.avatar_url} alt={initials} className="size-full rounded-full object-cover" />
            : initials}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{user.display_name || user.email}</p>
            <RoleBadge role={user.role} />
            <TierBadge tier={user.account_tier} />
            <SpecialTagBadge slug={user.display_slug} />
            {isCurrentUser && <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">Você</Badge>}
          </div>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
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
                  <SelectItem value="user">{t.admin.users.user}</SelectItem>
                  <SelectItem value="moderator">{t.admin.users.moderator}</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isCurrentUserWebMaster && <SelectItem value="webmaster">WEB Master</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tier de conta (VIP) — independente de cargo/permissões. */}
          <div className="flex items-center gap-3">
            <label className="min-w-16 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.admin.users.tier}
            </label>
            <Select
              value={user.account_tier}
              onValueChange={(v) => handleTierChange(v as AccountTier)}
              disabled={savingTier}
            >
              <SelectTrigger className="w-44 border-border bg-card/50 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TIERS.map((tierOption) => (
                  <SelectItem key={tierOption} value={tierOption}>
                    {getTierCapabilities(tierOption).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {savingTier && <span className="text-xs text-muted-foreground">{t.admin.users.saving}</span>}
          </div>

          {isRegularUser && (
            <p className="text-xs text-muted-foreground">
              {t.admin.users.regularUserNote}
            </p>
          )}

          {locked && !isCurrentUser && (
            <p className="text-xs text-amber-400/80">
              {t.admin.users.webMasterProtected}
            </p>
          )}

          <PermissionGrid
            permissions={normalizePermissions(user.permissions)}
            locked={gridLocked}
            onChange={(key, value) => onPermissionChange(user.id, key, value)}
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
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const isCurrentUserWebMaster = users.find((u) => u.id === currentUserId)?.role === "webmaster"
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: "",
    displayName: "",
    role: "admin",
    permissions: normalizePermissions(createDefaultPermissions()),
  })

  useEffect(() => { loadUsers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUsers() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/admin/users")
      const data = await res.json().catch(() => null) as UsersResponse | null
      if (!res.ok || !data?.users) throw new Error(data?.error ?? t.admin.users.failedToLoad)
      setCurrentUserId(data.current_user_id ?? null)
      setUsers(data.users.map((u) => ({ ...u, permissions: normalizePermissions(u.permissions), originalRole: u.role })))
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToLoad
      setError(message)
      toast.error(t.admin.users.failedToLoad, { description: message })
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => ({
    total: users.length,
    webmasters: users.filter((u) => u.role === "webmaster").length,
    admins: users.filter((u) => u.role === "admin").length,
    moderators: users.filter((u) => u.role === "moderator").length,
    regular: users.filter((u) => u.role === "user").length,
  }), [users])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false
      if (!q) return true
      return (u.display_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)
    })
  }, [users, search, roleFilter])

  function updateUserRole(userId: string, nextRole: UserRole) {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: nextRole } : u))
  }

  function updateUserPermission(userId: string, key: string, value: boolean) {
    setUsers((prev) => prev.map((u) =>
      u.id === userId ? { ...u, permissions: { ...normalizePermissions(u.permissions), [key]: value } } : u
    ))
  }

  async function saveTier(userId: string, tier: AccountTier) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, account_tier: tier }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToSave)
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, account_tier: tier } : u))
      toast.success(t.admin.users.tierUpdated, { description: getTierCapabilities(tier).label })
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.users.failedToSave
      toast.error(t.admin.users.failedToSaveUser, { description: message })
    }
  }

  async function saveUser(user: AdminUser) {
    try {
      setSavingId(user.id)
      setError(null)
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, role: user.role, permissions: normalizePermissions(user.permissions) }),
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

  async function deleteUser(user: AdminUser) {
    try {
      setDeletingId(user.id)
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToDelete)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      toast.success(t.admin.users.userDeleted, { description: user.display_name || user.email || undefined })
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
          permissions: normalizePermissions(newUser.permissions),
        }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t.admin.users.failedToCreate)
      const createdEmail = newUser.email.trim()
      setNewUser({ email: "", displayName: "", role: "admin", permissions: normalizePermissions(createDefaultPermissions()) })
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

        {/* Stats — visão rápida da composição do time */}
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip
            icon={UsersIcon}
            value={stats.total}
            label={t.admin.users.statTotal}
            colorClass="bg-primary/15 text-primary"
            active={roleFilter === "all"}
            hoverClass="hover:border-primary/40 hover:bg-primary/5"
            onClick={() => setRoleFilter("all")}
          />
          <StatChip
            icon={Crown}
            value={stats.webmasters}
            label={t.admin.users.statWebMasters}
            colorClass="bg-amber-500/15 text-amber-300"
            active={roleFilter === "webmaster"}
            hoverClass="hover:border-amber-400/40 hover:bg-amber-500/5"
            onClick={() => setRoleFilter((prev) => (prev === "webmaster" ? "all" : "webmaster"))}
          />
          <StatChip
            icon={ShieldCheck}
            value={stats.admins}
            label={t.admin.users.statAdmins}
            colorClass="bg-cyan-500/15 text-cyan-300"
            active={roleFilter === "admin"}
            hoverClass="hover:border-cyan-400/40 hover:bg-cyan-500/5"
            onClick={() => setRoleFilter((prev) => (prev === "admin" ? "all" : "admin"))}
          />
          <StatChip
            icon={UserCog}
            value={stats.moderators}
            label={t.admin.users.statModerators}
            colorClass="bg-violet-500/15 text-violet-300"
            active={roleFilter === "moderator"}
            hoverClass="hover:border-violet-400/40 hover:bg-violet-500/5"
            onClick={() => setRoleFilter((prev) => (prev === "moderator" ? "all" : "moderator"))}
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
                <Select value={newUser.role} onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as "admin" | "moderator" }))}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="moderator">{t.admin.users.moderator}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.admin.users.initialPermissions}</p>
              <PermissionGrid
                permissions={newUser.permissions}
                locked={false}
                onChange={(key, value) => setNewUser((p) => ({ ...p, permissions: { ...p.permissions, [key]: value } }))}
              />
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

      {/* Toolbar — busca + filtro por cargo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.users.searchPlaceholder}
            className="border-border bg-card/50 pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <SelectTrigger className="w-full border-border bg-card/50 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.common.all}</SelectItem>
            <SelectItem value="webmaster">WEB Master</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="moderator">{t.admin.users.moderator}</SelectItem>
            <SelectItem value="user">{t.admin.users.user}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users list */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-4 text-primary" />
            {t.common.users}
            {!loading && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{filteredUsers.length}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <BoxLoader />
            </div>
          ) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t.admin.users.noUsersFound}</p>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <UserIcon className="size-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t.admin.users.noResultsFiltered}</p>
            </div>
          ) : filteredUsers.map((user, index) => (
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
                onRoleChange={updateUserRole}
                onPermissionChange={updateUserPermission}
                onSave={saveUser}
                onTierSave={saveTier}
                onDelete={deleteUser}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
