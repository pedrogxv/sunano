/**
 * Redimensionamento de imagens pelo próprio Supabase Storage.
 *
 * O otimizador da Vercel (`/_next/image`) é cobrado por transformação e, com
 * a cota estourada, responde 402 em vez de servir a imagem — o `<img>` quebra
 * e o `alt` vaza na tela. Como o cache dele dura 31 dias
 * (`minimumCacheTTL` em next.config.mjs), imagens antigas continuam
 * aparecendo e só o que é enviado depois disso quebra, o que faz o problema
 * parecer restrito a "usuários novos".
 *
 * O endpoint `render/image` do storage faz o mesmo trabalho sem passar pela
 * Vercel: um avatar de 86px sai com ~4 KB no lugar dos ~50 KB do original.
 * O custo do Supabase é por imagem de origem distinta por mês, não por
 * requisição — escala com o número de perfis, não com o tráfego.
 *
 * URLs de fora (foto do Google/Discord vinda do login social) não têm esse
 * endpoint e são devolvidas intactas.
 */

/** Trecho que identifica um objeto público do Supabase Storage. */
const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/"
const RENDER_IMAGE_SEGMENT = "/storage/v1/render/image/public/"

/** Qualidade padrão: acima disso o ganho visual não paga o peso do arquivo. */
const DEFAULT_QUALITY = 80

/**
 * URL da imagem já redimensionada pelo storage. Devolve a original quando ela
 * não é um objeto público do nosso bucket (foto do Google/Discord, arquivo
 * estático de /public).
 *
 * `width` é a largura do arquivo final em pixels — quem chama deve dobrar a
 * medida de exibição para telas retina.
 *
 * `resize=contain` com apenas a largura escala proporcionalmente, que é o que
 * o `next/image` sempre entregou: o arquivo mantém a proporção original e o
 * enquadramento fica por conta do CSS (`object-cover`/`object-contain`).
 * Passar `cover` sem altura NÃO faz isso — o storage mantém a altura original
 * e devolve a imagem esmagada.
 */
export function supabaseResizedImage(
  url: string,
  options: { width: number; quality?: number }
): string {
  if (!url.includes(PUBLIC_OBJECT_SEGMENT)) return url

  // Descarta querystring existente: os parâmetros de transformação são a
  // única query que o endpoint de render entende.
  const [path] = url.split("?")

  const params = new URLSearchParams({
    width: String(options.width),
    resize: "contain",
    quality: String(options.quality ?? DEFAULT_QUALITY),
  })

  return `${path.replace(PUBLIC_OBJECT_SEGMENT, RENDER_IMAGE_SEGMENT)}?${params.toString()}`
}
