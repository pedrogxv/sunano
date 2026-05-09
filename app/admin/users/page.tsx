"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, Users as UsersIcon, UserPlus, Lock, Save, ChevronDown, ChevronUp } from "lucide-react"

import BoxLoader from "@/components/ui/box-loader"
import { ADMIN_FEATURES, createDefaultPermissions, normalizePermissions, type AdminProfile } from "@/lib/admin-permissions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLocale } from "@/lib/locale-context"

type AdminUser = AdminProfile & {
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
  isEnglish,
}: {
  permissions: Record<string, boolean>
  locked: boolean
  onChange: (key: string, value: boolean) => void
  isEnglish: boolean
}) {
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
                <span className="text-[11px] text-muted-foreground">{isEnglish ? "Read" : "Leitura"}</span>
                <Toggle
                  checked={canRead}
                  disabled={locked}
                  onChange={(v) => onChange(feature.readKey, v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{isEnglish ? "Edit" : "Edição"}</span>
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
  if (role === "webmaster") return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/20">WEB Master</Badge>
  if (role === "admin") return <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">Admin</Badge>
  return <Badge variant="secondary">Moderador</Badge>
}

/* ── User card ───────────────────────────────────────────── */
function UserCard({
  user,
  isCurrentUser,
  isEnglish,
  savingId,
  onRoleChange,
  onPermissionChange,
  onSave,
}: {
  user: AdminUser
  isCurrentUser: boolean
  isEnglish: boolean
  savingId: string | null
  onRoleChange: (id: string, role: "admin" | "moderator" | "webmaster") => void
  onPermissionChange: (id: string, key: string, value: boolean) => void
  onSave: (user: AdminUser) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isWebMaster = user.role === "webmaster"
  const locked = isWebMaster
  const initials = (user.display_name ?? user.email ?? "?").slice(0, 2).toUpperCase()

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
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSave(user)}
              disabled={savingId === user.id}
              className="gap-1.5 text-xs"
            >
              <Save className="size-3.5" />
              {savingId === user.id ? (isEnglish ? "Saving..." : "Salvando...") : (isEnglish ? "Save" : "Salvar")}
            </Button>
          )}
          {locked && (
            <div className="flex items-center gap-1 text-xs text-amber-400/80">
              <Lock className="size-3.5" />
              <span className="hidden sm:inline">{isEnglish ? "Locked" : "Bloqueado"}</span>
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
              <label className="min-w-16 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "Role" : "Cargo"}</label>
              <Select value={user.role} onValueChange={(v) => onRoleChange(user.id, v as "admin" | "moderator" | "webmaster")}>
                <SelectTrigger className="w-44 border-border bg-card/50 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="moderator">{isEnglish ? "Moderator" : "Moderador"}</SelectItem>
                  <SelectItem value="webmaster">WEB Master</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {locked && (
            <p className="text-xs text-amber-400/80">
              {isEnglish
                ? "WEB Master permissions are protected and cannot be changed from the panel."
                : "As permissões do WEB Master são protegidas e não podem ser alteradas pelo painel."}
            </p>
          )}

          <PermissionGrid
            permissions={normalizePermissions(user.permissions)}
            locked={locked}
            isEnglish={isEnglish}
            onChange={(key, value) => onPermissionChange(user.id, key, value)}
          />
        </div>
      )}
    </div>
  )
}

/* ── Main page ───────────────────────────────────────────── */
export default function AdminUsersPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
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
      if (!res.ok || !data?.users) throw new Error(data?.error ?? (isEnglish ? "Failed to load users" : "Erro ao carregar usuários"))
      setCurrentUserId(data.current_user_id ?? null)
      setUsers(data.users.map((u) => ({ ...u, permissions: normalizePermissions(u.permissions) })))
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load users" : "Erro ao carregar usuários"))
    } finally {
      setLoading(false)
    }
  }

  function updateUserRole(userId: string, nextRole: "admin" | "moderator" | "webmaster") {
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
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? (isEnglish ? "Failed to save" : "Erro ao salvar"))
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to save" : "Erro ao salvar"))
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
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? (isEnglish ? "Failed to create" : "Erro ao criar"))
      setNewUser({ email: "", displayName: "", role: "admin", permissions: normalizePermissions(createDefaultPermissions()) })
      setCreateSuccess(true)
      setShowCreateForm(false)
      await loadUsers()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : (isEnglish ? "Failed to create" : "Erro ao criar"))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_40%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                <ShieldCheck className="size-3.5" />
                {isEnglish ? "WEB Master only" : "Apenas WEB Master"}
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {isEnglish ? "Users & permissions" : "Usuários e permissões"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEnglish
                  ? "Control who can read or edit each section. WEB Master is always protected."
                  : "Controle quem pode ler ou editar cada seção. WEB Master é sempre protegido."}
              </p>
            </div>
            <Button onClick={() => { setShowCreateForm((v) => !v); setCreateError(null) }} className="shrink-0 gap-2">
              <UserPlus className="size-4" />
              {isEnglish ? "New user" : "Novo usuário"}
            </Button>
          </div>
        </div>
      </section>

      {/* Errors */}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {createSuccess && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{isEnglish ? "User created and invite sent." : "Usuário criado e convite enviado."}</div>}

      {/* Create user form */}
      {showCreateForm && (
        <Card className="border-border bg-card/90">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="size-4 text-primary" />
              {isEnglish ? "Invite new user" : "Convidar novo usuário"}
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "Display name" : "Nome"}</label>
                <Input
                  value={newUser.displayName}
                  onChange={(e) => setNewUser((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder={isEnglish ? "e.g. Ana Souza" : "ex: Ana Souza"}
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "Role" : "Cargo"}</label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as "admin" | "moderator" }))}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="moderator">{isEnglish ? "Moderator" : "Moderador"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "Initial permissions" : "Permissões iniciais"}</p>
              <PermissionGrid
                permissions={newUser.permissions}
                locked={false}
                isEnglish={isEnglish}
                onChange={(key, value) => setNewUser((p) => ({ ...p, permissions: { ...p.permissions, [key]: value } }))}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>{isEnglish ? "Cancel" : "Cancelar"}</Button>
              <Button onClick={createUser} disabled={creating || !newUser.email.trim()} className="gap-2">
                <UserPlus className="size-4" />
                {creating ? (isEnglish ? "Sending..." : "Enviando...") : (isEnglish ? "Send invite" : "Enviar convite")}
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
            {isEnglish ? "Users" : "Usuários"}
            {!loading && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{users.length}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <BoxLoader />
            </div>
          ) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{isEnglish ? "No users found." : "Nenhum usuário encontrado."}</p>
          ) : users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              isCurrentUser={user.id === currentUserId}
              isEnglish={isEnglish}
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
