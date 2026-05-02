"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, Users as UsersIcon } from "lucide-react"

import { ADMIN_FEATURES, createDefaultPermissions, normalizePermissions, type AdminProfile } from "@/lib/admin-permissions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

export default function AdminUsersPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: "",
    displayName: "",
    role: "admin",
    permissions: normalizePermissions(createDefaultPermissions()),
  })

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/admin/users")
      const data = (await response.json().catch(() => null)) as UsersResponse | null

      if (!response.ok || !data?.users) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to load users" : "Erro ao carregar usuários"))
      }

      setCurrentUserId(data.current_user_id ?? null)
      setUsers(
        data.users.map((user) => ({
          ...user,
          permissions: normalizePermissions(user.permissions),
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load users" : "Erro ao carregar usuários"))
    } finally {
      setLoading(false)
    }
  }

  function updateUserRole(userId: string, nextRole: "admin" | "moderator" | "webmaster") {
    setUsers((currentUsers) =>
      currentUsers.map((user) => (user.id === userId ? { ...user, role: nextRole } : user))
    )
  }

  function updateUserPermission(userId: string, permissionKey: string, value: boolean) {
    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              permissions: {
                ...normalizePermissions(user.permissions),
                [permissionKey]: value,
              },
            }
          : user
      )
    )
  }

  async function saveUser(user: AdminUser) {
    try {
      setSavingId(user.id)
      setError(null)

      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          role: user.role,
          permissions: normalizePermissions(user.permissions),
        }),
      })

      const data = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to save user" : "Erro ao salvar usuário"))
      }

      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to save user" : "Erro ao salvar usuário"))
    } finally {
      setSavingId(null)
    }
  }

  function updateNewUserPermission(permissionKey: string, value: boolean) {
    setNewUser((current) => ({
      ...current,
      permissions: {
        ...normalizePermissions(current.permissions),
        [permissionKey]: value,
      },
    }))
  }

  async function createUser() {
    try {
      setCreating(true)
      setCreateError(null)

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUser.email.trim(),
          display_name: newUser.displayName.trim() || undefined,
          role: newUser.role,
          permissions: normalizePermissions(newUser.permissions),
        }),
      })

      const data = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to create user" : "Erro ao criar usuário"))
      }

      setNewUser({
        email: "",
        displayName: "",
        role: "admin",
        permissions: normalizePermissions(createDefaultPermissions()),
      })
      await loadUsers()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : (isEnglish ? "Failed to create user" : "Erro ao criar usuário"))
    } finally {
      setCreating(false)
    }
  }

  const visibleFeatures = ADMIN_FEATURES.filter((feature) => feature.key !== "dashboard")

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <div className="relative p-6 md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.08),transparent_28%)]" />
          <div className="relative max-w-3xl space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <ShieldCheck className="size-3.5" />
              {isEnglish ? "WEB Master only" : "Apenas WEB Master"}
            </p>
            <div className="space-y-2">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {isEnglish ? "Users and permissions" : "Usuários e permissões"}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {isEnglish
                  ? "Set who can view and edit each part of the site. WEB Master permissions are locked in the backend and cannot be changed."
                  : "Ajuste quem pode ver e editar cada parte do site. As permissões do WEB Master ficam bloqueadas no backend e não podem ser alteradas."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      ) : null}

      {createError ? (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{createError}</div>
      ) : null}

      {loading ? (
        <div className="text-sm text-muted-foreground">{isEnglish ? "Loading users..." : "Carregando usuários..."}</div>
      ) : null}

      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-foreground">{isEnglish ? "Create new user" : "Criar novo usuário"}</CardTitle>
          <CardDescription>
            {isEnglish
              ? "Invite a new admin or moderator and set initial permissions."
              : "Convide um novo admin ou moderador e defina as permissões iniciais."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {isEnglish ? "Email" : "Email"}
              </label>
              <input
                value={newUser.email}
                onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
                placeholder="nome@email.com"
                className="h-10 w-full rounded-lg border border-border bg-card/50 px-3 text-sm text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {isEnglish ? "Display name" : "Nome"}
              </label>
              <input
                value={newUser.displayName}
                onChange={(event) => setNewUser((current) => ({ ...current, displayName: event.target.value }))}
                placeholder={isEnglish ? "Ex: Ana Souza" : "Ex: Ana Souza"}
                className="h-10 w-full rounded-lg border border-border bg-card/50 px-3 text-sm text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {isEnglish ? "Role" : "Cargo"}
              </label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser((current) => ({ ...current, role: value as "admin" | "moderator" }))}
              >
                <SelectTrigger className="border-border bg-card/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="moderator">{isEnglish ? "Moderator" : "Moderador"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleFeatures.map((feature) => (
              <div key={`new-user-${feature.key}`} className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">{feature.label}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <input
                      checked={Boolean(normalizePermissions(newUser.permissions)[feature.readKey])}
                      onChange={(event) => updateNewUserPermission(feature.readKey, event.target.checked)}
                      type="checkbox"
                    />
                    {isEnglish ? "Read" : "Ler"}
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <input
                      checked={Boolean(normalizePermissions(newUser.permissions)[feature.writeKey])}
                      onChange={(event) => updateNewUserPermission(feature.writeKey, event.target.checked)}
                      type="checkbox"
                    />
                    {isEnglish ? "Edit" : "Editar"}
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={createUser} disabled={creating || !newUser.email.trim()}>
              {creating ? (isEnglish ? "Creating..." : "Criando...") : (isEnglish ? "Send invite" : "Enviar convite")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <UsersIcon className="size-5 text-primary" />
            {isEnglish ? "User list" : "Lista de usuários"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {users.map((user) => {
            const isCurrentUser = user.id === currentUserId
            const isWebMaster = user.role === "webmaster"
            const locked = isWebMaster

            return (
              <div key={user.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">{user.display_name}</h3>
                      <Badge variant={isWebMaster ? "default" : "secondary"}>
                        {isWebMaster ? "WEB Master" : user.role === "moderator" ? (isEnglish ? "Moderator" : "Moderador") : "Admin"}
                      </Badge>
                      {isCurrentUser ? (
                        <Badge variant="outline" className="border-primary/30 text-primary">
                          You
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email ?? "Sem email"}</p>
                    {locked ? (
                      <p className="text-xs text-amber-200/80">{isEnglish ? "WEB Master permissions are locked." : "Permissões do WEB Master ficam bloqueadas."}</p>
                    ) : null}
                  </div>

                  <div className="min-w-[180px] space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {isEnglish ? "Role" : "Cargo"}
                    </label>
                    {locked ? (
                      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        WEB Master
                      </div>
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(value) => updateUserRole(user.id, value as "admin" | "moderator" | "webmaster")}
                      >
                        <SelectTrigger className="border-border bg-card/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="moderator">{isEnglish ? "Moderator" : "Moderador"}</SelectItem>
                          <SelectItem value="webmaster">WEB Master</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleFeatures.map((feature) => (
                    <div key={`${user.id}-${feature.key}`} className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-sm font-medium text-foreground">{feature.label}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                          <input
                            checked={Boolean(normalizePermissions(user.permissions)[feature.readKey])}
                            disabled={locked}
                            onChange={(event) => updateUserPermission(user.id, feature.readKey, event.target.checked)}
                            type="checkbox"
                          />
                          {isEnglish ? "Read" : "Ler"}
                        </label>
                        <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                          <input
                            checked={Boolean(normalizePermissions(user.permissions)[feature.writeKey])}
                            disabled={locked}
                            onChange={(event) => updateUserPermission(user.id, feature.writeKey, event.target.checked)}
                            type="checkbox"
                          />
                          {isEnglish ? "Edit" : "Editar"}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <Button onClick={() => saveUser(user)} disabled={savingId === user.id || locked}>
                    {savingId === user.id ? (isEnglish ? "Saving..." : "Salvando...") : locked ? (isEnglish ? "Locked" : "Bloqueado") : (isEnglish ? "Save permissions" : "Salvar permissões")}
                  </Button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}