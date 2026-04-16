import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { updateSession } from "@/lib/supabase-middleware"

function copyCookies(source: NextResponse, destination: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    destination.cookies.set(cookie.name, cookie.value, cookie)
  })
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next()
  }

  const { response, user } = await updateSession(request)
  const isLoginRoute = pathname === "/admin/login"

  if (!user && !isLoginRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/admin/login"

    const redirectResponse = NextResponse.redirect(loginUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  if (user && isLoginRoute) {
    const adminUrl = request.nextUrl.clone()
    adminUrl.pathname = "/admin"

    const redirectResponse = NextResponse.redirect(adminUrl)
    copyCookies(response, redirectResponse)
    return redirectResponse
  }

  return response
}

export const config = {
  matcher: ["/admin/:path*"],
}