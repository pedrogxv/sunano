import "server-only"

import sharp from "sharp"

/**
 * Compressão de imagem no servidor, na hora do upload.
 *
 * Por que aqui e não em runtime: os DOIS transformadores de imagem que já
 * usamos estão fora. O otimizador da Vercel (`/_next/image`) estourou a cota
 * e passou a responder 402 — por isso `next.config.mjs` usa `loader: "custom"`
 * (ver `lib/image-loader.ts`). O `render/image` do Supabase Storage responde
 * `403 FeatureNotEnabled`: é add-on pago, não bug. Nenhum dos dois volta.
 *
 * A saída então é gravar o arquivo JÁ pequeno no bucket: o navegador continua
 * recebendo o objeto original de `object/public`, só que o "original" passa a
 * ter ~45KB em vez de ~550KB. Custo zero em runtime, nada para reativar.
 *
 * Contexto do problema (auditoria de 2026-08-28): o bucket `peripherals`
 * tinha 1235 arquivos somando 664MB, média de 550KB, e a home baixava 10,5MB
 * de imagem só para desenhar cards de 200–400px. ~125GB/mês de egresso.
 *
 * GIF nunca é tocado: `sharp` sem `{ animated: true }` devolve um único
 * quadro, e o banner animado do VIP chegaria parado no bucket. Mesmo motivo
 * do `SKIP_MIME_TYPES` em `lib/client/compress-image.ts` e do enquadramento
 * não-destrutivo de `lib/profile-media-adjust.ts`.
 */

export type CompressImageOptions = {
  /** Maior dimensão (largura ou altura) da saída, em px. Não amplia imagem menor. */
  maxDimension: number
  /** Qualidade do WebP de saída (1–100). */
  quality?: number
}

export type CompressedImage = {
  bytes: Uint8Array
  mime: string
  extension: string
}

/** GIF preserva animação; o resto é convertido para WebP, que é sempre menor. */
const SKIP_MIME_TYPES = new Set(["image/gif"])

/**
 * Recomprime a imagem para WebP dentro de `maxDimension`.
 *
 * Devolve sempre algo utilizável: se o `sharp` falhar (arquivo corrompido,
 * formato exótico) ou se o resultado ficar maior que a entrada — acontece com
 * imagem já otimizada, ou PNG pequeno de arte chapada — os bytes originais
 * voltam intactos. Nunca deixa o upload falhar por causa da compressão.
 *
 * Os bytes de entrada já passaram por `validateImageUpload` (magic bytes), e
 * o `sharp` é decodificador nativo: não confia no `mime` declarado pelo
 * cliente para decidir o que fazer.
 */
export async function compressUploadedImage(
  bytes: Uint8Array,
  mime: string,
  options: CompressImageOptions
): Promise<CompressedImage> {
  const original: CompressedImage = {
    bytes,
    mime,
    extension:
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : "jpg",
  }

  if (SKIP_MIME_TYPES.has(mime)) return original

  try {
    const output = await sharp(bytes, { failOn: "none" })
      .rotate() // aplica a orientação EXIF antes de redimensionar, senão a foto sai deitada
      .resize({
        width: options.maxDimension,
        height: options.maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: options.quality ?? 80 })
      .toBuffer()

    if (output.byteLength >= bytes.byteLength) return original

    return {
      bytes: new Uint8Array(output),
      mime: "image/webp",
      extension: "webp",
    }
  } catch {
    return original
  }
}

/**
 * Presets por tipo de conteúdo. A dimensão vem do maior tamanho em que a
 * imagem é realmente exibida no layout, com folga para telas 2x — passar
 * disso é banda paga para pixel que ninguém vê.
 */
export const IMAGE_PRESETS = {
  /** Card de periférico/produto e galeria com zoom (o zoom usa a mesma imagem). */
  product: { maxDimension: 1600, quality: 80 },
  /** Banner de topo e capa de blog — largura cheia, mas nunca acima de 1920. */
  banner: { maxDimension: 1920, quality: 80 },
  /** Anexo de comentário, post do fórum e ticket de suporte. */
  content: { maxDimension: 1280, quality: 78 },
  /** Avatar e ícone pequeno — exibido no máximo a ~200px. */
  avatar: { maxDimension: 512, quality: 82 },
} as const satisfies Record<string, CompressImageOptions>

/**
 * `cacheControl` para `.upload()` do Storage.
 *
 * O padrão do Supabase é 3600 (1 hora), o que fazia todo visitante recorrente
 * rebaixar as mesmas imagens várias vezes ao dia. Os nomes de arquivo são
 * imutáveis (`timestamp-uuid.ext` ou `prefixo-userid-timestamp.ext`) e uma
 * troca de imagem sempre gera um nome novo, então cachear por um ano é seguro
 * — nunca existe o caso de "mesmo path, conteúdo diferente" a invalidar.
 */
export const IMMUTABLE_CACHE_CONTROL = "31536000"
