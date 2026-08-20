import { PackageSearch, Wrench, Zap } from "lucide-react"

const TRUST_ITEMS = [
  {
    icon: Zap,
    title: "PIX na hora",
    description: "Chave gerada no checkout, sem espera.",
  },
  {
    icon: Wrench,
    title: "Testado antes de anunciar",
    description: "Cada item passa pela bancada Sunano.",
  },
  {
    icon: PackageSearch,
    title: "Pedido acompanhado",
    description: "Status direto na sua conta, do pagamento à entrega.",
  },
] as const

/** Faixa de confiança entre o hero e o catálogo — só na Loja geral e nas
 *  landings de marca; a landing de categoria já fica densa com o banner +
 *  fileira de tags, então pula essa seção (mesma regra dos Destaques). */
export function TrustStrip() {
  return (
    <>
      {/* Mobile: compacta em ícones simples, sem descrição, pra não empurrar o resto da página. */}
      <div className="flex items-stretch justify-between gap-2 rounded-2xl border border-[#262626] bg-card px-3 py-3 sm:hidden">
        {TRUST_ITEMS.map(({ icon: Icon, title }) => (
          <div key={title} className="flex flex-1 flex-col items-center gap-1.5 text-center">
            <Icon className="size-[17px] text-emerald-400" strokeWidth={1.8} />
            <span className="text-[10px] font-semibold leading-[1.25] text-[#b4b4b4]">{title}</span>
          </div>
        ))}
      </div>
    </>
  )
}
