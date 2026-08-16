const YOUTUBE_URL_RE = /^https:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]+/

/** Valida que uma URL aponta para um vídeo do YouTube (usado nas reviews em vídeo do produto). */
export function isValidYoutubeUrl(url: string): boolean {
  return YOUTUBE_URL_RE.test(url.trim())
}

/** Extrai o ID do vídeo de uma URL do YouTube para montar o embed. Retorna null se não reconhecida. */
export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1) || null
    if (parsed.hostname.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v")
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.slice(7)
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.slice(8)
    }
    return null
  } catch {
    return null
  }
}
