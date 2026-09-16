import { Flame } from "lucide-react"

import { AURA_BRAND_BG_CLASS, AURA_BRAND_COLOR_CLASS, AuraFlameIcon } from "@/components/ui/AuraIcon"

import { Contador, type Estatistica } from "@/components/profile/EstatisticasContador"
import { FollowersStatTrigger, PostsStatTrigger } from "@/components/profile/ProfileStatsDialogs"
import { cn } from "@/lib/utils"

/**
 * Caixas de estatística do header: aura, posts+comentários (uma caixa só,
 * já que os dois medem "produção no fórum") e seguidores. As duas últimas
 * abrem modal com a respectiva lista — a caixa em si é construída dentro de
 * `ProfileStatsDialogs` (ver nota lá) para não cruzar a fronteira
 * Server→Client component com o `<button>` do `DialogTrigger`.
 *
 * Favoritos ficam de fora daqui: já têm seção própria (`FavoritosGrid`) mais
 * abaixo na página, repeti-los aqui só inflaria a grade.
 */
export function EstatisticasGrid({
  userId,
  aura,
  posts,
  comentarios,
  seguidores,
  className,
}: {
  /** Dono das estatísticas — abre os modais de Posts e Seguidores dele. */
  userId: string
  aura: number
  posts: number
  comentarios: number
  seguidores: number
  className?: string
}) {
  // Cor e símbolo vêm do componente central da Aura — aqui o ícone entra como
  // VALOR numa config genérica de estatística, então não dá para usar
  // `<AuraIcon>` direto; o que não pode é redigitar a cor (ver AuraIcon.tsx).
  const auraItem: Estatistica = {
    icone: AuraFlameIcon,
    rotulo: "Aura",
    valor: aura,
    tom: AURA_BRAND_COLOR_CLASS,
    fundo: AURA_BRAND_BG_CLASS,
    preenchido: true,
  }

  return (
    <div className={cn("flex flex-wrap justify-center gap-3 sm:gap-4", className)}>
      <div className="aura-stat-card relative flex items-center rounded-xl border border-border bg-card/60 px-4 py-3 sm:px-5 sm:py-3.5">
        <Contador item={auraItem} destaque />
      </div>

      <PostsStatTrigger userId={userId} postsCount={posts} commentsCount={comentarios} />

      <FollowersStatTrigger userId={userId} followersCount={seguidores} />
    </div>
  )
}

/** Reexportado para o header não precisar duplicar a regra de milhar. */
export { formatCount } from "@/components/profile/EstatisticasContador"
