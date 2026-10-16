import "server-only"

/** Bytes suficientes para ler a caixa `ftyp` do começo de um MP4/MOV. */
const HEADER_BYTES = 64

/**
 * Lê só o começo de um vídeo já enviado ao Storage (bucket público), para a
 * etapa de confirmação conferir a assinatura com `detectVideoType`. Baixar o
 * arquivo inteiro para olhar 12 bytes seria desperdício.
 */
export async function readVideoObjectHeader(publicUrl: string): Promise<Uint8Array | null> {
  const res = await fetch(publicUrl, { headers: { Range: `bytes=0-${HEADER_BYTES - 1}` }, cache: "no-store" })
  if (!res.ok || !res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < HEADER_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  await reader.cancel().catch(() => {})
  const header = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    header.set(chunk, offset)
    offset += chunk.length
  }
  return header
}
