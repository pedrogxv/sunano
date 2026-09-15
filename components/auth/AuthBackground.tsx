"use client"

import { motion } from "framer-motion"
import { Flame, MessageCircle, ShoppingCart, Crown, Mouse, Users } from "lucide-react"

/**
 * Réplicas visuais estáticas (não os componentes reais) dos cards de
 * fórum/loja/tierlist/periférico/perfil — decorativas, sem link/fetch/tooltip,
 * só pra dar uma prévia do site atrás do card de login. Usar os componentes
 * reais dispararia efeitos colaterais (fetch de aura, useCart, Radix tooltip)
 * sem propósito numa tela puramente ilustrativa.
 */
function ForumCardPreview() {
  return (
    <div className="w-64 rounded-xl border border-border bg-card p-3 shadow-xl">
      <div className="flex items-center gap-2">
        <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">yuh_naka</p>
          <p className="text-[10px] text-muted-foreground">Fórum · Periféricos</p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-semibold text-foreground">
        Vale a pena trocar pro switch óptico ou o magnético já é melhor?
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-500">
          <Flame className="size-2.5" fill="currentColor" />
          128
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
          <MessageCircle className="size-2.5" />
          34
        </span>
      </div>
    </div>
  )
}

function StoreCardPreview() {
  return (
    <div className="w-48 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-sky-500/20 to-emerald-500/10">
        <span className="absolute left-2 top-2 rounded-full border border-sky-500/40 bg-sky-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-300">
          Loja
        </span>
      </div>
      <div className="space-y-1.5 p-3">
        <p className="line-clamp-1 text-xs font-bold text-foreground/90">Mouse Gamer Wireless</p>
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-emerald-400">R$ 299,90</p>
          <span className="flex size-6 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <ShoppingCart className="size-3" />
          </span>
        </div>
      </div>
    </div>
  )
}

function TierlistCardPreview() {
  const items: { tier: string; accent: string; brand: string }[] = [
    { tier: "S", accent: "bg-[#F97316]", brand: "Logitech" },
    { tier: "A", accent: "bg-[#F59E0B]", brand: "Razer" },
    { tier: "GOAT", accent: "bg-[#8B5CF6]", brand: "HyperX" },
  ]
  return (
    <div className="flex gap-2 rounded-xl border border-border bg-card p-2.5 shadow-xl">
      {items.map((item) => (
        <div key={item.brand} className="relative w-16 overflow-hidden rounded-lg bg-black/40">
          <div className={`absolute bottom-0 left-0 top-0 w-1 ${item.accent}`} />
          <div className="flex h-10 items-center justify-center text-[9px] font-black text-white/70">
            {item.brand.slice(0, 2).toUpperCase()}
          </div>
          <p className="truncate px-1.5 pb-1 text-center text-[8px] font-bold text-white/90">{item.tier}</p>
        </div>
      ))}
      <div className="flex items-center gap-1 self-center pl-1 text-[10px] font-semibold text-muted-foreground">
        <Crown className="size-3 text-amber-400" />
        Ranking
      </div>
    </div>
  )
}

function PeripheralCardPreview() {
  return (
    <div className="w-52 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <div className="flex h-24 items-center justify-center bg-background/40 p-4">
        <Mouse className="size-10 text-sky-400" />
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-foreground">
          Viper V3 Pro
        </p>
        <p className="text-[10px] text-muted-foreground">Razer</p>
        <span className="mt-1 inline-block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
          R$ 899,90
        </span>
      </div>
    </div>
  )
}

function ProfileCardPreview() {
  return (
    <div className="w-56 rounded-2xl border border-border bg-card p-3.5 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="size-12 shrink-0 rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-600 ring-4 ring-amber-400/50" />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="truncate text-xs font-bold text-foreground">kaze_gg</p>
            <Crown className="size-3 shrink-0 text-amber-400" />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5 text-orange-400">
              <Flame className="size-2.5" fill="currentColor" />
              2.4k
            </span>
            <span className="flex items-center gap-0.5">
              <Users className="size-2.5" />
              812
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AuthBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background">
      {/* Prévia do site: cards reais de fórum, loja e ranking, levemente fora de foco */}
      <div className="absolute inset-0 opacity-100 blur-[2px] sm:blur-[3px]">
        <motion.div
          className="absolute left-[3%] top-[8%] scale-125"
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        >
          <ForumCardPreview />
        </motion.div>

        <motion.div
          className="absolute right-[3%] top-[6%] scale-125"
          animate={{ y: [0, 16, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        >
          <StoreCardPreview />
        </motion.div>

        <motion.div
          className="absolute bottom-[8%] right-[6%] scale-125"
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        >
          <TierlistCardPreview />
        </motion.div>

        <motion.div
          className="absolute bottom-[6%] left-[4%] scale-125"
          animate={{ y: [0, 14, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        >
          <PeripheralCardPreview />
        </motion.div>

        <motion.div
          className="absolute left-[1%] top-[42%] hidden scale-110 sm:block"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        >
          <ProfileCardPreview />
        </motion.div>
      </div>

      {/* Vinheta bem leve só nas bordas da viewport (não no centro), pra manter contraste sem apagar os cards */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/15 via-transparent to-background/20" />
    </div>
  )
}
