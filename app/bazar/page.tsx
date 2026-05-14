import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { ProductCard } from "@/components/store/ProductCard"
import { CartButton, CartDrawer } from "@/components/store/CartDrawer"
import { Recycle } from "lucide-react"

export const revalidate = 60

async function getBazaarProducts() {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("store_products")
    .select("id, slug, name, price_cents, stock, images, category, type, condition, condition_notes")
    .eq("type", "bazaar")
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  return data ?? []
}

export default async function BazarPage() {
  const products = await getBazaarProducts()

  return (
    <>
      <CartDrawer />

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Recycle className="size-6 text-amber-400" />
              <h1 className="text-3xl font-black tracking-tight text-slate-50">Bazar</h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Equipamentos usados pelo próprio Sunano · Já abertos e testados
            </p>
          </div>
          <CartButton />
        </div>

        {/* Disclaimer */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">♻️</span>
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-300">O que é o Bazar?</p>
              <p className="text-sm text-slate-400 leading-relaxed">
                O Bazar é onde o Sunano vende equipamentos que ele mesmo usou e testou no canal.
                Todos os produtos são <strong className="text-amber-300">usados e/ou já abertos</strong>,
                com a condição descrita em cada item. São produtos de qualidade, curados pelo Sunano,
                disponibilizados com preço justo para a comunidade.
              </p>
            </div>
          </div>
        </div>

        {/* Products */}
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 py-20 text-center">
            <Recycle className="size-12 text-amber-700" />
            <p className="text-base font-semibold text-amber-400/70">Bazar temporariamente vazio</p>
            <p className="text-sm text-slate-600">
              Fique de olho nas redes do Sunano para novidades!
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
            { icon: "✅", title: "Testado por Sunano", desc: "Todo item foi usado pessoalmente" },
            { icon: "🔒", title: "Pagamento seguro", desc: "Stripe · Cartão ou PIX" },
            { icon: "📦", title: "Enviado pelo criador", desc: "Produto despachado diretamente" },
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
