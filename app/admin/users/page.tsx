"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, Users as UsersIcon, UserPlus, Lock, Save, ChevronDown, ChevronUp, KeyRound } from "lucide-react"
import { toast } from "sonner"

import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { ADMIN_FEATURES, createDefaultPermissions, normalizePermissions, type AdminProfile } from "@/lib/admin-permissions"
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
import { useT } from "@/lib/use-t"

type UserRole = AdminProfile["role"] | "user"

type AdminUser = Omit<AdminProfile, "role"> & {
  role: UserRole
  /** Cargo persistido no servidor (não muda com a edição local do select). */
  originalRole: UserRole
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

/* ── Role badge ──────────────────────────────────────────── */
function RoleBadge({ role }: { role: string }) {
  const t = useT()
  if (role === "webmaster") return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/20">WEB Master</Badge>
  if (role === "admin") return <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">Admin</Badge>
  if (role === "moderator") return <Badge variant="secondary">{t.admin.users.moderator}</Badge>
  return <Badge variant="outline" className="border-border text-muted-foreground">{t.admin.users.user}</Badge>
}

/* ── User card ───────────────────────────────────────────── */
function UserCard({
  user,
  isCurrentUser,
  isCurrentUserWebMaster,
  savingId,
  onRoleChange,
  onPermissionChange,
  onSave,
}: {
  user: AdminUser
  isCurrentUser: boolean
  isCurrentUserWebMaster: boolean
  savingId: string | null
  onRoleChange: (id: string, role: UserRole) => void
  onPermissionChange: (id: string, key: string, value: boolean) => void
  onSave: (user: AdminUser) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
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
  const initials = (user.display_name ?? user.email ?? "?").slice(0, 2).toUpperCase()

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

  return (
    <div className={`rounded-2xl border transition-colors ${expanded ? "border-border bg-card/80" : "border-border/60 bg-card/40"}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        {/* Avatar */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-bold text-muted-foreground">
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

/* ── Main page ───────────────────────────────────────────── */
export default function AdminUsersPage() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
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

  function updateUserRole(userId: string, nextRole: UserRole) {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: nextRole } : u))
  }

  function updateUserPermission(userId: string, key: string, value: boolean) {
    setUsers((prev) => prev.map((u) =>
      u.id === userId ? { ...u, permissions: { ...normalizePermissions(u.permissions), [key]: value } } : u
    ))
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
      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
          <ShieldCheck className="size-3.5" />
          {t.admin.users.webMasterOnly}
        </p>
        <Button onClick={() => { setShowCreateForm((v) => !v); setCreateError(null) }} className="shrink-0 gap-2">
          <UserPlus className="size-4" />
          {t.admin.users.newUser}
        </Button>
      </div>

      {/* Errors */}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {createSuccess && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{t.admin.users.userCreated}</div>}

      {/* Create user form */}
      {showCreateForm && (
        <Card className="border-border bg-card/90">
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

      {/* Users list */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-4 text-primary" />
            {t.common.users}
            {!loading && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{users.length}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <BoxLoader />
            </div>
          ) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t.admin.users.noUsersFound}</p>
          ) : users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              isCurrentUser={user.id === currentUserId}
              isCurrentUserWebMaster={isCurrentUserWebMaster}
              savingId={savingId}
              onRoleChange={updateUserRole}
              onPermissionChange={updateUserPermission}
              onSave={saveUser}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
