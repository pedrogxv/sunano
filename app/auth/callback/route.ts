import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/forum"

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_error`)
  }

  const { data: authData } = await supabase.auth.getUser()
  if (authData.user) {
    // Upsert user profile from OAuth metadata
    await (supabase.from("user_profiles") as any).upsert({
      id: authData.user.id,
      display_name: authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || authData.user.email?.split("@")[0] || "User",
      avatar_url: authData.user.user_metadata?.avatar_url || authData.user.user_metadata?.picture || null,
    }, { onConflict: "id", ignoreDuplicates: true })

    // Redirect admins to admin panel instead
    if (next === "/forum") {
      const { data: adminProfile } = await supabase
        .from("admin_profiles")
        .select("id")
        .eq("id", authData.user.id)
        .maybeSingle()
      if (adminProfile) {
        return NextResponse.redirect(`${origin}/admin`)
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
