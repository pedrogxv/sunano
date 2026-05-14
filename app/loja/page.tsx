import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { ProductCard } from "@/components/store/ProductCard"
import { CartButton, CartDrawer } from "@/components/store/CartDrawer"
import { ShoppingBag } from "lucide-react"

export const revalidate = 60

async function getStoreProducts() {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("store_products")
    .select("id, slug, name, price_cents, stock, images, category, type, condition, condition_notes")
    .eq("type", "store")
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  return data ?? []
}

export default async function LojaPage() {
  const products = await getStoreProducts()

  return (
    <>
      <CartDrawer />

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="size-6 text-slate-300" />
              <h1 className="text-3xl font-black tracking-tight text-slate-50">Loja</h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Produtos selecionados pelo Sunano · Envio para todo o Brasil
            </p>
          </div>
          <CartButton />
        </div>

        {/* Products */}
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.08] py-20 text-center">
            <ShoppingBag className="size-12 text-slate-700" />
            <p className="text-base font-semibold text-slate-400">Em breve novos produtos!</p>
            <p className="text-sm text-slate-600">
              A loja está sendo preparada. Fique atento ao canal.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} {...p} />
            ))}
          </div>
        )}

        {/* Trust signals */}
        <div className="grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-6">
          {[
            { icon: "🔒", title: "Pagamento seguro", desc: "Stripe · Cartão ou PIX" },
            { icon: "📦", title: "Envio garantido", desc: "Rastreamento incluído" },
            { icon: "💬", title: "Suporte direto", desc: "Dúvidas via canal/redes" },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
              <p className="text-xl">{item.icon}</p>
              <p className="mt-1 text-xs font-bold text-slate-300">{item.title}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
