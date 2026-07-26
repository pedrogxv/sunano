export const DEFAULT_AVATAR_URL = "/images/mascot/Logo-Sunano_calo-contorno.png"

export function getAvatarUrl(url: string | null | undefined) {
  const safeUrl = url?.trim()
  return safeUrl || DEFAULT_AVATAR_URL
}
