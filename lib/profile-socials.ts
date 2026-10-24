/**
 * Redes que a pessoa liga ao perfil público. Fonte única: a rota valida, o
 * editor desenha os campos e a vitrine desenha os ícones a partir desta lista.
 * Rede nova = coluna `<rede>_handle` em `user_profiles` (com o CHECK espelhando
 * `pattern`) + entrada em `SOCIALS` + ícone em `SocialLinks`.
 *
 * Só exibição: ninguém prova que é dono da conta, igual a um campo de bio.
 * Módulo puro: a mesma normalização roda no editor e na rota.
 */

export const PROFILE_SOCIAL_COLUMNS = [
  "youtube_handle",
  "tiktok_handle",
  "instagram_handle",
  "steam_handle",
] as const

export type ProfileSocialColumn = (typeof PROFILE_SOCIAL_COLUMNS)[number]

export type ProfileSocialHandles = Record<ProfileSocialColumn, string | null>

export type ProfileSocial = {
  column: ProfileSocialColumn
  label: string
  placeholder: string
  /** Formato do handle já normalizado (espelha o CHECK constraint da coluna). */
  pattern: RegExp
  /** "@usuario", "usuario" ou a URL colada do perfil viram só "usuario". */
  normalize: (input: string) => string
  url: (handle: string) => string
}

/** Limite dos handles com @ (espelha o CHECK constraint das colunas). */
const HANDLE_MAX_LENGTH = 30
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,30}$/

/** A URL personalizada da Steam vai até 32 caracteres; o SteamID64 tem 17. */
const STEAM_MAX_LENGTH = 32
const STEAM_PATTERN = /^[A-Za-z0-9._-]{1,32}$/
/** Perfil sem URL personalizada: o endereço é o número (`/profiles/7656…`). */
const STEAM_ID64_PATTERN = /^7656119\d{10}$/

function pathSegments(input: string): string[] {
  // Query e âncora fora antes de pegar o segmento: o link de compartilhar do
  // Instagram/TikTok vem com `?igsh=…`/`?_t=…`, que virava o "handle".
  return input.trim().split(/[?#]/)[0].split("/").filter(Boolean)
}

function cleanHandle(handle: string, maxLength: number): string {
  return handle.replace(/^@/, "").trim().slice(0, maxLength)
}

/** Prefere o segmento com "@" (`tiktok.com/@user/video/1`), senão o último. */
function normalizeHandle(input: string): string {
  const segments = pathSegments(input)
  const handle = segments.find((s) => s.startsWith("@")) ?? segments.pop() ?? ""
  return cleanHandle(handle, HANDLE_MAX_LENGTH)
}

/** `steamcommunity.com/id/<url>` ou `steamcommunity.com/profiles/<steamid64>`. */
function normalizeSteam(input: string): string {
  const segments = pathSegments(input)
  const marker = segments.findIndex((s) => s === "id" || s === "profiles")
  const handle = (marker >= 0 ? segments[marker + 1] : segments.pop()) ?? ""
  return cleanHandle(handle, STEAM_MAX_LENGTH)
}

const SOCIALS: Record<ProfileSocialColumn, Omit<ProfileSocial, "column">> = {
  youtube_handle: {
    label: "YouTube",
    placeholder: "@seucanal",
    pattern: HANDLE_PATTERN,
    normalize: normalizeHandle,
    url: (handle) => `https://youtube.com/@${handle}`,
  },
  tiktok_handle: {
    label: "TikTok",
    placeholder: "@seuusuario",
    pattern: HANDLE_PATTERN,
    normalize: normalizeHandle,
    url: (handle) => `https://tiktok.com/@${handle}`,
  },
  instagram_handle: {
    label: "Instagram",
    placeholder: "@seuusuario",
    pattern: HANDLE_PATTERN,
    normalize: normalizeHandle,
    url: (handle) => `https://instagram.com/${handle}`,
  },
  steam_handle: {
    label: "Steam",
    placeholder: "Cole o link do seu perfil",
    pattern: STEAM_PATTERN,
    normalize: normalizeSteam,
    url: (handle) =>
      STEAM_ID64_PATTERN.test(handle)
        ? `https://steamcommunity.com/profiles/${handle}`
        : `https://steamcommunity.com/id/${handle}`,
  },
}

export const PROFILE_SOCIALS: readonly ProfileSocial[] = PROFILE_SOCIAL_COLUMNS.map(
  (column) => ({ column, ...SOCIALS[column] })
)

/** Os handles de uma linha de perfil, com `null` para rede não informada. */
export function socialHandlesOf(
  row: Partial<Record<ProfileSocialColumn, string | null>> | null | undefined
): ProfileSocialHandles {
  return Object.fromEntries(
    PROFILE_SOCIAL_COLUMNS.map((column) => [column, row?.[column] ?? null])
  ) as ProfileSocialHandles
}
