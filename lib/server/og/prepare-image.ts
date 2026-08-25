import "server-only"

import sharp from "sharp"

async function fetchImageBytes(url: string): Promise<Buffer | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Baixa a capa do usuário e devolve como data URI JPEG comprimido, pronta
 * pro Satori (`ImageResponse`) compor por cima.
 *
 * `ImageResponse` só gera PNG (lossless) — o tamanho final do arquivo
 * depende da entropia dos pixels que o Satori recebe, não do peso do
 * arquivo original. Uma foto de setup em 1200x630 direto vira ~1MB de PNG,
 * bem acima do ~300KB que o WhatsApp recomenda pro og:image. O corte real
 * de tamanho tem que acontecer aqui, antes do Satori: redimensiona pro
 * tamanho final, desfoca (o fundo só compõe atrás do texto, não precisa de
 * nitidez) e reencoda como JPEG de qualidade baixa — o blur é o que garante
 * a queda de peso, já que reduz a entropia real dos pixels, não só o
 * arquivo de origem.
 *
 * Retorna `null` se o fetch ou o processamento falhar, pro chamador cair no
 * fundo padrão em vez de quebrar a imagem inteira.
 */
export async function prepareOgBannerDataUrl(
  url: string,
  width: number,
  height: number
): Promise<string | null> {
  try {
    const bytes = await fetchImageBytes(url)
    if (!bytes) return null
    // Metade da resolução final: o Satori escala o `<img>` de volta pro
    // tamanho do canvas via width/height, e o upscale suaviza ainda mais o
    // que o blur já suavizou — o PNG final acaba comprimindo bem melhor do
    // que gerar já no tamanho final.
    const jpeg = await sharp(bytes)
      .resize(Math.round(width / 3), Math.round(height / 3), { fit: "cover" })
      .blur(18)
      .jpeg({ quality: 24 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`
  } catch (error) {
    console.error("[opengraph-image] falha ao preparar banner:", error)
    return null
  }
}

/**
 * Baixa o avatar do usuário e devolve como data URI, pro Satori compor.
 *
 * Avatar pode vir de fora do Storage do Supabase (login social — Google,
 * Discord — ver `next.config.mjs` `remotePatterns`). O fetch de imagem
 * embutido do Satori falha em silêncio com alguns desses hosts ("Unsupported
 * image type: unknown" no CDN do Discord, por exemplo, mesmo servindo um
 * PNG válido) — baixar nós mesmos e já entregar bytes decodificados evita
 * depender do content-sniffing dele. Sem blur aqui: o avatar é pequeno
 * (recorte de ~170px no canvas final), contribui pouco pro peso do PNG.
 */
export async function prepareOgAvatarDataUrl(url: string, size: number): Promise<string | null> {
  try {
    const bytes = await fetchImageBytes(url)
    if (!bytes) return null
    const jpeg = await sharp(bytes)
      .resize(size, size, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`
  } catch (error) {
    console.error("[opengraph-image] falha ao preparar avatar:", error)
    return null
  }
}
