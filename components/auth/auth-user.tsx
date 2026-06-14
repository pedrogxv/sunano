"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { LayoutDashboard, LogIn, LogOut, MoreVertical, Settings, User } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supabaseAuth } from "@/lib/client/supabase-auth"
import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

type UserState = {
  name: string
  email: string
  avatar: string
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

interface AuthUserProps {
  isCollapsed?: boolean
  /** Para onde mandar ao logar/deslogar. Sidebar pública usa "/login"; admin, "/admin/login". */
  loginHref?: string
  /** "public" mostra "Meu perfil" (/perfil); "admin" mostra "Configurações" (/admin/settings). */
  variant?: "public" | "admin"
}

export function AuthUser({ isCollapsed = false, loginHref = "/admin/login", variant = "admin" }: AuthUserProps) {
  const t = useT()
  const [user, setUser] = useState<UserState | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // A sessão (login/logout) é observada pelo cliente de autenticação; os
    // dados do perfil vêm do endpoint /api/auth/me — nunca de uma query direta
    // ao Supabase a partir do navegador.
    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // Sessão aal1 com 2FA pendente: o usuário ainda não se autenticou
        // completamente — tratar como anônimo até concluir o segundo fator.
        const { data: aal } = await supabaseAuth.auth.mfa.getAuthenticatorAssuranceLevel()
        if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
          setUser(null)
          setIsAdmin(false)
          setReady(true)
          return
        }

        const fallbackName = session.user.email?.split("@")[0] || "User"
        try {
          const res = await fetch("/api/auth/me")
          const data = await res.json()
          const adminProfile = data?.adminProfile
          const userProfile = data?.userProfile
          setIsAdmin(Boolean(adminProfile))
          setUser({
            name: adminProfile?.display_name || userProfile?.display_name || fallbackName,
            email: adminProfile?.email || session.user.email || "",
            avatar: adminProfile?.avatar_url || userProfile?.avatar_url || "",
          })
        } catch {
          setUser({ name: fallbackName, email: session.user.email || "", avatar: "" })
        }
      } else {
        setUser(null)
        setIsAdmin(false)
      }
      setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <div
        className={cn(
          "flex items-center rounded-lg px-3 py-2.5",
          isCollapsed ? "justify-center px-0" : "gap-3"
        )}
      >
        <div className="size-8 shrink-0 rounded-lg bg-muted/40 animate-pulse" />
        {!isCollapsed && (
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-20 rounded bg-muted/40 animate-pulse" />
            <div className="h-2.5 w-28 rounded bg-muted/40 animate-pulse" />
          </div>
        )}
      </div>
    )
  }

  if (!user) {
    return (
      <Link
        href={loginHref}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground",
          isCollapsed && "justify-center px-0"
        )}
      >
        <LogIn className="size-[18px] shrink-0" />
        <span className={cn(isCollapsed && "hidden")}>Login</span>
      </Link>
    )
  }

  const initials = getInitials(user.name)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center rounded-lg px-3 py-2.5 transition-all hover:bg-muted/40",
            isCollapsed ? "justify-center px-0" : "gap-3"
          )}
        >
          <Avatar className="size-8 shrink-0 rounded-lg">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <>
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <MoreVertical className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-56 border-border bg-popover text-foreground shadow-xl"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2.5 px-2 py-2.5">
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-border" />

        {variant === "public" ? (
          <>
            <DropdownMenuItem asChild>
              <Link
                href="/perfil"
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <User className="size-4 text-muted-foreground" />
                {t.auth.myProfile}
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link
                  href="/admin"
                  className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
                >
                  <LayoutDashboard className="size-4 text-muted-foreground" />
                  {t.auth.adminPanel}
                </Link>
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link
                href="/perfil"
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <User className="size-4 text-muted-foreground" />
                {t.auth.myProfile}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/admin/settings"
                className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
              >
                <Settings className="size-4 text-muted-foreground" />
                {t.auth.settings}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator className="bg-border" />

        <DropdownMenuItem
          className="cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-300"
          onSelect={async () => {
            await supabaseAuth.auth.signOut()
            window.location.href = loginHref
          }}
        >
          <LogOut className="size-4" />
          {t.auth.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
