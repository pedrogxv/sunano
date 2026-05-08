"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { LogIn, LogOut, MoreVertical, Settings } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/lib/locale-context"
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
}

export function AuthUser({ isCollapsed = false }: AuthUserProps) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const [user, setUser] = useState<UserState | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Use onAuthStateChange only — avoids the storage lock that getUser() causes
    // when called simultaneously from multiple components.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("display_name, avatar_url, email")
          .eq("id", session.user.id)
          .maybeSingle()

        setUser({
          name: profile?.display_name || session.user.email?.split("@")[0] || "User",
          email: profile?.email || session.user.email || "",
          avatar: profile?.avatar_url || "",
        })
      } else {
        setUser(null)
      }
      setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!ready) return null

  if (!user) {
    return (
      <Link
        href="/admin/login"
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

        <DropdownMenuItem asChild>
          <Link
            href="/admin/settings"
            className="flex cursor-pointer items-center gap-2 focus:bg-muted/40 focus:text-foreground"
          >
            <Settings className="size-4 text-muted-foreground" />
            {isEnglish ? "Settings" : "Configurações"}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border" />

        <DropdownMenuItem
          className="cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-300"
          onSelect={async () => {
            await supabase.auth.signOut()
            window.location.href = "/admin/login"
          }}
        >
          <LogOut className="size-4" />
          {isEnglish ? "Sign out" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
