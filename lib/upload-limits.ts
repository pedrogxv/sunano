/**
 * Teto de tamanho de upload — fonte única para servidor E cliente.
 *
 * Por que existe: os limites viviam soltos em cada rota (5MB, 15MB, 16MB…) e
 * vários passavam do que a plataforma realmente entrega, então o número
 * anunciado ao usuário não era o número aplicado. Um arquivo entre o limite
 * anunciado e o limite real era aceito "no papel" e morria antes de a rota
 * rodar, devolvendo texto puro ("Request Entity Too Large") que o `res.json()`
 * do front não parseia — o bug do form de Itens de Aura em 2026-09-09.
 *
 * O teto de verdade é o do proxy, não o da function. `proxy.ts` casa com
 * `/api/*`, e o Next bufferiza o corpo de toda request que passa por proxy
 * com um limite padrão de 10MB (`experimental.proxyClientMaxBodySize`).
 * Estourar esse buffer é PIOR que um erro: o Next trunca o corpo, loga um
 * aviso e deixa a request seguir — a rota receberia um arquivo cortado e
 * gravaria uma imagem corrompida no bucket, sem erro nenhum. Por isso o teto
 * aqui fica abaixo do buffer, com folga para o overhead do multipart
 * (boundary + headers de cada parte, que contam no corpo).
 *
 * Ao mexer nestes valores, mexer junto em `proxyClientMaxBodySize` no
 * next.config.mjs — os dois formam um par: este é o que se promete ao
 * usuário, aquele é o que a plataforma aguenta.
 */

/** Buffer de corpo do proxy, espelhado de `experimental.proxyClientMaxBodySize`. */
export const PROXY_BODY_BUFFER_BYTES = 24 * 1024 * 1024

/** Folga para o envelope multipart, que também ocupa espaço no corpo. */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024

/**
 * Maior arquivo que uma rota de upload pode aceitar sem risco de truncamento.
 * Nenhum limite abaixo deve passar disso.
 */
export const MAX_UPLOAD_BYTES = PROXY_BODY_BUFFER_BYTES - MULTIPART_OVERHEAD_BYTES

/**
 * Limites por tipo de conteúdo. São tetos de segurança, não alvos: as imagens
 * já são comprimidas no cliente (`lib/client/compress-image.ts`) e de novo no
 * servidor (`lib/server/image-compression.ts`), então o que chega ao bucket é
 * uma fração disso. O limite existe para barrar abuso e o arquivo que a
 * compressão não conseguiu reduzir.
 */
export const UPLOAD_LIMITS = {
  /** Imagem de conteúdo administrativo: produto, periférico, banner, capa, item de Aura. */
  image: 20 * 1024 * 1024,
  /** Mídia de perfil (avatar, banner, mini banner) — enviada já enquadrada pelo cliente. */
  profileMedia: 16 * 1024 * 1024,
  /** Anexo de post do fórum e do Mercado. */
  userContent: 10 * 1024 * 1024,
  /** Anexo de ticket de suporte. */
  support: 5 * 1024 * 1024,
  /** Anexo de comentário — volume muito maior que post, por isso o teto baixo. */
  comment: 2 * 1024 * 1024,
  /** Vídeo de banner da Loja. */
  video: 20 * 1024 * 1024,
} as const

/**
 * Rótulo do limite para mostrar ao usuário. Toda mensagem de "arquivo muito
 * grande" deve sair daqui: é o que garante que o número na tela é o número
 * aplicado. Usa uma casa decimal quando não é inteiro, para não anunciar
 * "2MB" num teto de 2,5MB.
 */
export function formatUploadLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`
}

/** Mensagem padrão de arquivo acima do teto. */
export function uploadTooLargeMessage(bytes: number): string {
  return `Arquivo deve ter no máximo ${formatUploadLimit(bytes)}.`
}

/**
 * Trava de sanidade: nenhum limite pode passar do que o proxy bufferiza, ou o
 * arquivo chega truncado e vira imagem corrompida no bucket, sem erro. Roda
 * na importação do módulo, então um valor errado quebra o build/boot em vez
 * de virar arquivo corrompido em produção.
 */
for (const [name, bytes] of Object.entries(UPLOAD_LIMITS)) {
  if (bytes > MAX_UPLOAD_BYTES) {
    throw new Error(
      `UPLOAD_LIMITS.${name} (${formatUploadLimit(bytes)}) passa do teto seguro de ` +
        `${formatUploadLimit(MAX_UPLOAD_BYTES)}. Aumente proxyClientMaxBodySize no ` +
        `next.config.mjs junto com PROXY_BODY_BUFFER_BYTES.`
    )
  }
}
