import { ImageResponse } from "next/og"
import type { NextRequest } from "next/server"

import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_NAME } from "@/lib/seo"
import { SITE_URL } from "@/lib/site-url"

/**
 * Gerador de card social (1200×630).
 *
 * Por que gerar em vez de apontar direto para a imagem do conteúdo:
 *
 * - **Proporção.** Foto de produto é quadrada, avatar é 1:1, capa de blog é
 *   16:9. Servidas cruas viram card esticado ou recortado no meio do assunto
 *   ("share images … aspect ratio is off" na auditoria). Aqui toda imagem é
 *   composta dentro de uma moldura 1.91:1 correta.
 * - **Tamanho mínimo.** Avatar de 96px publicado como `og:image` fica abaixo
 *   do mínimo do X/Facebook e é descartado. O card sempre sai em 1200×630.
 * - **Cobertura.** Página sem imagem nenhuma (categoria do fórum, ranking,
 *   tierlist) deixava de ter card. Agora recebe um card tipográfico com o
 *   título — nunca mais um preview vazio.
 *
 * Runtime Node.js (padrão): `edge` não traz vantagem aqui e limita o fetch da
 * imagem de conteúdo. A resposta é cacheada agressivamente porque o card só
 * muda quando os parâmetros mudam.
 */

/** Card é conteúdo derivado e imutável por parâmetro — cache longo na CDN. */
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"

/** Limite defensivo do texto desenhado (o layout é calibrado para isso). */
const TITLE_LIMIT = 120
const SUBTITLE_LIMIT = 120
const EYEBROW_LIMIT = 40

/**
 * Só compomos imagem vinda de origem conhecida.
 *
 * Sem isso o endpoint vira proxy aberto: qualquer um monta
 * `/api/og?image=<url arbitrária>` e faz o servidor buscar o que quiser,
 * inclusive endereços internos (SSRF). A lista espelha `remotePatterns` do
 * next.config.mjs.
 */
const ALLOWED_IMAGE_HOSTS = [
  "pwbkzjknstbqqemqyppm.supabase.co",
  "images.unsplash.com",
  "i.ytimg.com",
  "img.youtube.com",
  "github.com",
  "avatars.githubusercontent.com",
  "lh3.googleusercontent.com",
  "cdn.discordapp.com",
]

function safeImageUrl(raw: string | null): string | undefined {
  if (!raw) return undefined

  try {
    // Caminho relativo do próprio site é sempre aceito.
    const parsed = new URL(raw, SITE_URL)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined
    if (parsed.origin === SITE_URL) return parsed.toString()
    if (ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)) return parsed.toString()
    return undefined
  } catch {
    return undefined
  }
}

/** Acima disso a imagem não vale o custo de decodificar dentro do card. */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024

/** PNG 1×1 transparente, usado para validar que o conversor realmente roda. */
const PROBE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

/** Quanto esperamos pela imagem de conteúdo antes de desistir dela. */
const IMAGE_FETCH_TIMEOUT_MS = 4000

type ImageConverter = (input: Buffer) => Promise<Buffer>

/** Memoiza a resolução do módulo entre invocações da mesma instância. */
let converterPromise: Promise<ImageConverter | null> | undefined

/**
 * Resolve um conversor de imagem para PNG.
 *
 * O Satori (motor do `next/og`) decodifica só PNG e JPEG, e os uploads do site
 * são majoritariamente WebP — sem conversão o card sai com a moldura vazia.
 *
 * `sharp` é um módulo **nativo** e foi a causa de o `og:image` ter respondido
 * 500 em produção: o binário linux-x64 (`libvips-cpp.so`) não chegava ao bundle
 * da função na Vercel. Duas medidas fecham isso:
 *
 * - `sharp` e `@img/sharp-wasm32` estão em `dependencies` (não em `dev` nem em
 *   opcional). O wasm32 não é importado direto — quem o carrega é o próprio
 *   `sharp`, como fallback automático quando não acha binário nativo para a
 *   plataforma. Por ser WebAssembly, ele não depende de `.so` nenhum.
 * - A sonda abaixo confirma que a conversão roda de fato antes de prometermos
 *   que ela funciona.
 *
 * Se nada resolver, devolvemos `null` e o card sai sem a imagem — nunca um erro.
 */
async function loadImageConverter(): Promise<ImageConverter | null> {
  converterPromise ??= (async () => {
    try {
      const sharp = (await import("sharp")).default
      // Uma conversão real: o `import` sozinho não dispara o dlopen do binário,
      // então um `sharp` sem libvips passaria daqui e só falharia na primeira
      // imagem de verdade — já dentro do render do card.
      await sharp(Buffer.from(PROBE_PNG_BASE64, "base64")).png().toBuffer()

      return (input: Buffer) =>
        sharp(input)
          // `inside` preserva a proporção original; o recorte final
          // (cover/contain) fica com o CSS do card.
          .resize(860, 860, { fit: "inside", withoutEnlargement: true })
          .png({ quality: 90 })
          .toBuffer()
    } catch (error) {
      console.error("[api/og] sharp indisponível, card sai sem imagem:", error)
      return null
    }
  })()

  return converterPromise
}

/**
 * Baixa a imagem do conteúdo e devolve um data URI PNG.
 *
 * O Satori (motor do `next/og`) decodifica só PNG e JPEG. Os uploads do site
 * são majoritariamente **WebP** — e WebP/AVIF/GIF entram no `<img>` como um
 * quadro vazio, sem erro nenhum: o card saía com a moldura em branco no lugar
 * da foto. `sharp` (já usado pelo Next) normaliza qualquer formato para PNG.
 *
 * Redimensionar aqui também corta o peso do card: a origem costuma ter
 * 1920px de largura e só ~430px são desenhados.
 *
 * Falha nunca derruba o card — sem imagem ele volta a ser o card tipográfico,
 * que continua sendo um preview válido.
 */
async function loadImageAsDataUri(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      headers: { accept: "image/*" },
    })
    if (!response.ok) return undefined

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.startsWith("image/")) return undefined

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_SOURCE_BYTES) return undefined

    const convert = await loadImageConverter()
    if (!convert) return undefined

    const png = await convert(buffer)
    return `data:image/png;base64,${png.toString("base64")}`
  } catch (error) {
    console.error("[api/og] falha ao preparar a imagem de conteúdo:", error)
    return undefined
  }
}

/**
 * Tamanho da fonte do título conforme o comprimento.
 *
 * Título curto ganha corpo grande e ocupa o card; título longo encolhe para
 * caber sem estourar a caixa. `next/og` não tem auto-fit, então o degrau é
 * calculado aqui.
 */
function titleFontSize(length: number): number {
  if (length <= 30) return 76
  if (length <= 55) return 64
  if (length <= 80) return 54
  return 46
}

/**
 * Card mínimo, só com a marca.
 *
 * Rede de segurança para quando o card completo falha por qualquer motivo:
 * é melhor entregar um preview simples que uma resposta 500, porque o
 * crawler do Facebook/X cacheia a falha e o link fica sem imagem por dias
 * mesmo depois de o bug ser corrigido.
 */
function fallbackCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          background: "#000000",
          fontFamily: "sans-serif",
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>
          {SITE_NAME}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#A3A3A3" }}>
          Tierlist de Periféricos
        </div>
      </div>
    ),
    { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }
  )
}

export async function GET(request: NextRequest) {
  try {
    return await renderCard(request)
  } catch (error) {
    console.error("[api/og] falha ao gerar o card:", error)
    const fallback = fallbackCard()
    // Cache curto: a falha pode ser transitória e não deve ficar grudada na
    // CDN como o card bom fica.
    fallback.headers.set("Cache-Control", "public, max-age=60, s-maxage=60")
    return fallback
  }
}

async function renderCard(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const title = (searchParams.get("title") ?? SITE_NAME).slice(0, TITLE_LIMIT)
  const eyebrow = searchParams.get("eyebrow")?.slice(0, EYEBROW_LIMIT)
  const subtitle = searchParams.get("subtitle")?.slice(0, SUBTITLE_LIMIT)
  const imageSource = safeImageUrl(searchParams.get("image"))
  const image = imageSource ? await loadImageAsDataUri(imageSource) : undefined
  const variant = searchParams.get("variant") ?? "cover"

  // Avatar e produto ficam num quadro quadrado ao lado do texto; capa ocupa a
  // faixa inteira à direita. Em ambos os casos a proporção do card é fixa.
  const isSquare = variant === "avatar" || variant === "product"

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          // Brilho sutil no canto: evita o card chapado sem depender de asset.
          backgroundImage:
            "radial-gradient(circle at 88% 12%, rgba(255,255,255,0.14) 0%, rgba(0,0,0,0) 46%)",
          padding: 64,
          fontFamily: "sans-serif",
          color: "#FFFFFF",
        }}
      >
        {/* Faixa da marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "#FFFFFF",
              color: "#000000",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
            {SITE_NAME}
          </div>
          {eyebrow ? (
            <div
              style={{
                display: "flex",
                marginLeft: 6,
                padding: "8px 18px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 22,
                fontWeight: 600,
                color: "#D4D4D4",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
        </div>

        {/* Corpo: texto à esquerda, imagem do conteúdo à direita */}
        <div style={{ display: "flex", alignItems: "center", gap: 48, flex: 1, paddingTop: 36 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: titleFontSize(title.length),
                fontWeight: 700,
                lineHeight: 1.12,
                letterSpacing: -1.5,
              }}
            >
              {title}
            </div>
            {subtitle ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 24,
                  fontSize: 28,
                  lineHeight: 1.35,
                  color: "#A3A3A3",
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>

          {image ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: isSquare ? 340 : 430,
                height: isSquare ? 340 : 300,
                borderRadius: variant === "avatar" ? 999 : 24,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "#0A0A0A",
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt=""
                width={isSquare ? 340 : 430}
                height={isSquare ? 340 : 300}
                style={{
                  // `product` usa contain: recortar uma foto de produto corta o
                  // próprio produto. Capa e avatar usam cover, que preenche.
                  objectFit: variant === "product" ? "contain" : "cover",
                  // O raio precisa vir na própria <img>: o Satori não recorta o
                  // filho pelo `overflow: hidden` do pai como o navegador faz,
                  // então o avatar saía quadrado por cima da moldura redonda.
                  borderRadius: variant === "avatar" ? 999 : 24,
                }}
              />
            </div>
          ) : null}
        </div>

        {/* Rodapé com o domínio: dá procedência ao card quando ele é
            reproduzido fora do site. */}
        <div style={{ display: "flex", fontSize: 24, color: "#737373" }}>sunano.com.br</div>
      </div>
    ),
    {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    }
  )

  response.headers.set("Cache-Control", CACHE_CONTROL)
  return response
}
