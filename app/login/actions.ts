"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"

type AuthState = { error: string | null }

export async function loginUserAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  if (!email || !password) {
    return { error: "missing_credentials" }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: "invalid_credentials" }
  }

  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return { error: "invalid_credentials" }
  }

  // Upsert user profile for email/password login
  await (supabase.from("user_profiles") as any).upsert({
    id: authData.user.id,
    display_name: authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "User",
    avatar_url: authData.user.user_metadata?.avatar_url || null,
  }, { onConflict: "id", ignoreDuplicates: true })

  // Redirect admins to admin panel, everyone else to forum
  const { data: adminProfile } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", authData.user.id)
    .maybeSingle()

  if (adminProfile) {
    redirect("/admin")
  }

  redirect("/forum")
}

export async function logoutUserAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
