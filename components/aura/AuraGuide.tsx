"use client"

import { useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bird,
  Crown,
  Gamepad2,
  HelpCircle,
  Medal,
  MessageSquare,
  Minus,
  MousePointerClick,
  PenLine,
  Plus,
  ShoppingBag,
  SquarePen,
  Star,
  ThumbsUp,
  Users,
  Youtube,
} from "lucide-react"

import { AuraAmount, AuraIcon } from "@/components/ui/AuraIcon"
import { AuraFlame, type AuraFlameSize } from "@/components/ui/AuraFlame"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { TrustSeal } from "@/components/ui/TrustBadge"
import { Slider } from "@/components/ui/slider"
import { DiscordIcon } from "@/components/auth/provider-icons"
import { AuraFaqSection } from "@/components/aura/AuraFaqSection"
import { AURA_EMBERS } from "@/components/aura/aura-embers"
import {
  ACHIEVEMENT_THRESHOLDS,
  ACHIEVEMENT_TIERS,
  ACHIEVEMENT_TIER_NAMES,
  DAILY_MISSION_KEYS,
  DAILY_MISSION_REWARDS,
  auraLevelProgress,
  type AchievementTier,
  type DailyMissionKey,
} from "@/lib/achievements"
import { AURA_NOT_COUNTED_ENTRIES, buildTrustTierRows } from "@/lib/aura-faq"
import { auraPriceFor, VIP_AURA_DISCOUNT_PERCENT } from "@/lib/aura-pricing"
import {
  VIP_FOUNDER_FRAME,
  VIP_FRAME,
  rankFrame,
  streakFrame,
  FRAME_STREAK_MILESTONES,
  type ProfileFrame,
} from "@/lib/profile-frames"
import {
  auraActivityBonus,
  formatTotalAuraMultiplier,
  streakAuraMultiplierBps,
} from "@/lib/streak-multiplier"
import type { TrustLevel } from "@/lib/trust-factor"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

/**
 * Guia interativo de /informacoes/central-de-aura: o mesmo conteúdo do FAQ
 * (`AuraFaqSection`, que continua no fim da página como "regras completas"),
 * contado em capítulos com a calopsita, um simulador de ganho e a curva da
 * Ofensiva.
 *
 * Nenhum número é redigitado aqui: missões, níveis, multiplicador, desconto
 * VIP e limites de reação vêm dos mesmos módulos que o banco espelha. Mudou
 * a regra lá, o guia acompanha.
 */

const MASCOT = {
  head: "/images/mascot/mascot-448.webp",
  digging: "/images/mascot/guide/digging.webp",
  working: "/images/mascot/guide/working.webp",
  shopping: "/images/mascot/guide/shopping.webp",
  warning: "/images/mascot/guide/warning.webp",
} as const

const CHAPTERS = [
  { id: "ganhar", label: "Ganhar" },
  { id: "ofensiva", label: "Ofensiva" },
  { id: "niveis", label: "Níveis" },
  { id: "gastar", label: "Gastar" },
  { id: "mitos", label: "Mitos" },
  { id: "limites", label: "Limites" },
  { id: "regras", label: "Regras completas" },
] as const

/** Ganhos de atividade: os únicos que passam pelo multiplicador. Valores de `lib/aura-faq.ts`. */
const ACTIVITY_GAINS = [
  { key: "post", icon: SquarePen, label: "Criar um post", hint: "1 a cada 24h", base: 10, max: 1 },
  { key: "comment", icon: MessageSquare, label: "Comentar num post ou notícia", hint: "1 por post", base: 5, max: 10 },
  { key: "peripheral", icon: Gamepad2, label: "Comentar num periférico", hint: "1 por periférico", base: 5, max: 10 },
  { key: "review", icon: Star, label: "Avaliar um periférico", hint: "1 por periférico", base: 10, max: 5 },
] as const

type ActivityKey = (typeof ACTIVITY_GAINS)[number]["key"]

const MISSION_ICONS: Record<DailyMissionKey, React.ElementType> = {
  created_post: SquarePen,
  wrote_comment: MessageSquare,
  gave_aura: ThumbsUp,
}

/** Bônus por fechar as 3 missões no dia (`complete_daily_mission`). */
const MISSIONS_BONUS = 10

/** Aura paga por nível de conquista — a mesma régua do FAQ ("10 / 25 / 50 / 100 / 250"). */
const TIER_REWARD: Record<AchievementTier, number> = {
  bronze: 10,
  silver: 25,
  gold: 50,
  platinum: 100,
  diamond: 250,
}

const TIER_FLAME: Record<AchievementTier, AuraFlameSize> = {
  bronze: "sm",
  silver: "md",
  gold: "lg",
  platinum: "xl",
  diamond: "2xl",
}

/** Molduras da vitrine, desenhadas na própria calopsita. */
const SHOWCASE_FRAMES: ProfileFrame[] = [
  VIP_FOUNDER_FRAME,
  rankFrame("aura", 1),
  streakFrame(50),
  VIP_FRAME,
]

/** Faixa de Trust que representa cada degrau de limite de reações. */
const LIMIT_SEAL: Record<string, TrustLevel> = {
  new: "low",
  normal: "regular",
  verified: "good",
}

const CURVE_DAYS = 100

export function AuraGuide() {
  const [streak, setStreak] = useState(12)
  const [isVip, setIsVip] = useState(false)

  return (
    <div className="mx-auto max-w-5xl space-y-20 px-4 py-8 sm:py-12">
      <Hero />
      <EarnChapter streak={streak} setStreak={setStreak} isVip={isVip} setIsVip={setIsVip} />
      <StreakChapter streak={streak} setStreak={setStreak} isVip={isVip} />
      <LevelsChapter />
      <SpendChapter isVip={isVip} setIsVip={setIsVip} />
      <MythsChapter />
      <LimitsChapter />

      <section id="regras" className="scroll-mt-24 space-y-5">
        <ChapterHeading
          number={7}
          eyebrow="Para consulta"
          title="Regras completas"
          lede="Tudo o que está acima, linha por linha, com os detalhes de cada caso"
        />
        <AuraFaqSection hideHeading />
      </section>

      <FinalCta />
    </div>
  )
}

/* ────────────────────────────── Abertura ────────────────────────────── */

function Hero() {
  return (
    <header className="aura-title-banner relative">
      <Link
        href="/informacoes"
        className="relative z-[1] mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Central de Informações
      </Link>

      <div className="relative z-[1] grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Guia da comunidade</p>
          <h1 className="aura-title-text font-display text-4xl font-black leading-[1.05] sm:text-5xl">
            Como a Aura funciona
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
            Aura é a moeda da comunidade do Sunano. Ela nasce do que você posta, comenta e avalia, cresce com a sua Ofensiva e vira moldura, nome novo, VIP e até periférico de verdade.
          </p>

          {/* O ciclo inteiro em três passos — cada um pula para o capítulo dele */}
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {[
              { href: "#ganhar", label: "Participe", icon: MessageSquare },
              { href: "#ofensiva", label: "Mantenha o fogo", icon: Bird },
              { href: "#gastar", label: "Troque", icon: ShoppingBag },
            ].map((step, i) => (
              <li key={step.href} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="size-3.5 text-orange-500/60" aria-hidden />}
                <a
                  href={step.href}
                  className="group flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 py-1.5 pl-1.5 pr-3.5 font-semibold text-orange-200 transition-all hover:-translate-y-0.5 hover:border-orange-500/60 hover:bg-orange-500/20"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-orange-500/20 text-[11px] font-black tabular-nums text-orange-300">
                    {i + 1}
                  </span>
                  <step.icon className="size-3.5" />
                  {step.label}
                </a>
              </li>
            ))}
          </ol>
        </div>

        {/* A calopsita segurando a chama: a mascote da casa apresenta a moeda */}
        <div className="relative mx-auto size-36 sm:size-56">
          <div
            aria-hidden
            className="absolute inset-4 rounded-full bg-orange-500/25 blur-3xl motion-safe:animate-pulse"
          />
          <Image
            src={MASCOT.head}
            alt="Calopsita do Sunano"
            width={448}
            height={448}
            priority
            className="aura-guide-float relative size-full object-contain drop-shadow-[0_12px_30px_rgba(255,120,0,0.25)]"
          />
          <span className="absolute -right-2 -top-1 flex size-16 items-center justify-center rounded-full border border-orange-500/30 bg-background/80 shadow-lg shadow-orange-900/30 backdrop-blur sm:size-20">
            <AuraFlame size="2xl" sparks />
          </span>
        </div>
      </div>

      <nav aria-label="Capítulos" className="relative z-[1] mt-10 flex flex-wrap gap-1.5">
        {CHAPTERS.map((chapter, i) => (
          <a
            key={chapter.id}
            href={`#${chapter.id}`}
            className="rounded-full bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <span className="mr-1 tabular-nums text-orange-400/80">{i + 1}</span>
            {chapter.label}
          </a>
        ))}
      </nav>

      {AURA_EMBERS.map((ember, i) => (
        <span key={i} className="aura-ember" style={{ left: ember.left, ...ember.style }} aria-hidden />
      ))}
    </header>
  )
}

/* ────────────────────────────── Peças comuns ────────────────────────────── */

function ChapterHeading({
  number,
  eyebrow,
  title,
  lede,
  mascot,
  mascotAlt,
}: {
  number: number
  eyebrow: string
  title: string
  lede: ReactNode
  mascot?: keyof typeof MASCOT
  mascotAlt?: string
}) {
  return (
    <div className="flex items-end gap-5">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="flex size-6 items-center justify-center rounded-full bg-orange-500/15 text-[11px] tabular-nums text-orange-400">
            {number}
          </span>
          {eyebrow}
        </p>
        <h2 className="font-display text-2xl font-black leading-tight text-foreground sm:text-3xl">{title}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{lede}</p>
      </div>
      {mascot && (
        <Image
          src={MASCOT[mascot]}
          alt={mascotAlt ?? ""}
          width={384}
          height={384}
          className="aura-guide-float hidden size-28 shrink-0 object-contain sm:block md:size-36"
        />
      )}
    </div>
  )
}

function VipToggle({ isVip, setIsVip }: { isVip: boolean; setIsVip: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isVip}
      onClick={() => setIsVip(!isVip)}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        isVip
          ? "border-violet-400/50 bg-violet-500/15 text-violet-200"
          : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
      )}
    >
      <Crown className="size-3.5" />
      {isVip ? "Simulando como VIP" : "Simular como VIP"}
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          isVip ? "bg-violet-400" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-white transition-all",
            isVip ? "left-3.5" : "left-0.5"
          )}
        />
      </span>
    </button>
  )
}

function Stepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number
  max: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background/50 p-0.5">
      <button
        type="button"
        aria-label={`Menos: ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="w-6 text-center text-sm font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`Mais: ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-orange-500/15 hover:text-orange-300 disabled:opacity-30"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

/* ────────────────────────────── 1. Ganhar ────────────────────────────── */

function EarnChapter({
  streak,
  setStreak,
  isVip,
  setIsVip,
}: {
  streak: number
  setStreak: (v: number) => void
  isVip: boolean
  setIsVip: (v: boolean) => void
}) {
  const [counts, setCounts] = useState<Record<ActivityKey, number>>({
    post: 1,
    comment: 3,
    peripheral: 0,
    review: 1,
  })
  const [likes, setLikes] = useState(15)
  const [missions, setMissions] = useState<Record<DailyMissionKey, boolean>>({
    created_post: true,
    wrote_comment: true,
    gave_aura: false,
  })

  // A fração do bônus acumula na carteira (`apply_aura_gain`), então somar
  // as bases e aplicar o bônus uma vez dá o mesmo que ganho a ganho.
  const activityBase =
    ACTIVITY_GAINS.reduce((sum, g) => sum + g.base * counts[g.key], 0) + likes
  const bonus = auraActivityBonus(activityBase, streak, isVip)
  const activityTotal = activityBase + bonus.credited
  const allMissions = DAILY_MISSION_KEYS.every(({ key }) => missions[key])
  const fixedTotal =
    DAILY_MISSION_KEYS.reduce((sum, { key }) => sum + (missions[key] ? DAILY_MISSION_REWARDS[key] : 0), 0) +
    (allMissions ? MISSIONS_BONUS : 0)
  const total = activityTotal + fixedTotal
  const heat = total >= 150 ? 4 : total >= 90 ? 3 : total >= 40 ? 2 : 1

  return (
    <section id="ganhar" className="scroll-mt-24 space-y-8">
      <ChapterHeading
        number={1}
        eyebrow="Ganhar"
        title="Cave a sua Aura"
        lede="Toda participação de verdade rende Aura. Monte um dia aqui embaixo e veja quanto ele vale, com o bônus da sua Ofensiva e do VIP"
        mascot="digging"
        mascotAlt="Calopsita cavando com uma picareta"
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* Atividade — passa pelo multiplicador */}
          <div className={cn("rounded-2xl border p-4 sm:p-5", CARD_SURFACE)}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-orange-400">Atividade</p>
              <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-semibold text-orange-300">
                Com multiplicador
              </span>
            </div>
            <ul className="space-y-2">
              {ACTIVITY_GAINS.map((gain) => (
                <li key={gain.key} className="flex items-center gap-3 rounded-xl bg-background/40 px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-300">
                    <gain.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{gain.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      <AuraAmount value={gain.base} prefix="+" size="xs" tone="brand" className="font-semibold" /> ·{" "}
                      {gain.hint}
                    </p>
                  </div>
                  <Stepper
                    label={gain.label}
                    value={counts[gain.key]}
                    max={gain.max}
                    onChange={(v) => setCounts((c) => ({ ...c, [gain.key]: v }))}
                  />
                </li>
              ))}
              <li className="rounded-xl bg-background/40 px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-300">
                    <ThumbsUp className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Curtidas recebidas</p>
                    <p className="text-[11px] text-muted-foreground">
                      <AuraAmount value={1} prefix="+" size="xs" tone="brand" className="font-semibold" /> por curtida
                    </p>
                  </div>
                  <span className="w-10 text-right text-sm font-bold tabular-nums">{likes}</span>
                </div>
                <Slider
                  aria-label="Curtidas recebidas"
                  className="mt-3"
                  min={0}
                  max={100}
                  step={1}
                  value={[likes]}
                  onValueChange={([v]) => setLikes(v)}
                />
              </li>
            </ul>
          </div>

          {/* Missões — valor fixo */}
          <div className={cn("rounded-2xl border p-4 sm:p-5", CARD_SURFACE)}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-400">Missões diárias</p>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                Valor fixo
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {DAILY_MISSION_KEYS.map(({ key, label }) => {
                const Icon = MISSION_ICONS[key]
                const done = missions[key]
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={done}
                    onClick={() => setMissions((m) => ({ ...m, [key]: !m[key] }))}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5",
                      done
                        ? "border-emerald-400/40 bg-emerald-400/10"
                        : "border-border/70 bg-background/40 hover:border-orange-500/40"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        done ? "bg-emerald-400/20 text-emerald-300" : "bg-muted/70 text-muted-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className={cn("text-sm font-medium", done ? "text-foreground" : "text-muted-foreground")}>
                      {label}
                    </span>
                    <AuraAmount
                      value={DAILY_MISSION_REWARDS[key]}
                      prefix="+"
                      size="xs"
                      tone={done ? "brand" : "muted"}
                      className="text-xs font-semibold"
                    />
                  </button>
                )
              })}
            </div>
            <div
              className={cn(
                "mt-3 flex items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs transition-colors",
                allMissions
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                  : "border-border text-muted-foreground"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Bird className="size-3.5" />
                {allMissions ? "Dia fechado: Ofensiva +1" : "Feche as 3 para ganhar o bônus e avançar a Ofensiva"}
              </span>
              <AuraAmount value={MISSIONS_BONUS} prefix="+" size="xs" tone={allMissions ? "brand" : "muted"} className="font-bold" />
            </div>
          </div>
        </div>

        {/* Resultado — o card "aceso" da Central, com o calor amarrado ao total */}
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div
            className={cn("aura-balance-card relative overflow-hidden rounded-2xl border p-5", CARD_SURFACE)}
            data-heat={heat}
          >
            <div className="relative z-[1] space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AuraFlame size="lg" />
                <span className="aura-title-text text-xs font-semibold uppercase tracking-wider">Seu dia rende</span>
              </div>
              <p className="aura-title-text font-display text-5xl font-black tabular-nums" aria-live="polite">
                +{total.toLocaleString("pt-BR")}
              </p>

              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Atividade</dt>
                  <dd className="font-semibold tabular-nums text-foreground">+{activityBase}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Bônus de Ofensiva{isVip ? " e VIP" : ""}</dt>
                  <dd className="font-semibold tabular-nums text-orange-300">
                    +{bonus.exact.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Missões</dt>
                  <dd className="font-semibold tabular-nums text-sky-300">+{fixedTotal}</dd>
                </div>
              </dl>

              <div className="space-y-2 rounded-xl border border-border/60 bg-background/50 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Bird className="size-3.5 text-amber-400" />
                    Ofensiva
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {streak} dia{streak === 1 ? "" : "s"} ·{" "}
                    <span className="text-orange-300">+{formatTotalAuraMultiplier(streak, isVip)}</span>
                  </span>
                </div>
                <Slider
                  aria-label="Dias de Ofensiva"
                  min={0}
                  max={120}
                  step={1}
                  value={[streak]}
                  onValueChange={([v]) => setStreak(v)}
                />
              </div>

              <VipToggle isVip={isVip} setIsVip={setIsVip} />

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                O bônus é uma porcentagem de tudo que você ganha com atividade. A parte quebrada não se perde: fica
                guardada e vira +1 de Aura quando completa um inteiro. Missões e conquistas pagam sempre o valor
                cheio, sem bônus
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Ganhos de uma vez só */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">E de bônus, de uma vez</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OneTimeTile
            icon={<Youtube className="size-4" />}
            accent="from-red-600/15 border-red-600/25 text-red-400"
            title="Inscrição no YouTube"
            value={<AuraAmount value={50} prefix="+" size="sm" tone="inherit" />}
          />
          <OneTimeTile
            icon={<DiscordIcon className="size-4" fill="currentColor" />}
            accent="from-[#5865F2]/15 border-[#5865F2]/25 text-[#7983F5]"
            title="Entrar no Discord"
            value={<AuraAmount value={50} prefix="+" size="sm" tone="inherit" />}
          />
          <OneTimeTile
            icon={<Users className="size-4" />}
            accent="from-emerald-500/15 border-emerald-500/25 text-emerald-400"
            title="Indicar um amigo"
            value={
              <span className="flex items-baseline gap-1.5">
                <AuraAmount value={50} prefix="+" size="sm" tone="inherit" />
                <span className="text-[11px] font-medium text-muted-foreground">+20 indireto</span>
              </span>
            }
            href="/indicar"
          />
          <OneTimeTile
            icon={<ShoppingBag className="size-4" />}
            accent="from-orange-500/15 border-orange-500/25 text-orange-400"
            title="Comprar na Loja"
            value={
              <span className="flex items-baseline gap-1.5">
                <AuraAmount value={1} prefix="+" size="sm" tone="inherit" />
                <span className="text-[11px] font-medium text-muted-foreground">a cada R$ 10</span>
              </span>
            }
          />
        </div>
      </div>
    </section>
  )
}

function OneTimeTile({
  icon,
  accent,
  title,
  value,
  href,
}: {
  icon: ReactNode
  accent: string
  title: string
  value: ReactNode
  href?: string
}) {
  const body = (
    <>
      <span className="flex size-8 items-center justify-center rounded-lg bg-background/40">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="text-sm font-bold">{value}</span>
    </>
  )
  const className = cn(
    "flex flex-col items-start gap-2 rounded-xl border bg-gradient-to-br to-transparent p-3.5 transition-transform hover:-translate-y-0.5",
    accent
  )
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/* ────────────────────────────── 2. Ofensiva ────────────────────────────── */

function StreakChapter({
  streak,
  setStreak,
  isVip,
}: {
  streak: number
  setStreak: (v: number) => void
  isVip: boolean
}) {
  const days = Array.from({ length: CURVE_DAYS }, (_, i) => i + 1)
  const shown = Math.min(Math.max(streak, 1), CURVE_DAYS)

  // Arrastar o dedo/mouse sobre a curva escolhe o dia (o slider do simulador
  // é a forma acessível do mesmo controle).
  function pickFromPointer(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.buttons === 0 && e.type !== "pointerdown") return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setStreak(Math.max(1, Math.ceil(ratio * CURVE_DAYS)))
  }

  return (
    <section id="ofensiva" className="scroll-mt-24 space-y-8">
      <ChapterHeading
        number={2}
        eyebrow="Ofensiva"
        title="Mantenha o fogo aceso"
        lede="Fechar as 3 missões num dia avança a sua Ofensiva. Cada dia seguido aumenta o bônus sobre tudo que você ganha com atividade, em ciclos de 31 dias, até o teto de 6%"
        mascot="working"
        mascotAlt="Calopsita de capacete trabalhando com uma pá"
      />

      <div className={cn("rounded-2xl border p-4 sm:p-6", CARD_SURFACE)}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Dia {shown} de Ofensiva</p>
            <p className="font-display text-3xl font-black tabular-nums">
              <span className="aura-title-text">+{formatTotalAuraMultiplier(shown, isVip)}</span>
              <span className="ml-2 text-sm font-semibold text-muted-foreground">em cada ganho</span>
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MousePointerClick className="size-3.5" />
            Arraste sobre a curva
          </p>
        </div>

        <div
          className="relative h-40 cursor-ew-resize touch-none select-none"
          onPointerDown={pickFromPointer}
          onPointerMove={pickFromPointer}
          aria-hidden
        >
          {/* Faixas dos ciclos */}
          <div className="absolute inset-0 flex">
            {[
              { span: 31, label: "Ciclo 1 · até 2%" },
              { span: 31, label: "Ciclo 2 · até 4%" },
              { span: 31, label: "Ciclo 3 · até 6%" },
              { span: CURVE_DAYS - 93, label: "Teto" },
            ].map((band, i) => (
              <div
                key={band.label}
                style={{ flexGrow: band.span }}
                className={cn("relative border-l border-dashed border-border/60 first:border-l-0", i % 2 === 1 && "bg-secondary/30")}
              >
                <span className="absolute left-1.5 top-1 whitespace-nowrap text-[10px] font-medium text-muted-foreground/80">
                  {band.label}
                </span>
              </div>
            ))}
          </div>

          <div className="absolute inset-x-0 bottom-0 top-6 flex items-end gap-px">
            {days.map((day) => {
              const bps = streakAuraMultiplierBps(day)
              return (
                <div
                  key={day}
                  style={{ height: `${(bps / 600) * 100}%` }}
                  className={cn(
                    "flex-1 rounded-t-[2px] transition-colors duration-200",
                    day === shown
                      ? "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.8)]"
                      : day < shown
                        ? "bg-gradient-to-t from-orange-600 to-amber-400"
                        : "bg-muted-foreground/20"
                  )}
                />
              )
            })}
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>dia 1</span>
          <span>dia 31</span>
          <span>dia 62</span>
          <span>dia 93</span>
          <span>dia {CURVE_DAYS}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Proteção de Ofensiva — o 🧊 é arte do item, a moeda é Aura */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent p-5">
          <div aria-hidden className="pointer-events-none absolute right-4 top-3 text-5xl leading-none opacity-30">
            🧊
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-300">Proteção de Ofensiva</p>
          <p className="mt-2 font-display text-lg font-bold text-foreground">Perdeu um dia? A chama congela, não apaga</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Compre com Aura e guarde. Se faltar 1 dia de missões, a Ofensiva continua de onde parou quando você
            voltar a fechar as 3
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-sky-400/30 bg-background/40 px-3 py-1.5">
              Padrão · volta no dia seguinte ·{" "}
              <AuraAmount value={59} size="xs" tone="brand" className="font-bold text-foreground" />
            </span>
            <span className="rounded-full border border-sky-400/30 bg-background/40 px-3 py-1.5">
              Margem de 3 dias ·{" "}
              <AuraAmount value={199} size="xs" tone="brand" className="font-bold text-foreground" />
            </span>
          </div>
        </div>

        {/* Marcos viram moldura para sempre */}
        <div className={cn("rounded-2xl border p-5", CARD_SURFACE)}>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-300">Marcos de Ofensiva</p>
          <p className="mt-2 font-display text-lg font-bold text-foreground">Cada marco vira moldura, e fica</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Conta o seu recorde, não a sequência de agora. Perder a Ofensiva depois não tira o que você conquistou
          </p>
          <div className="mt-4 flex items-end justify-between gap-2">
            {FRAME_STREAK_MILESTONES.map((m) => (
              <div key={m} className="flex flex-col items-center gap-1.5">
                <ProfileAvatar
                  name="Sunano"
                  avatarUrl={MASCOT.head}
                  size="lg"
                  frameOverride={streakFrame(m)}
                />
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {m} dia{m === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────── 3. Níveis ────────────────────────────── */

function LevelsChapter() {
  // Escala logarítmica: os limiares vão de 10 a 50 mil, numa linha só.
  const [position, setPosition] = useState(55)
  const maxLog = Math.log10(60_000)
  const farmed = position === 0 ? 0 : Math.round(10 ** ((position / 100) * maxLog))
  const level = auraLevelProgress(farmed)

  return (
    <section id="niveis" className="scroll-mt-24 space-y-8">
      <ChapterHeading
        number={3}
        eyebrow="Níveis"
        title="De Brasa a Supernova"
        lede="O seu nível vem de toda a Aura que você já farmou, não do saldo. Gastar não te rebaixa, e cada nível novo paga um bônus"
      />

      <div className={cn("rounded-2xl border p-4 sm:p-6", CARD_SURFACE)}>
        <ol className="grid grid-cols-5 gap-1 sm:gap-3">
          {ACHIEVEMENT_TIERS.map((tier, i) => {
            const reached = level.level > i
            return (
              <li
                key={tier}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl px-1 py-3 text-center transition-all duration-300 sm:px-2",
                  reached ? "bg-orange-500/10" : "opacity-40 grayscale"
                )}
              >
                <span className="flex h-14 items-end">
                  <AuraFlame size={TIER_FLAME[tier]} sparks={reached && tier === "diamond"} />
                </span>
                <span className="font-display text-xs font-bold text-foreground sm:text-sm">
                  {ACHIEVEMENT_TIER_NAMES.aura_earned[tier]}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                  {ACHIEVEMENT_THRESHOLDS.aura_earned[tier].toLocaleString("pt-BR")} farmadas
                </span>
                <AuraAmount
                  value={TIER_REWARD[tier]}
                  prefix="+"
                  size="xs"
                  tone={reached ? "brand" : "muted"}
                  className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px] font-bold sm:text-[11px]"
                />
              </li>
            )
          })}
        </ol>

        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              Com <strong className="tabular-nums text-foreground">{farmed.toLocaleString("pt-BR")}</strong> de Aura
              farmada
            </span>
            <span className="font-semibold text-foreground">
              {level.level === 0 ? "Ainda sem nível" : `Nível ${level.level} · ${level.name}`}
              {level.nextThreshold !== null && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · faltam {(level.nextThreshold - farmed).toLocaleString("pt-BR")} para {level.nextName}
                </span>
              )}
            </span>
          </div>
          <Slider
            aria-label="Aura farmada"
            min={0}
            max={100}
            step={1}
            value={[position]}
            onValueChange={([v]) => setPosition(v)}
          />
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────── 4. Gastar ────────────────────────────── */

function SpendChapter({ isVip, setIsVip }: { isVip: boolean; setIsVip: (v: boolean) => void }) {
  const [frameIndex, setFrameIndex] = useState(0)
  const frame = SHOWCASE_FRAMES[frameIndex]
  const shieldPrice = auraPriceFor(59, isVip ? "vip" : "common")

  return (
    <section id="gastar" className="scroll-mt-24 space-y-8">
      <ChapterHeading
        number={4}
        eyebrow="Gastar"
        title="Hora das compras"
        lede={
          <>
            A Central de Aura é a loja. VIP paga {VIP_AURA_DISCOUNT_PERCENT}% a menos em quase tudo, e o saldo nunca
            fica negativo
          </>
        }
        mascot="shopping"
        mascotAlt="Calopsita de óculos escuros carregando uma sacola do Sunano"
      />

      <div className="flex justify-end">
        <VipToggle isVip={isVip} setIsVip={setIsVip} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Molduras — a vitrine troca de moldura na própria calopsita */}
        <button
          type="button"
          onClick={() => setFrameIndex((i) => (i + 1) % SHOWCASE_FRAMES.length)}
          className={cn(
            "group flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-all hover:-translate-y-0.5 hover:border-orange-500/40 sm:row-span-2",
            CARD_SURFACE
          )}
        >
          <p className="self-start text-xs font-bold uppercase tracking-wider text-orange-400">Molduras de avatar</p>
          <div className="flex flex-1 items-center py-4">
            <ProfileAvatar
              key={frame.slug}
              name="Sunano"
              avatarUrl={MASCOT.head}
              size="2xl"
              frameOverride={frame}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
            />
          </div>
          <p className="font-display text-base font-bold text-foreground">{frame.name}</p>
          <p className="text-xs text-muted-foreground">
            Umas se compram, outras se conquistam: VIP, Fundador, pódio do ranking e marcos de Ofensiva
          </p>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-300">
            <MousePointerClick className="size-3.5" />
            Toque para trocar
          </span>
        </button>

        <SpendCard
          icon={<Crown className="size-4" />}
          accent="text-violet-300 bg-violet-500/15"
          title="1 mês de VIP"
          body="Pague o VIP com Aura. Só vale para quem não é VIP agora, por isso não tem desconto"
        />
        <SpendCard
          icon={<PenLine className="size-4" />}
          accent="text-sky-300 bg-sky-500/15"
          title="Trocar de nome"
          body="Um nome novo de exibição, com 3 dias de intervalo entre trocas"
          discount={isVip}
        />
        <SpendCard
          icon={<span className="text-base leading-none">🧊</span>}
          accent="bg-sky-400/15"
          title="Proteção de Ofensiva"
          body={
            <span className="flex items-center gap-2">
              A partir de
              {shieldPrice.discounted && (
                <span className="text-muted-foreground line-through">{shieldPrice.listPrice}</span>
              )}
              <AuraAmount value={shieldPrice.finalPrice} size="xs" tone="brand" className="font-bold text-foreground" />
            </span>
          }
          discount={isVip}
        />
        <SpendCard
          icon={<Medal className="size-4" />}
          accent="text-amber-300 bg-amber-500/15"
          title="Medalhas de evento"
          body="Alguns eventos em Conquistas trocam a medalha por Aura"
          discount={isVip}
        />
        <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-5 sm:col-span-2 lg:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Prêmio físico</p>
              <p className="mt-1 font-display text-base font-bold text-foreground">Periféricos de verdade</p>
            </div>
            <TrustSeal level="very_good" size="sm" showLabel={false} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Estoque limitado, uma unidade por pessoa. Exige Trust Factor Muito Bom ou superior, que vem de tempo
            de casa e histórico limpo
          </p>
          <Link
            href="/informacoes/trust-factor"
            className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:underline"
          >
            Como funciona o Trust Factor
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </section>
  )
}

function SpendCard({
  icon,
  accent,
  title,
  body,
  discount = false,
}: {
  icon: ReactNode
  accent: string
  title: string
  body: ReactNode
  discount?: boolean
}) {
  return (
    <div className={cn("relative flex flex-col gap-2 rounded-2xl border p-5", CARD_SURFACE)}>
      {discount && (
        <span className="absolute right-3 top-3 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-200 motion-safe:animate-in motion-safe:fade-in">
          −{VIP_AURA_DISCOUNT_PERCENT}% VIP
        </span>
      )}
      <span className={cn("flex size-9 items-center justify-center rounded-lg", accent)}>{icon}</span>
      <p className="font-display text-base font-bold text-foreground">{title}</p>
      <div className="text-xs leading-relaxed text-muted-foreground">{body}</div>
    </div>
  )
}

/* ────────────────────────────── 5. Mitos ────────────────────────────── */

function MythsChapter() {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})

  return (
    <section id="mitos" className="scroll-mt-24 space-y-8">
      <ChapterHeading
        number={5}
        eyebrow="Mitos"
        title="Isso dá Aura?"
        lede="As dúvidas que mais aparecem. Vire a carta para ver a resposta"
        mascot="warning"
        mascotAlt="Calopsita de capacete segurando uma placa de atenção"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AURA_NOT_COUNTED_ENTRIES.map((entry) => {
          const isFlipped = !!flipped[entry.id]
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={isFlipped}
              onClick={() => setFlipped((f) => ({ ...f, [entry.id]: !f[entry.id] }))}
              className="group min-h-44 text-left [perspective:1000px]"
            >
              <div
                className={cn(
                  "relative grid h-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none",
                  isFlipped && "[transform:rotateY(180deg)]"
                )}
              >
                <div
                  className={cn(
                    "flex flex-col justify-between gap-4 rounded-2xl border p-5 [backface-visibility:hidden] [grid-area:1/1] group-hover:border-orange-500/40",
                    CARD_SURFACE
                  )}
                >
                  <HelpCircle className="size-5 text-orange-400" />
                  <p className="font-display text-base font-bold leading-snug text-foreground">{entry.question}</p>
                  <span className="text-[11px] font-semibold text-muted-foreground">Toque para virar</span>
                </div>
                <div className="flex flex-col gap-2 rounded-2xl border border-red-400/30 bg-gradient-to-br from-red-500/15 to-background p-5 [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]">
                  <p className="font-display text-lg font-black text-red-300">Não</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{entry.answer}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ────────────────────────────── 6. Limites ────────────────────────────── */

function LimitsChapter() {
  const rows = buildTrustTierRows()

  return (
    <section id="limites" className="scroll-mt-24 space-y-8">
      <ChapterHeading
        number={6}
        eyebrow="Limites"
        title="Quantas reações você pode dar"
        lede={
          <>
            O limite diário de reações vem do seu{" "}
            <Link href="/informacoes/trust-factor" className="text-foreground underline-offset-2 hover:underline">
              Trust Factor
            </Link>
            . É o que impede contas descartáveis de farmar Aura umas para as outras. Ele limita o que você dá, nunca o
            que você ganha
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((row) => (
          <div key={row.tier} className={cn("flex flex-col gap-3 rounded-2xl border p-5", CARD_SURFACE)}>
            <div className="flex items-center gap-3">
              <TrustSeal level={LIMIT_SEAL[row.tier]} size="sm" showLabel={false} />
              <p className="font-display text-base font-bold text-foreground">{row.label}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{row.criteria}</p>
            <dl className="mt-auto space-y-1.5 border-t border-border/60 pt-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Por dia</dt>
                <dd className="text-right font-semibold text-foreground">{row.dailyLimit}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Por pessoa</dt>
                <dd className="text-right font-semibold text-foreground">{row.pairLimit}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        As missões diárias reiniciam à meia-noite UTC, 21h em Brasília
      </p>
    </section>
  )
}

/* ────────────────────────────── Fechamento ────────────────────────────── */

function FinalCta() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/20 via-orange-500/5 to-transparent p-6 sm:p-10">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-orange-500/25 blur-3xl" />
      <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
        <Image
          src={MASCOT.shopping}
          alt=""
          width={384}
          height={384}
          className="aura-guide-float size-32 shrink-0 object-contain sm:size-40"
        />
        <div className="flex-1 space-y-2">
          <p className="aura-title-text font-display text-2xl font-black sm:text-3xl">Bora acender a sua chama?</p>
          <p className="text-sm text-muted-foreground">
            Na Central você vê o seu saldo, as missões de hoje e tudo o que dá para trocar
          </p>
        </div>
        <Link
          href="/aura"
          className="nav-fire-holder inline-flex shrink-0 items-center gap-2 rounded-full border border-orange-500/50 bg-orange-500/15 px-5 py-3 text-sm font-bold text-orange-100 transition-all hover:-translate-y-0.5 hover:bg-orange-500/25"
        >
          <AuraIcon size="sm" />
          Ir para a Central de Aura
          <ArrowDown className="size-4 -rotate-90" />
        </Link>
      </div>
    </div>
  )
}
