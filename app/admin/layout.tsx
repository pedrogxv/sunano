"use client"

import { usePathname } from "next/navigation"

import { AdminShell } from "@/components/layout/AdminShell"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    pathname === "/admin/login" ? (
      <div className="min-h-screen bg-background text-foreground ">{children}</div>
    ) : (
      <AdminShell>{children}</AdminShell>
    )
  )
}
