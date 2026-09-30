"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { Crown, MessageCircle, ShoppingCart, UserCog } from "lucide-react"

import { AuraIcon } from "@/components/ui/AuraIcon"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { resolveProfileMedia } from "@/lib/account-tier"
import { mediaAdjustStyle } from "@/lib/profile-media-adjust"
import { profileFrameOf } from "@/lib/profile-frames"
import { tierLabel, type Tier } from "@/lib/tier-utils"
import { CARD_TIER_STYLES } from "@/lib/tierlist-theme"
import { profileAccentHue, type PublicProfileSummary } from "@/lib/user-directory"
import { cn } from "@/lib/utils"
import type { AuthBackgroundData, AuthBackgroundPeripheral } from "@/lib/server/auth-background-data"

/**
 * Prévia do site atrás do card de login. Fórum e loja são réplicas estáticas;
 * tierlist, periféricos e equipe vêm do banco (`getAuthBackgroundData`).
 *
 * Tudo aqui é decorativo: sem link, fetch, tooltip nem hover card. Por isso a
 * equipe usa `ProfileAvatar` direto, e não `PersonAvatar`/`MiniProfileHoverCard`,
 * que trazem tooltip e busca de mini perfil sem propósito numa tela de fundo.
 */

const priceFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

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
          <AuraIcon size="xs" tone="inherit" />
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

/** Fileiras do topo da tierlist, com as fotos reais dos periféricos. */
function TierlistBoardPreview({ rows }: { rows: { tier: Tier; items: AuthBackgroundPeripheral[] }[] }) {
  return (
    <div className="w-[17.5rem] rounded-xl border border-border bg-card p-2.5 shadow-xl">
      <div className="mb-2 flex items-center gap-1 px-0.5 text-[10px] font-semibold text-muted-foreground">
        <Crown className="size-3 text-amber-400" />
        Tierlist
      </div>
      <div className="space-y-1.5">
        {rows.map(({ tier, items }) => {
          const style = CARD_TIER_STYLES[tier]
          return (
            <div key={tier} className="flex gap-1.5">
              <div
                className={cn(
                  "flex w-10 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white",
                  style.accent
                )}
              >
                {tier}
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn("relative h-11 w-14 overflow-hidden rounded-md border", style.border)}
                  style={{ background: "var(--card-image-bg)" }}
                >
                  <Image src={item.imageUrl} alt="" fill sizes="56px" className="object-contain p-0.5" />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PeripheralPhotoCard({ item }: { item: AuthBackgroundPeripheral }) {
  const style = CARD_TIER_STYLES[item.tier]
  return (
    <div className={cn("w-52 overflow-hidden rounded-xl border bg-card shadow-xl", style.border, style.glow)}>
      <div className="relative h-28" style={{ background: "var(--card-image-bg)" }}>
        <Image src={item.imageUrl} alt="" fill sizes="208px" className="object-contain p-3" />
        <span
          className={cn(
            "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-black text-white",
            style.accent
          )}
        >
          {tierLabel(item.tier, item.category)}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-foreground">{item.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">{item.brand}</p>
        {item.price >= 1 && (
          <span className="mt-1 inline-block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            {priceFormatter.format(item.price)}
          </span>
        )}
      </div>
    </div>
  )
}

/** Mini perfil de um membro da equipe — mesmo banner + avatar do pódio de `/pessoas`. */
function StaffProfileCard({ profile }: { profile: PublicProfileSummary }) {
  const avatar = resolveProfileMedia(profile.avatar_url, profile.account_tier, profile.vip_expires_at)
  const banner = resolveProfileMedia(profile.mini_banner_url, profile.account_tier, profile.vip_expires_at)
  const hue = profileAccentHue(profile.id)

  return (
    <div className="w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div
        className="relative h-14 w-full overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(${hue} 65% 45% / 0.85), hsl(${(hue + 45) % 360} 60% 30% / 0.55))`,
        }}
      >
        <ImageWithFallback
          src={banner.src}
          alt=""
          fill
          unoptimized={banner.animated}
          freeze={banner.needsFreeze}
          sizes="224px"
          style={mediaAdjustStyle(profile.media_adjustments.mini_banner)}
          className="object-cover"
          fallback={null}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
      </div>
      <div className="-mt-7 flex flex-col items-center px-3 pb-3">
        <ProfileAvatar
          name={profile.display_name}
          avatarUrl={avatar.src}
          size="lg"
          frame={profileFrameOf(profile)}
          adjust={profile.media_adjustments.avatar}
          animated={avatar.animated}
          freeze={avatar.needsFreeze}
        />
        <p className="mt-2 max-w-full truncate text-xs font-bold text-foreground">{profile.display_name}</p>
        <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          <UserCog className="size-2.5" />
          Moderação
        </span>
      </div>
    </div>
  )
}

/** A equipe inteira em lista, como a sidebar de moderadores do fórum. */
function StaffListCard({ staff }: { staff: PublicProfileSummary[] }) {
  return (
    <div className="w-52 rounded-xl border border-border bg-card p-3 shadow-xl">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-foreground">
        <UserCog className="size-3 text-muted-foreground" />
        Equipe Sunano
      </p>
      <ul className="space-y-1.5">
        {staff.map((profile) => {
          const avatar = resolveProfileMedia(profile.avatar_url, profile.account_tier, profile.vip_expires_at)
          return (
            <li key={profile.id} className="flex items-center gap-2">
              <ProfileAvatar
                name={profile.display_name}
                avatarUrl={avatar.src}
                size="sm"
                frame={profileFrameOf(profile)}
                adjust={profile.media_adjustments.avatar}
                animated={avatar.animated}
                freeze={avatar.needsFreeze}
              />
              <span className="truncate text-[11px] font-semibold text-foreground">{profile.display_name}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Posiciona um card e o faz flutuar. Os que vêm do banco entram com fade. */
function Floating({
  className,
  drift,
  duration,
  delay = 0,
  fadeIn = false,
  children,
}: {
  className: string
  drift: number
  duration: number
  delay?: number
  fadeIn?: boolean
  children: ReactNode
}) {
  return (
    <motion.div
      className={cn("absolute", className)}
      initial={fadeIn ? { opacity: 0 } : false}
      animate={{ opacity: 1, y: [0, drift, 0] }}
      transition={{
        opacity: { duration: 0.8 },
        y: { duration, repeat: Infinity, ease: "easeInOut", delay },
      }}
    >
      {children}
    </motion.div>
  )
}

const BOARD_TIERS: readonly Tier[] = ["GOAT", "SS", "S"]
const BOARD_PER_TIER = 3

export function AuthBackgroundScene({ data }: { data: AuthBackgroundData }) {
  const boardRows = BOARD_TIERS.map((tier) => ({
    tier,
    items: data.peripherals.filter((p) => p.tier === tier).slice(0, BOARD_PER_TIER),
  })).filter((row) => row.items.length > 0)

  // Os cards de foto pegam periféricos que não estão no board, para a mesma
  // foto não aparecer duas vezes na tela. Com pouco catálogo, repete.
  const onBoard = new Set(boardRows.flatMap((row) => row.items.map((p) => p.id)))
  const spare = data.peripherals.filter((p) => !onBoard.has(p.id))
  const photoCards = (spare.length >= 2 ? spare : data.peripherals).slice(0, 2)

  const [featuredStaff] = data.staff

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background"
    >
      {/* Prévia do site levemente fora de foco. As colunas laterais só ganham
          os cards extras quando há largura sobrando ao redor do formulário. */}
      <div className="absolute inset-0 blur-[2px] sm:blur-[3px]">
        {/* ── Coluna esquerda ── */}
        <Floating className="left-[3%] top-[5%] scale-125" drift={-14} duration={9}>
          <ForumCardPreview />
        </Floating>

        {featuredStaff && (
          <Floating
            className="left-[10%] top-[27%] hidden scale-110 sm:block"
            drift={-10}
            duration={13}
            delay={2}
            fadeIn
          >
            <StaffProfileCard profile={featuredStaff} />
          </Floating>
        )}

        {photoCards[0] && (
          <Floating className="left-[2%] top-[52%] scale-110 lg:top-[50%]" drift={14} duration={12} delay={1} fadeIn>
            <PeripheralPhotoCard item={photoCards[0]} />
          </Floating>
        )}

        {data.staff.length > 1 && (
          <Floating
            className="bottom-[4%] left-[17%] hidden lg:block"
            drift={-8}
            duration={14}
            delay={3}
            fadeIn
          >
            <StaffListCard staff={data.staff} />
          </Floating>
        )}

        {/* ── Coluna direita ── */}
        <Floating className="right-[3%] top-[5%] scale-125" drift={16} duration={11} delay={0.5}>
          <StoreCardPreview />
        </Floating>

        {boardRows.length > 0 && (
          <Floating
            className="right-[4%] top-[38%] scale-110 sm:right-[8%] xl:scale-125"
            drift={-12}
            duration={10}
            delay={1.5}
            fadeIn
          >
            <TierlistBoardPreview rows={boardRows} />
          </Floating>
        )}

        {photoCards[1] && (
          <Floating className="bottom-[4%] right-[3%] hidden sm:block" drift={12} duration={11} delay={2.5} fadeIn>
            <PeripheralPhotoCard item={photoCards[1]} />
          </Floating>
        )}
      </div>

      {/* Vinheta bem leve só nas bordas da viewport (não no centro), pra manter contraste sem apagar os cards */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/15 via-transparent to-background/20" />
    </div>
  )
}
