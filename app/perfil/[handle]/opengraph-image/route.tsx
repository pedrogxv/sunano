import { readFileSync } from "node:fs"
import path from "node:path"

import { ImageResponse } from "next/og"

import { isVipActive } from "@/lib/account-tier"
import { resolveProfileUserId } from "@/lib/server/profile-handle"
import { loadGoogleFontTtf } from "@/lib/server/og/load-google-font"
import { prepareOgAvatarDataUrl, prepareOgBannerDataUrl } from "@/lib/server/og/prepare-image"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import { supabaseResizedImage } from "@/lib/storage-image"

/**
 * Preview de compartilhamento do perfil (`/perfil/[handle]`) — avatar, nome
 * e as três estatísticas de destaque sobre o banner do usuário, no estilo
 * AniList. `generateMetadata` da página aponta `og:image`/`twitter:image`
 * pra cá; ver comentário lá sobre o fallback quando o perfil não existe.
 *
 * Cada requisição roda a mesma agregação pesada de `getProfileShowcase`
 * (o `React.cache` da função só depedupe dentro de uma mesma requisição —
 * o crawler busca a página e a imagem em requisições HTTP separadas). Ainda
 * assim reaproveitamos a função em vez de duplicar as ~17 queries: preview
 * de link é raro perto do volume de visitas normais à página.
 */
export const dynamic = "force-dynamic"

const WIDTH = 1200
const HEIGHT = 630

/** Aproximação hex de `--vip-accent` (oklch(0.75 0.19 320)) — Satori não lê oklch()/var(). */
const VIP_ACCENT = "#e26bd8"
const BORDER = "#333333"
const MUTED = "#1a1a1a"
const MUTED_FG = "#999999"

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return String(value)
}

let cachedIconDataUrl: string | null = null

/** Marca d'água do fundo padrão, embutida como data URI — evita depender de a rota conseguir buscar a própria URL pública durante o render. */
function getIconDataUrl(): string {
  if (!cachedIconDataUrl) {
    const bytes = readFileSync(path.join(process.cwd(), "public/images/mascot/sunano-icon.png"))
    cachedIconDataUrl = `data:image/png;base64,${bytes.toString("base64")}`
  }
  return cachedIconDataUrl
}

/**
 * Charset fixo (Latin básico + acentuação PT-BR + pontuação comum) em vez do
 * texto de cada perfil: baixar a fonte por nome/slug tornava toda imagem
 * dependente de uma chamada de rede ao Google Fonts a cada preview — o
 * gerador chegou a levar 15s numa medição, bem acima do timeout que
 * WhatsApp/Discord/Telegram costumam dar pra gerar o preview do link antes
 * de desistir e não mostrar imagem nenhuma. Com um charset fixo, a fonte é
 * baixada uma vez por instância (módulo fica com o resultado em memória) e
 * as próximas requisições nem tocam a rede. Nome com caractere fora desse
 * conjunto (ex.: CJK, emoji) só perde o glifo — não quebra a imagem.
 */
const FONT_CHARSET =
  " !@.,_-0123456789" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
  "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇñÑ"

let cachedFontsPromise: Promise<
  { name: string; data: ArrayBuffer; weight: 800 | 500; style: "normal" }[]
> | null = null

function loadFonts() {
  if (!cachedFontsPromise) {
    cachedFontsPromise = Promise.all([
      loadGoogleFontTtf("Manrope", 800, FONT_CHARSET),
      loadGoogleFontTtf("Manrope", 500, FONT_CHARSET),
    ])
      .then(([bold, medium]) => [
        { name: "Manrope", data: bold, weight: 800 as const, style: "normal" as const },
        { name: "Manrope", data: medium, weight: 500 as const, style: "normal" as const },
      ])
      .catch((error) => {
        console.error("[opengraph-image] falha ao carregar fonte:", error)
        cachedFontsPromise = null
        return []
      })
  }
  return cachedFontsPromise
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params
  const userId = await resolveProfileUserId(handle)
  const profile = userId ? await getProfileShowcase(userId) : null

  const name = profile?.display_name ?? "Sunano"
  const slug = profile?.display_slug ?? null
  const rawAvatarUrl = profile?.avatar_url ? supabaseResizedImage(profile.avatar_url, { width: 336 }) : null
  const rawBannerUrl = profile?.banner_url ? supabaseResizedImage(profile.banner_url, { width: WIDTH }) : null
  const [avatarDataUrl, bannerDataUrl] = await Promise.all([
    rawAvatarUrl ? prepareOgAvatarDataUrl(rawAvatarUrl, 336) : Promise.resolve(null),
    rawBannerUrl ? prepareOgBannerDataUrl(rawBannerUrl, WIDTH, HEIGHT) : Promise.resolve(null),
  ])
  const vip = profile ? isVipActive(profile.account_tier, profile.vip_expires_at) : false
  const iconDataUrl = getIconDataUrl()

  const stats = profile
    ? [
        { label: "Aura", value: profile.aura },
        { label: "Reviews", value: profile.reviews_total },
        { label: "Medalhas", value: profile.medals_total },
      ]
    : []

  const fonts = await loadFonts()

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          position: "relative",
          backgroundColor: "#050505",
          fontFamily: "Manrope",
        }}
      >
        {bannerDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerDataUrl}
            width={WIDTH}
            height={HEIGHT}
            style={{ position: "absolute", inset: 0, objectFit: "cover" }}
          />
        ) : (
          <>
            <div
              style={{
                position: "absolute",
                top: -180,
                right: -120,
                width: 620,
                height: 620,
                borderRadius: 9999,
                display: "flex",
                background: "radial-gradient(circle, rgba(249,115,22,0.35) 0%, rgba(249,115,22,0) 70%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: -220,
                left: -160,
                width: 620,
                height: 620,
                borderRadius: 9999,
                display: "flex",
                background: `radial-gradient(circle, ${VIP_ACCENT}33 0%, rgba(226,107,216,0) 70%)`,
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconDataUrl}
              width={340}
              height={340}
              style={{ position: "absolute", right: 24, bottom: -40, opacity: 0.14 }}
            />
          </>
        )}

        {/* Escurece a base pra legibilidade e mantém o PNG leve — sem isso
            um banner cheio de detalhe passa longe do limite de ~300KB que o
            WhatsApp recomenda pro og:image. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.96) 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 40,
            left: 56,
            display: "flex",
            alignItems: "center",
            gap: 12,
            opacity: 0.9,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconDataUrl} width={36} height={36} style={{ borderRadius: 8 }} />
          <span style={{ display: "flex", color: "#FFFFFF", fontSize: 22, fontWeight: 500, letterSpacing: 1 }}>
            SUNANO
          </span>
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "flex-end",
            gap: 40,
            padding: "0 64px 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 168,
              height: 168,
              borderRadius: 28,
              border: `5px solid ${vip ? VIP_ACCENT : BORDER}`,
              backgroundColor: MUTED,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarDataUrl} width={168} height={168} style={{ objectFit: "cover" }} />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 56,
                  fontWeight: 800,
                  color: "#FFFFFF",
                }}
              >
                {name.trim().slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 20, paddingBottom: 6 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  style={{
                    display: "flex",
                    color: "#FFFFFF",
                    fontSize: 54,
                    fontWeight: 800,
                    lineHeight: 1.05,
                    maxWidth: 760,
                    overflow: "hidden",
                  }}
                >
                  {name}
                </span>
                {vip && (
                  <span
                    style={{
                      display: "flex",
                      backgroundColor: VIP_ACCENT,
                      color: "#000000",
                      fontSize: 18,
                      fontWeight: 800,
                      padding: "4px 14px",
                      borderRadius: 9999,
                      letterSpacing: 1,
                    }}
                  >
                    VIP
                  </span>
                )}
              </div>
              {slug && (
                <span style={{ display: "flex", color: MUTED_FG, fontSize: 26, fontWeight: 500 }}>@{slug}</span>
              )}
            </div>

            {stats.length > 0 && (
              <div style={{ display: "flex", gap: 56 }}>
                {stats.map((stat) => (
                  <div key={stat.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ display: "flex", color: "#FFFFFF", fontSize: 40, fontWeight: 800 }}>
                      {formatCount(stat.value)}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        color: MUTED_FG,
                        fontSize: 16,
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: 2,
                      }}
                    >
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      // Só passa `fonts` quando o download deu certo — um array vazio faz o
      // Satori recusar a imagem ("No fonts are loaded"), em vez de cair na
      // fonte padrão que `ImageResponse` usa quando a chave nem é passada.
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  )
}
