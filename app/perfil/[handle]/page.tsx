import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"

import { ProfileShowcase } from "@/components/profile/ProfileShowcase"
import { profilePath } from "@/lib/profile-name"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import {
  findUserIdByDisplaySlug,
  incrementProfileViews,
  isFollowing,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { buildDescription, buildMetadata } from "@/lib/seo"
import { isProfileIndexable } from "@/lib/indexability"

/**
 * SEM `loading.tsx` nesta pasta — de propósito.
 *
 * Um `loading.tsx` no segmento dinâmico é um Suspense boundary: o Next começa
 * a streamar a resposta e se compromete com `200 OK` antes de o componente
 * chegar ao `notFound()`. Dali em diante o status não pode mais mudar para
 * 404 — o Next só injeta `<meta robots="noindex">` no HTML já enviado (ver
 * node_modules/next/dist/docs/01-app/02-guides/streaming.md, "The HTTP
 * contract"). O efeito era soft-404: `/perfil/<qualquer-coisa>` respondia
 * 200 com a tela "não encontrado", e o Search Console contava a URL como
 * rastreada sem conteúdo.
 *
 * Verificado empiricamente: com o arquivo presente, 200; sem ele, 404 — e as
 * rotas que nunca o tiveram (`/blog`, `/noticias`) sempre devolveram 404.
 * Atenção ao testar: `next dev` rodando em paralelo recria o cache de
 * `.next` e falseia o resultado — use `rm -rf .next && next build && next start`.
 *
 * O custo é não ter skeleton nesta rota (o conteúdo aparece de uma vez, após
 * o servidor resolver). Se um dia o skeleton for necessário aqui, ele precisa
 * vir de um `<Suspense>` DENTRO do componente, depois do `notFound()`, nunca
 * de um `loading.tsx` neste nível.
 */

// Server Component: chama o repositório direto (ARQUITETURA.md §1), sem
// spinner client-side. Renderiza por requisição porque lê a sessão para
// decidir se exibe os atalhos de edição do dono.
export const dynamic = "force-dynamic"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O segmento é o slug do nome (`/perfil/joao-silva`), mas UUID continua
 * resolvendo: links antigos foram compartilhados antes do nome único existir.
 */
async function resolveUserId(handle: string): Promise<string | null> {
  const value = decodeURIComponent(handle)
  if (UUID_PATTERN.test(value)) return value
  return findUserIdByDisplaySlug(value)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const userId = await resolveUserId(handle)
  const profile = userId ? await getProfileShowcase(userId) : null
  // `noIndex` explícito: sem ele a metadata herda o `index, follow` do layout
  // raiz e a página de erro sai com dois `<meta name="robots">` contraditórios.
  if (!profile)
    return buildMetadata({
      title: "Perfil não encontrado",
      description: "Esse perfil não existe ou não está mais disponível na Sunano.",
      path: `/perfil/${handle}`,
      noIndex: true,
    })

  const canonical = profile.display_slug ? profilePath(profile.display_slug) : `/perfil/${handle}`

  return buildMetadata({
    // Perfil sem nenhuma atividade sai do índice (mantendo `follow`): o HTML
    // servido eram ~565 chars, 191 deles o menu, e o resto o mesmo template
    // de todos os outros. Mesma decisão do `app/sitemap.ts`, via
    // `lib/indexability.ts` — escreva no fórum, avalie um periférico, preencha
    // a bio ou cadastre favoritos e o perfil volta a ser indexável sozinho.
    thinContent: !isProfileIndexable({
      bio: profile.bio,
      forumPosts: profile.forum_posts,
      forumComments: profile.forum_comments,
      reviewsTotal: profile.reviews_total,
      favoritesTotal: profile.favorites_total,
      tierlistItemCount: profile.tierlist_item_count,
    }),
    title: `${profile.display_name} - Perfil`,
    description: buildDescription(profile.bio, `Setup e periféricos favoritos de ${profile.display_name}.`, {
      context: "Veja a tierlist, as reviews e a Aura desse membro na Sunano.",
    }),
    path: canonical,
    type: "profile",
    eyebrow: "Perfil",
    subtitle: `Setup, tierlist e reviews de ${profile.display_name}`,
    // Avatar entra num recorte circular dentro do card 1200×630. Antes ele ia
    // cru como og:image: 1:1 e frequentemente abaixo do mínimo de 200px que o
    // X exige, então o card saía sem imagem.
    image: profile.avatar_url ?? profile.banner_url,
    imageVariant: profile.avatar_url ? "avatar" : "cover",
  })
}

export default async function PerfilPublicoPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const userId = await resolveUserId(handle)
  if (!userId) notFound()

  const profile = await getProfileShowcase(userId)
  if (!profile) notFound()

  // Uma URL por perfil: quem chegou pelo UUID (ou por um slug antigo, depois
  // de o dono trocar de nome) é levado para o endereço atual.
  if (profile.display_slug && decodeURIComponent(handle) !== profile.display_slug) {
    redirect(profilePath(profile.display_slug))
  }

  // A sessão é lida só para decidir se mostramos os atalhos de edição —
  // o conteúdo da página é público e igual para todos.
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const isOwner = authData.user?.id === profile.id

  // Não conta visita do próprio dono revisitando o próprio perfil.
  if (!isOwner) void incrementProfileViews(profile.id)

  const viewerId = authData.user?.id
  const following = viewerId && !isOwner ? await isFollowing(viewerId, profile.id) : false

  return <ProfileShowcase profile={profile} isOwner={isOwner} isFollowing={following} />
}
