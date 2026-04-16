"use client"

import { usePathname } from "next/navigation"

import { AdminShell } from "@/components/layout/AdminShell"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    pathname === "/admin/login" ? (
      <div className="min-h-screen bg-[#0a0d14] text-slate-100 pt-16">{children}</div>
    ) : (
      <AdminShell>{children}</AdminShell>
    )
  )
}
