import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase"

type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds?: number
}

type RateLimitParams = {
  supabase: SupabaseClient<Database>
  action: string
  identifier: string
  maxAttempts: number
  windowSeconds: number
}

export function getClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  const realIp = request.headers.get("x-real-ip")
  const userAgent = request.headers.get("user-agent")
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown"
  const salt = process.env.RATE_LIMIT_SALT || "sunano-rate-limit"

  return createHash("sha256").update(`${salt}:${ip}:${userAgent || "unknown"}`).digest("hex")
}

export async function checkRateLimit({
  supabase,
  action,
  identifier,
  maxAttempts,
  windowSeconds,
}: RateLimitParams): Promise<RateLimitResult> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()

  const { count, error } = await supabase
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("action", action)
    .eq("identifier", identifier)
    .gte("created_at", since)

  if (error) {
    return { allowed: true }
  }

  if ((count ?? 0) >= maxAttempts) {
    return { allowed: false, retryAfterSeconds: windowSeconds }
  }

  await (supabase.from("rate_limit_events").insert({ action, identifier } as any) as any)

  return { allowed: true }
}
