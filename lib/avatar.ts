// 128px, não o PNG original de 4500×4500 (~80 MB decodificado para um avatar de 40px).
export const DEFAULT_AVATAR_URL = "/images/mascot/mascot-128.webp"

export function getAvatarUrl(url: string | null | undefined) {
  const safeUrl = url?.trim()
  return safeUrl || DEFAULT_AVATAR_URL
}
