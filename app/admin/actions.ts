"use server"

import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
