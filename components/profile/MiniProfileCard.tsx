"use client"

import Link from "next/link"
import { Bird, Crown, Eye, Flame, Sparkles, Users } from "lucide-react"

import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia, isVipActive } from "@/lib/account-tier"
import { mediaAdjustStyle } from "@/lib/profile-media-adjust"
import { profilePath } from "@/lib/profile-name"
import { getSpecialTag } from "@/lib/special-tag"
import { profileAccentHue } from "@/lib/user-directory"
import { cn } from "@/lib/utils"
import type { MiniProfile } from "@/lib/mini-profile"
import { getMiniProfileBgTheme } from "@/lib/mini-profile-backgrounds"
import {
  MiniProfileBackground,
  miniProfileBgBorderClass,
  miniProfileBgVars,
} from "@/components/profile/MiniProfileBackground"

const TIER_RING = {
  common: "ring-background",
  vip: "ring-[var(--vip-accent-soft)]",
} as const

function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

/**
 * Mini Perfil — cartão compacto de preview rápido, no conceito de "Profile
 * Background" da Steam.
 *
 * O fundo é o `mini_banner_url`: uma imagem enviada à parte da capa grande do
 * perfil (`banner_url`), e que anima quando é GIF de uma conta VIP. Quem não
 * enviou nada cai numa cor derivada do id — a mesma do card de `/pessoas`, então
 * o perfil tem sempre a mesma identidade visual nos dois lugares.
 *
 * Por cima disso pode vir um **Fundo de Mini Perfil** comprado na Central de
 * Aura (`equipped_mini_profile_bg`): um tema animado — borda com brilho,
 * raios, partículas — desenhado só com CSS (ver `lib/mini-profile-backgrounds.ts`).
 * Ele entra ATRÁS do `mini_banner_url` quando as duas coisas existem: a imagem
 * enviada é a foto do usuário e continua sendo o assunto; o tema é a moldura
 * viva em volta dela. Sem imagem enviada, o tema toma o cartão inteiro.
 *
 * Este componente é só apresentação: quem decide quando ele aparece é o
 * `MiniProfileHoverCard`. Ele nunca deve ser usado dentro da página de perfil
 * completa, que já mostra a capa grande.
 */
export function MiniProfileCard({ profile }: { profile: MiniProfile }) {
  const avatar = resolveProfileMedia(profile.avatar_url, profile.account_tier, profile.vip_expires_at)
  const background = resolveProfileMedia(
    profile.mini_banner_url,
    profile.account_tier,
    profile.vip_expires_at
  )
  const hue = profileAccentHue(profile.id)
  const isVip = isVipActive(profile.account_tier, profile.vip_expires_at)
  const bgTheme = getMiniProfileBgTheme(profile.equipped_mini_profile_bg)
  const effectiveTier = isVip ? "vip" : "common"
  const specialTag = getSpecialTag(profile.display_slug)
  const initials =
    profile.display_name.trim().split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2) ||
    "?"

  return (
    <Link
      href={profilePath(profile.display_slug)}
      className={cn(
        // SEM `overflow-hidden` aqui: o halo e o traço de luz da borda do tema
        // vivem em ::before/::after estourando o retângulo do cartão, e um
        // clip neste nível os cortaria justamente onde eles existem. Quem
        // recorta o conteúdo é o wrapper interno abaixo.
        "relative block w-64 rounded-2xl border shadow-xl",
        // Com tema equipado a borda estática sai de cena: quem desenha o
        // contorno passa a ser a borda animada do tema.
        bgTheme ? "border-transparent" : "border-border",
        miniProfileBgBorderClass(bgTheme)
      )}
      style={miniProfileBgVars(bgTheme)}
    >
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          // A cor fica sempre atrás para que uma imagem ausente — ou que falhe
          // ao carregar — descubra o gradiente em vez de um retângulo vazio.
          backgroundImage: `linear-gradient(135deg, hsl(${hue} 65% 45% / 0.85), hsl(${(hue + 45) % 360} 60% 30% / 0.55))`,
        }}
      >
      {/* Tema comprado, quando há: fica na camada mais atrás, sob o
          `mini_banner_url`. */}
      {bgTheme && <MiniProfileBackground theme={bgTheme} />}
      {/* Fundo do Mini Perfil — a imagem enviada pelo usuário, o "Profile
          Background" da Steam. Com um tema equipado ela encolhe para uma faixa
          no topo em vez de cobrir o cartão: assim as duas coisas convivem — a
          foto em cima, o efeito animado emoldurando o resto. Sem tema, ela
          segue ocupando o cartão inteiro, como sempre. */}
      <div className={cn("absolute inset-x-0 top-0", bgTheme ? "h-[92px]" : "bottom-0")}>
        <ImageWithFallback
          src={background.src}
          alt=""
          fill
          unoptimized={background.animated}
          freeze={background.needsFreeze}
          sizes="256px"
          style={mediaAdjustStyle(profile.media_adjustments.mini_banner)}
          className="object-cover"
          fallback={null}
        />
        {bgTheme && background.src && (
          // Dissolve a base da faixa no tema, para não ficar um corte reto
          // entre a foto e o efeito.
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/90 to-transparent" />
        )}
      </div>

      {/* Só o suficiente para o texto ter contraste sobre qualquer imagem:
          escurece de baixo para cima e some antes do topo. */}
      <div
        className={cn(
          "absolute inset-0",
          bgTheme
            ? "bg-gradient-to-t from-black/70 via-black/25 to-black/10"
            : "bg-gradient-to-t from-black/85 via-black/45 to-black/10"
        )}
      />

      <div className="relative z-[1] flex flex-col items-center px-3 pb-3 pt-5">
        <div
          className={cn(
            "relative size-[72px] overflow-hidden rounded-full bg-muted ring-4 ring-offset-0",
            // Sobre uma imagem qualquer, o anel de conta comum precisa de uma
            // cor própria: `ring-background` sumiria no fundo escuro.
            effectiveTier === "common" ? "ring-white/50" : TIER_RING[effectiveTier]
          )}
        >
          <ImageWithFallback
            src={avatar.src}
            alt={profile.display_name}
            fill
            unoptimized={avatar.animated}
            freeze={avatar.needsFreeze}
            sizes="72px"
            style={mediaAdjustStyle(profile.media_adjustments.avatar)}
            className="object-cover"
            fallback={
              <div
                className="flex size-full items-center justify-center text-xl font-bold text-white/90"
                style={{
                  backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${(hue + 45) % 360} 50% 28%))`,
                }}
              >
                {initials}
              </div>
            }
          />
        </div>

        {/* Branco fixo, e não `text-foreground`: o texto agora se apoia numa
            imagem enviada pelo usuário, não no fundo do tema — no tema claro a
            cor do tema viraria texto escuro sobre foto escura. A sombra cobre
            o caso da imagem clara. */}
        <p className="mt-2 flex w-full items-center justify-center gap-1 text-sm font-bold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          <span className="truncate">{profile.display_name}</span>
          {isVip && <Crown className="size-3.5 shrink-0" style={{ color: "var(--vip-accent)" }} />}
          {specialTag && <Sparkles className="size-3.5 shrink-0 text-cyan-300" />}
        </p>

        {profile.bio && (
          <p className="mt-1 line-clamp-2 text-center text-[11px] leading-snug text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {profile.bio}
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          <span className="flex items-center gap-1">
            <Flame className="size-3 text-orange-400" fill="currentColor" strokeWidth={1.5} />
            <span className="font-semibold text-orange-300">{formatCount(profile.aura)}</span>
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            <span className="font-semibold text-white">{formatCount(profile.followers)}</span>
          </span>
          <span className="flex items-center gap-1">
            <Eye className="size-3" />
            <span className="font-semibold text-white">{formatCount(profile.profile_views)}</span>
          </span>
          {profile.streak > 0 && (
            <span className="flex items-center gap-1" title={`${profile.streak} dia${profile.streak === 1 ? "" : "s"} de ofensiva`}>
              <Bird className="size-3 text-amber-300 drop-shadow-[0_0_3px_rgba(251,191,36,0.8)]" />
              <span className="font-semibold text-amber-300">{formatCount(profile.streak)}</span>
            </span>
          )}
        </div>
      </div>
      </div>
    </Link>
  )
}
