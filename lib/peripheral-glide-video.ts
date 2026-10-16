/**
 * Vídeo de deslize de mousepad/glasspad (card "Deslize" na página do
 * periférico, num player com controles). Bucket próprio, migration
 * 20261224000000.
 *
 * O arquivo vai direto do navegador para o Storage por signed URL
 * (`/api/admin/peripherals/upload-video`): a Vercel corta o corpo da
 * requisição em ~4.5MB, e um .mov de celular passa disso em poucos segundos.
 */
export const PERIPHERAL_GLIDE_VIDEO_BUCKET = "peripheral-videos"

/** Teto do arquivo, o mesmo `file_size_limit` do bucket (20MB). */
export const PERIPHERAL_GLIDE_VIDEO_MAX_BYTES = 20 * 1024 * 1024

/** Nome que o upload gera: `glide-<timestamp>-<uuid>.mp4`. */
const PERIPHERAL_GLIDE_VIDEO_NAME_RE =
  /^glide-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/i

export function newPeripheralGlideVideoName(): string {
  return `glide-${Date.now()}-${crypto.randomUUID()}.mp4`
}

export function isPeripheralGlideVideoName(name: string): boolean {
  return PERIPHERAL_GLIDE_VIDEO_NAME_RE.test(name)
}
