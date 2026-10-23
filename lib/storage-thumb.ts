/**
 * Miniaturas das imagens do Storage, geradas NO UPLOAD.
 *
 * Por que existe: nenhum transformador de imagem roda em runtime (o da Vercel
 * e o `render/image` do Supabase são pagos e estão desligados — ver
 * `lib/storage-image.ts`). Sem isso o navegador recebia o arquivo inteiro em
 * toda tela: item da Aura de 1600px num card de 166px, foto de periférico de
 * 1274px num ícone de 64px. Na home do celular eram 2,2MB de imagem para
 * desenhar cards pequenos, e é esse peso que derrubava o LCP do PageSpeed.
 *
 * Como funciona: ao subir uma imagem, `createImageThumbnails`
 * (`lib/server/image-thumbnails.ts`) grava, no MESMO bucket, uma cópia WebP
 * por largura de `THUMB_WIDTHS` em `_thumbs/w<largura>/<path original>.webp`.
 * O path é derivado do original, então nenhuma coluna do banco muda: quem
 * renderiza troca a URL na hora, aqui.
 *
 * - A extensão original fica no nome (`foto.png.webp`): é o que permite ao
 *   fallback de `IMAGE_THUMB_FALLBACK_SCRIPT` voltar ao original sem
 *   adivinhar a extensão.
 * - GIF vira WebP ANIMADO (`sharp` com `animated: true`): a miniatura do
 *   avatar animado continua animada.
 * - Miniatura que não existe (upload anterior ao backfill, caminho de upload
 *   esquecido) nunca quebra a tela: o script global troca a `<img>` pelo
 *   original no primeiro erro. Fica mais pesada, não fica quebrada.
 *
 * Módulo puro: roda no servidor, no cliente e no loader do `next/image`.
 */

/** Larguras geradas, em px. Ordem crescente — `pickThumbWidth` depende disso. */
export const THUMB_WIDTHS = [128, 256, 512, 1024] as const

export type ThumbWidth = (typeof THUMB_WIDTHS)[number]

/** Prefixo das miniaturas dentro de cada bucket. */
export const THUMB_PREFIX = "_thumbs"

/** Buckets PÚBLICOS que recebem miniatura. `support` é privado (URL assinada). */
export const THUMB_BUCKETS = ["peripherals", "images", "store-banners", "comments", "store-reviews"] as const

const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/"
const THUMBNAILABLE_EXTENSION = /\.(jpe?g|png|webp|gif)$/i

/** Path da miniatura dentro do bucket, a partir do path do original. */
export function thumbObjectPath(path: string, width: ThumbWidth): string {
  return `${THUMB_PREFIX}/w${width}/${path}.webp`
}

/** O original e todas as miniaturas dele — para apagar tudo junto. */
export function withThumbnailPaths(paths: string[]): string[] {
  const out: string[] = []
  for (const path of paths) {
    out.push(path)
    if (isThumbnailablePath(path)) {
      for (const width of THUMB_WIDTHS) out.push(thumbObjectPath(path, width))
    }
  }
  return out
}

/** Arquivo de imagem que recebe miniatura (e não é, ele mesmo, uma miniatura). */
export function isThumbnailablePath(path: string): boolean {
  return !path.startsWith(`${THUMB_PREFIX}/`) && THUMBNAILABLE_EXTENSION.test(path)
}

/** Menor miniatura que cobre `width`, ou `null` quando só o original serve. */
export function pickThumbWidth(width: number): ThumbWidth | null {
  for (const candidate of THUMB_WIDTHS) {
    if (candidate >= width) return candidate
  }
  return null
}

type ParsedStorageUrl = { base: string; bucket: string; path: string }

function parsePublicStorageUrl(url: string): ParsedStorageUrl | null {
  // Query ou fragmento: URL assinada, cache-buster ou algo que não geramos.
  if (url.includes("?") || url.includes("#")) return null
  const index = url.indexOf(PUBLIC_OBJECT_SEGMENT)
  if (index <= 0) return null
  const base = url.slice(0, index + PUBLIC_OBJECT_SEGMENT.length)
  // Só o Storage do Supabase: a mesma forma de caminho em outro host não é nossa.
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/$/i.test(base)) {
    return null
  }
  const rest = url.slice(base.length)
  const slash = rest.indexOf("/")
  if (slash <= 0) return null
  const bucket = rest.slice(0, slash)
  const path = rest.slice(slash + 1)
  if (!(THUMB_BUCKETS as readonly string[]).includes(bucket)) return null
  if (!isThumbnailablePath(path)) return null
  return { base, bucket, path }
}

/**
 * URL da miniatura de `url` para exibir em `width` px REAIS (já multiplicado
 * pela densidade, se for o caso). Devolve `url` intacta quando não é imagem
 * nossa ou quando nenhuma miniatura é larga o bastante.
 */
export function storageThumbUrl(url: string, width: number): string {
  const parsed = parsePublicStorageUrl(url)
  if (!parsed) return url
  const thumb = pickThumbWidth(width)
  if (!thumb) return url
  return `${parsed.base}${parsed.bucket}/${thumbObjectPath(parsed.path, thumb)}`
}

/**
 * `src` + `srcSet` para uma `<img>` exibida a `displayWidth` px CSS.
 *
 * O `src` é a versão 2x (a densidade mais comum em celular); o `srcSet` dá
 * 1x/2x/3x para o navegador escolher. Espalhe direto na tag:
 * `<img {...storageImgProps(url, 166)} alt="" />`. URL externa (YouTube,
 * login social, /public) volta só com `src`.
 */
export function storageImgProps(
  url: string,
  displayWidth: number
): { src: string; srcSet?: string } {
  if (!parsePublicStorageUrl(url)) return { src: url }
  const candidates = [1, 2, 3].map((density) => {
    const target = Math.ceil(displayWidth * density)
    return `${storageThumbUrl(url, target)} ${density}x`
  })
  return { src: storageThumbUrl(url, displayWidth * 2), srcSet: candidates.join(", ") }
}

/**
 * `srcSet` por LARGURA (`128w … 1024w` + o original) para imagem de largura
 * fluida, como banner de largura cheia: use junto de `sizes`. O original
 * entra como `2048w` (nenhum upload passa de 1920px), então tela larga
 * continua recebendo o arquivo cheio — a fidelidade do desktop não muda.
 * `undefined` para URL que não é imagem nossa.
 */
export function storageWidthSrcSet(url: string): string | undefined {
  if (!parsePublicStorageUrl(url)) return undefined
  return [
    ...THUMB_WIDTHS.map((width) => `${storageThumbUrl(url, width)} ${width}w`),
    `${url} 2048w`,
  ].join(", ")
}

/**
 * Proxy de mídia de perfil (`/api/profile-media/<id>/<campo>`) com a largura
 * pedida: a rota redireciona para a miniatura certa. Sem isso o avatar de
 * 32px baixava o GIF inteiro de 400KB.
 */
export function profileMediaWithWidth(url: string, width: number): string {
  if (!url.startsWith("/api/profile-media/") || url.includes("?")) return url
  const thumb = pickThumbWidth(width)
  return thumb ? `${url}?w=${thumb}` : url
}

/**
 * Rede de segurança das miniaturas, inline no `<head>` (antes de qualquer
 * `<img>` do HTML do servidor): quando uma miniatura falha, a `<img>` volta
 * para o original e perde o `srcset`. Cobre também o proxy de perfil com
 * `?w=`. Escuta em captura na `window` porque `error` de imagem não borbulha.
 *
 * O `ImageWithFallback` ignora esse primeiro erro (ver lá), senão ele
 * trocaria a foto pelo fallback antes de a segunda tentativa acontecer.
 */
export const IMAGE_THUMB_FALLBACK_SCRIPT = `(function(){addEventListener("error",function(e){var t=e.target;if(!t||t.tagName!=="IMG")return;var s=t.currentSrc||t.src||"";var o=null;var m=s.match(/^(.*\\/storage\\/v1\\/object\\/public\\/[^/]+\\/)_thumbs\\/w\\d+\\/(.+)\\.webp$/);if(m){o=m[1]+m[2]}else if(/\\/api\\/profile-media\\/[^?]+\\?w=\\d+$/.test(s)){o=s.replace(/\\?w=\\d+$/,"")}if(!o)return;var p=t.parentElement;if(p&&p.tagName==="PICTURE"){var c=p.querySelectorAll("source");for(var i=0;i<c.length;i++)c[i].removeAttribute("srcset")}t.removeAttribute("srcset");t.removeAttribute("sizes");t.src=o},true)})();`

/** A URL que falhou é uma miniatura que o script acima vai trocar pelo original. */
export function isRetryableThumbUrl(url: string): boolean {
  return /\/_thumbs\/w\d+\//.test(url) || /\/api\/profile-media\/[^?]+\?w=\d+$/.test(url)
}
