"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

// Code-split: o AuthUser puxa o cliente Supabase (@supabase/ssr), pesado e
// desnecessário para a primeira pintura. Carregá-lo sob demanda tira esse
// peso do bundle crítico de TODAS as páginas públicas. O placeholder abaixo
// é idêntico ao esqueleto que o próprio AuthUser exibe enquanto checa a sessão,
// então não há mudança visual nem layout shift.
export const AuthUser = dynamic(
  () => import("@/components/auth/auth-user").then((m) => m.AuthUser),
  {
    ssr: false,
    loading: () => <Skeleton className="size-8 shrink-0 rounded-lg md:size-8" />,
  }
)

// Mesmo motivo do AuthUser: o sino só interessa a quem está logado e puxa
// date-fns + popover. Fora do bundle crítico das páginas públicas. Ele já
// se esconde sozinho quando não há sessão, então o placeholder é vazio.
export const NotificationBell = dynamic(
  () => import("@/components/notifications/notification-bell").then((m) => m.NotificationBell),
  { ssr: false }
)
