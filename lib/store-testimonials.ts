export const TESTIMONIAL_SOURCES = ["whatsapp", "instagram", "discord", "marketplace", "other"] as const
export type TestimonialSource = (typeof TESTIMONIAL_SOURCES)[number]

export const TESTIMONIAL_SOURCE_LABEL: Record<TestimonialSource, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  discord: "Discord",
  marketplace: "Marketplace",
  other: "Atendimento direto",
}

export type StoreTestimonial = {
  id: string
  customer_name: string
  source: TestimonialSource
  product_id: string | null
  product_label: string | null
  rating: number
  body: string
  proof_image_url: string | null
  purchased_on: string | null
  is_published: boolean
  sort_order: number
  created_at: string
}
