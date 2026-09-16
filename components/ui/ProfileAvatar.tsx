import { Activity, Bird, Crown, Sparkles, Star, UserX, Users } from "lucide-react"

import { AuraFlameIcon } from "@/components/ui/AuraIcon"

import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { isVipActive, type AccountTier } from "@/lib/account-tier"
import { mediaAdjustStyle, type MediaAdjust } from "@/lib/profile-media-adjust"
import {
  resolveProfileFrame,
  type ProfileFrame,
  type ProfileFrameBadge,
  type ProfileFrameIdentity,
} from "@/lib/profile-frames"
import { cn } from "@/lib/utils"

/**
 * **O componente de foto de usuário do site.** Toda referência a avatar,
 * mini perfil, byline, comentário, ranking, pódio, admin e loja passa por
 * aqui — nenhum arquivo deve montar um `rounded-full` com `<Image>` de avatar
 * por conta própria. Ver `AGENTS.md` ("Foto de usuário").
 *
 * O que ele centraliza, e que antes estava espalhado por ~40 arquivos:
 *
 * - **Formato e borda** — círculo, borda neutra, fundo do fallback e as
 *   iniciais. Cada tela tinha a sua espessura e o seu tom; agora é uma só.
 * - **Moldura** — cosmética equipada, Fundador ou VIP, resolvidas por
 *   `lib/profile-frames.ts`. O componente não decide QUAL moldura: recebe o
 *   contexto e delega, para que a regra viva num módulo puro e testável.
 * - **Emblema** — o fogo do rank no meio-baixo, a coroa do VIP no canto.
 * - **Congelamento de GIF** — conta não-VIP vê o primeiro quadro.
 *
 * O tamanho é um token (`xs`…`2xl`), não um número solto: a espessura do
 * anel, o tamanho do emblema e o `sizes` da imagem derivam dele. Um `size`
 * arbitrário obrigaria cada chamada a reacertar as três coisas — que é
 * exatamente o que gerou a divergência anterior.
 */

/**
 * Tokens de tamanho.
 *
 * `badge` descreve a PASTILHA INTEIRA em pixels — `size` é o diâmetro
 * externo (já incluindo a borda), `icon` é o símbolo dentro dela. Os dois são
 * declarados, não calculados: derivar a borda e o respiro por proporção fazia
 * o arredondamento devolver um símbolo MENOR no token grande que no pequeno.
 *
 * Antes daqui `badge` era só a classe do ícone e a pastilha crescia por fora,
 * com `border-2` + `p-[3px]` fixos — ~10px somados em qualquer escala. Num
 * avatar `sm` isso punha o emblema em mais de 40% da foto (o bug da estrela
 * de Fundador, que tapava metade do rosto). A escala agora cai de ~30% da
 * foto no `xs` para ~20% no `2xl`: quanto maior a foto, menos ela precisa que
 * o emblema grite.
 */
export const AVATAR_SIZES = {
  xs: { box: "size-5", text: "text-[8px]", ring: 1.5, badge: { size: 9, icon: 5 }, sizes: "20px" },
  sm: { box: "size-8", text: "text-[10px]", ring: 2, badge: { size: 11, icon: 6 }, sizes: "32px" },
  md: { box: "size-10", text: "text-xs", ring: 2, badge: { size: 13, icon: 7 }, sizes: "40px" },
  lg: { box: "size-14", text: "text-base", ring: 2.5, badge: { size: 16, icon: 9 }, sizes: "56px" },
  xl: { box: "size-20", text: "text-lg", ring: 3, badge: { size: 20, icon: 12 }, sizes: "80px" },
  "2xl": {
    box: "size-24 sm:size-28 md:size-32",
    text: "text-2xl",
    ring: 3.5,
    badge: { size: 26, icon: 15 },
    sizes: "128px",
  },
} as const

export type ProfileAvatarSize = keyof typeof AVATAR_SIZES

/**
 * Forma do recorte. A MOLDURA é a mesma nos dois casos — só o raio muda.
 *
 * `circle` é o padrão em todo o site. `rounded` existe só para a foto grande
 * do perfil (`AvatarQuadrado`), que é quadrada por decisão de layout daquela
 * tela. Ter as duas aqui é o que impede a moldura quadrada de divergir: o
 * anel do quadrado já foi, uma vez, um `border-image` — que **ignora
 * `border-radius` por especificação** e pintava um retângulo de canto vivo
 * por cima da foto arredondada.
 */
export type ProfileAvatarShape = "circle" | "rounded"

/** Raio do recorte e do anel, por forma. Os dois PRECISAM casar. */
const SHAPE_RADIUS: Record<ProfileAvatarShape, { inner: string; outer: string }> = {
  circle: { inner: "rounded-full", outer: "rounded-full" },
  // O anel fica `token.ring`px para fora, então o raio dele é o do recorte
  // mais essa espessura — senão sobra um "degrau" visível nos cantos.
  rounded: { inner: "rounded-xl", outer: "rounded-[1rem]" },
}

// `React.ElementType` porque o emblema de Aura é o componente central do
// site, não um ícone do lucide (o mapa antigo prendia a moeda à lib).
const BADGE_ICONS: Record<ProfileFrameBadge["icon"], React.ElementType> = {
  flame: AuraFlameIcon,
  crown: Crown,
  sparkles: Sparkles,
  bird: Bird,
  users: Users,
  activity: Activity,
  star: Star,
}

/** Ícones que ficam melhor preenchidos que traçados no tamanho do emblema. */
const FILLED_BADGE_ICONS = new Set<ProfileFrameBadge["icon"]>(["flame", "star"])

/**
 * **O emblema fica SEMPRE centralizado na base**, em toda moldura e em todo
 * tamanho — nenhuma moldura escolhe canto (o campo `position` saiu do tipo).
 * Era a escolha por moldura que fazia a mesma pessoa aparecer com a estrela
 * embaixo numa tela e no canto direito na outra, e o canto ainda cobria o
 * rosto nos avatares pequenos.
 */
const BADGE_ANCHOR = "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3"

/**
 * Geometria do emblema, derivada do token — **a única fonte de tamanho de
 * emblema sobre avatar no site**. Quem desenha um selo próprio em cima de um
 * `ProfileAvatar` (a faísca de `PersonAvatar`) usa isto em vez de um
 * `border`/`p-[3px]` solto: chrome fixo sobre foto pequena é o que fazia o
 * símbolo passar de 40% do avatar.
 *
 * `pill` = tem fundo próprio (gasta diâmetro com borda e respiro);
 * sem fundo o símbolo ocupa o diâmetro inteiro.
 */
export function avatarBadgeGeometry(size: ProfileAvatarSize, pill: boolean) {
  const { size: diameter, icon } = AVATAR_SIZES[size].badge
  // A borda é o recorte contra a foto, então acompanha a escala mas nunca
  // passa de 2px: mais que isso e a pastilha pequena vira quase só borda.
  const border = pill ? Math.min(2, Math.max(1, Math.round(diameter / 10))) : 0
  return {
    diameter,
    border,
    // Sem pastilha o símbolo ocupa o diâmetro inteiro (é o caso do fogo do
    // rank, solto sobre o anel) — senão sairia menor que o emblema com
    // pastilha do mesmo token.
    icon: pill ? icon : diameter,
    /** Estilo da pastilha circular: diâmetro externo, borda e centragem. */
    pillStyle: pill
      ? {
          borderWidth: border,
          borderStyle: "solid" as const,
          width: diameter,
          height: diameter,
        }
      : null,
  }
}

/**
 * Halo externo por intensidade — o 1º lugar acende, o 3º só tem borda.
 * O brilho é discreto de propósito: o anel já é o sinal da moldura, e um halo
 * forte em cada avatar de uma listagem vira ruído. Além do raio menor, a cor
 * entra diluída (`GLOW_ALPHA`) — em opacidade cheia o halo empastava o
 * gradiente do anel.
 */
const GLOW_SPREAD = { none: null, soft: "6px", strong: "10px" } as const

/** Quanto da cor do anel vai para o halo; o resto é transparência. */
const GLOW_ALPHA = { none: null, soft: "28%", strong: "40%" } as const

export type ProfileAvatarProps = {
  /** Nome de exibição — alt da imagem e origem das iniciais do fallback. */
  name: string
  /**
   * URL da foto. Prefira sempre `profileMediaProxyUrl(...)` em vez da coluna
   * `avatar_url` crua (ver `lib/account-tier.ts`).
   */
  avatarUrl: string | null | undefined
  size?: ProfileAvatarSize
  /** Recorte: círculo (padrão do site) ou quadrado arredondado (foto grande do perfil). */
  shape?: ProfileAvatarShape

  /** Tier da conta — com `vipExpiresAt`, decide a moldura VIP e o GIF animado. */
  tier?: AccountTier | string | null
  vipExpiresAt?: string | null

  /**
   * A moldura da pessoa, em um objeto só (`profileFrameOf(...)`).
   *
   * **É esta a forma preferida em código novo.** As props soltas abaixo
   * existem para as chamadas antigas; passar o objeto é o que garante que
   * slug, asset, VIP e Fundador cheguem juntos — levar metade é como uma
   * moldura de arte em código sumia da tela.
   */
  frame?: ProfileFrameIdentity | null

  /** Asset da moldura cosmética equipada (`equipped_avatar_frame_url`). */
  frameUrl?: string | null
  /** Slug do item cosmético equipado, quando conhecido. */
  frameSlug?: string | null
  /**
   * Se a pessoa possui a Moldura de Fundador (assinou o VIP na janela de
   * lançamento). Honraria permanente: vale mesmo sem VIP ativo, e por isso
   * NÃO dá para derivar de `tier`/`vipExpiresAt` como a moldura de VIP — quem
   * consulta o perfil precisa trazer o dado (ver `ownsVipFounderFrame`).
   */
  isFounder?: boolean
  /**
   * Moldura pronta, ignorando toda a resolução acima. Só para vitrines
   * (a loja precisa mostrar molduras que o usuário não tem).
   */
  frameOverride?: ProfileFrame | null

  /** Enquadramento escolhido pelo dono no editor de perfil. */
  adjust?: MediaAdjust
  /** Primeiro quadro estático em vez do GIF (conta sem direito a animação). */
  freeze?: boolean
  /** GIF anima — normalmente derivado do tier, explícito só quando já resolvido. */
  animated?: boolean
  /** Conta que existiu e foi removida — desenho próprio, sem foto nem iniciais. */
  removed?: boolean
  priority?: boolean
  className?: string
  /** Classe extra do elemento externo (útil para `absolute`/offsets do chamador). */
  wrapperClassName?: string
  /**
   * Exibe o texto do emblema ao lado do símbolo (ex: a pastilha "👑 VIP").
   * Só a foto grande do perfil liga isso — num avatar de lista não cabe.
   */
  showBadgeText?: boolean
}

export function ProfileAvatar({
  name,
  avatarUrl,
  size = "md",
  shape = "circle",
  tier,
  vipExpiresAt = null,
  frame,
  frameUrl,
  frameSlug,
  isFounder = false,
  frameOverride,
  adjust,
  freeze = false,
  animated = false,
  removed = false,
  priority = false,
  className,
  wrapperClassName,
  showBadgeText = false,
}: ProfileAvatarProps) {
  const token = AVATAR_SIZES[size]
  const initials =
    name.trim().split(/\s+/).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "?"

  // `frameOverride === null` é uma escolha explícita ("não desenhe moldura"),
  // diferente de `undefined` ("resolva normalmente"). Sem essa distinção a
  // vitrine da loja não conseguia mostrar o avatar cru ao lado do emoldurado.
  const resolvedFrame =
    frameOverride !== undefined
      ? frameOverride
      : resolveProfileFrame(
          // O objeto, quando vem, é a fonte completa; as props soltas são o
          // caminho antigo e valem só na ausência dele.
          frame
            ? {
                equippedFrameUrl: frame.url,
                equippedFrameSlug: frame.slug,
                isVip: frame.isVip,
                isFounder: frame.isFounder,
                longestStreak: frame.longestStreak,
                frameOptOut: frame.frameOptOut,
              }
            : {
                equippedFrameUrl: frameUrl,
                equippedFrameSlug: frameSlug,
                isVip: isVipActive(tier, vipExpiresAt),
                isFounder,
              }
        )

  if (removed) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center border border-destructive/30 bg-destructive/15 text-destructive",
          SHAPE_RADIUS[shape].inner,
          token.box,
          className,
          wrapperClassName
        )}
        title="Usuário removido"
      >
        <UserX className="size-[55%]" strokeWidth={2} />
      </div>
    )
  }

  const ring = resolvedFrame?.render.kind === "ring" ? resolvedFrame.render : null
  const glowSpread = ring ? GLOW_SPREAD[ring.glow] : null
  const glowAlpha = ring ? GLOW_ALPHA[ring.glow] : null

  return (
    // `isolate` (CSS `isolation: isolate`) NÃO é decoração: ele cria um
    // contexto de empilhamento próprio, e sem isso o `z-20` do emblema e o
    // `z-10` da moldura de asset competem com a PÁGINA inteira em vez de
    // ordenarem só as camadas do avatar. Um `relative` sem `z-index` não
    // estabelece contexto nenhum — era por isso que o fogo/pássaro/coroa de
    // TODOS os avatares do site aparecia por cima da topbar, dos menus e dos
    // modais. O emblema tem de empilhar dentro do avatar, nunca acima do app.
    <div className={cn("relative isolate shrink-0", token.box, wrapperClassName)}>
      {/* O anel é um elemento ATRÁS da foto, não um `border`/`ring` do próprio
          círculo: um gradiente de duas cores não cabe numa borda, e mantê-lo
          embaixo impede que o brilho passe por cima do rosto. */}
      {ring && (
        <span
          aria-hidden
          className={cn("absolute", SHAPE_RADIUS[shape].outer)}
          style={{
            inset: `-${token.ring}px`,
            backgroundImage: `linear-gradient(135deg, ${ring.accent}, ${ring.accent2})`,
            boxShadow:
              glowSpread && glowAlpha
                ? `0 0 ${glowSpread} -2px color-mix(in oklab, ${ring.accent} ${glowAlpha}, transparent)`
                : undefined,
          }}
        />
      )}

      <div
        className={cn(
          "relative size-full overflow-hidden bg-primary/15",
          SHAPE_RADIUS[shape].inner,
          // Sem moldura o círculo precisa da borda neutra para se destacar do
          // fundo; com moldura ela viraria uma segunda linha colada no anel.
          !ring && !resolvedFrame && "border border-border",
          className
        )}
      >
        <ImageWithFallback
          src={avatarUrl ?? null}
          alt={name}
          fill
          priority={priority}
          unoptimized={animated}
          freeze={freeze}
          sizes={token.sizes}
          style={adjust ? mediaAdjustStyle(adjust) : undefined}
          className="object-cover"
          fallback={
            <div
              className={cn(
                "flex size-full items-center justify-center font-bold text-primary",
                token.text
              )}
            >
              {initials}
            </div>
          }
        />
      </div>

      {/* Moldura de asset (PNG do admin) — por cima da foto e fora do recorte
          do círculo: ela extrapola a borda de propósito. */}
      {resolvedFrame?.render.kind === "asset" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedFrame.render.url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 size-full scale-110 object-contain"
        />
      )}

      {resolvedFrame?.badge && <FrameBadge badge={resolvedFrame.badge} size={size} showText={showBadgeText} />}
    </div>
  )
}

function FrameBadge({
  badge,
  size,
  showText,
}: {
  badge: ProfileFrameBadge
  size: ProfileAvatarSize
  showText: boolean
}) {
  const Icon = BADGE_ICONS[badge.icon]
  // A pastilha com texto é larga: ela cresce pelo próprio texto e não entra
  // na escala circular.
  const withText = showText && Boolean(badge.text)
  const pill = Boolean(badge.background) && !withText
  const { icon: circleIcon, pillStyle } = avatarBadgeGeometry(size, pill)
  // Na pastilha com texto o símbolo acompanha o texto, não o diâmetro do
  // círculo (que ali nem existe).
  const icon = withText ? AVATAR_SIZES[size].badge.icon : circleIcon

  return (
    <span
      title={badge.label}
      aria-label={badge.label}
      className={cn(
        "pointer-events-none absolute z-20 flex items-center justify-center",
        BADGE_ANCHOR,
        // Sem pastilha o símbolo fica solto sobre o anel (é o caso do fogo do
        // rank, que deve parecer saindo da moldura, não colado nela).
        badge.background && "rounded-full border-background",
        badge.background && withText &&
          "gap-1 border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"
      )}
      style={
        badge.background
          ? {
              backgroundColor: badge.background,
              color: badge.color,
              ...pillStyle,
            }
          : undefined
      }
    >
      <Icon
        className={badge.background ? undefined : "drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"}
        style={{ color: badge.color, width: icon, height: icon }}
        width={icon}
        height={icon}
        fill={FILLED_BADGE_ICONS.has(badge.icon) ? "currentColor" : undefined}
        strokeWidth={FILLED_BADGE_ICONS.has(badge.icon) ? 1.25 : 2.25}
      />
      {withText && badge.text}
    </span>
  )
}
