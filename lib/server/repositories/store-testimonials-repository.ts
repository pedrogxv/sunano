import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import type { StoreTestimonial, TestimonialSource } from "@/lib/store-testimonials"

/**
 * Depoimentos de clientes cadastrados pelo admin (compras fora do site).
 * Separados de `store_product_reviews`: não carregam "Compra verificada".
 * A tabela não tem grant para o cliente, então tudo passa pelo admin client.
 */

const COLUMNS =
  "id, customer_name, source, product_id, product_label, rating, body, proof_image_url, purchased_on, is_published, sort_order, created_at"

export type TestimonialInput = {
  customerName: string
  source: TestimonialSource
  productId: string | null
  productLabel: string | null
  rating: number
  body: string
  proofImageUrl: string | null
  purchasedOn: string | null
  isPublished: boolean
}

export async function listPublishedTestimonials(limit = 60): Promise<StoreTestimonial[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_testimonials")
    .select(COLUMNS)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[store-testimonials-repository] listPublishedTestimonials:", error)
    return []
  }
  return (data ?? []) as unknown as StoreTestimonial[]
}

export async function listAllTestimonials(): Promise<StoreTestimonial[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_testimonials")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[store-testimonials-repository] listAllTestimonials:", error)
    throw error
  }
  return (data ?? []) as unknown as StoreTestimonial[]
}

function toRow(input: TestimonialInput) {
  return {
    customer_name: input.customerName,
    source: input.source,
    product_id: input.productId,
    product_label: input.productLabel,
    rating: input.rating,
    body: input.body,
    proof_image_url: input.proofImageUrl,
    purchased_on: input.purchasedOn,
    is_published: input.isPublished,
  }
}

export async function createTestimonial(input: TestimonialInput): Promise<StoreTestimonial> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_testimonials").insert(toRow(input)).select(COLUMNS).single()
  if (error) {
    console.error("[store-testimonials-repository] createTestimonial:", error)
    throw error
  }
  return data as unknown as StoreTestimonial
}

export async function updateTestimonial(id: string, input: TestimonialInput): Promise<StoreTestimonial> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_testimonials").update(toRow(input)).eq("id", id).select(COLUMNS).single()
  if (error) {
    console.error("[store-testimonials-repository] updateTestimonial:", error)
    throw error
  }
  return data as unknown as StoreTestimonial
}

export async function deleteTestimonial(id: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("store_testimonials").delete().eq("id", id)
  if (error) {
    console.error("[store-testimonials-repository] deleteTestimonial:", error)
    throw error
  }
}
