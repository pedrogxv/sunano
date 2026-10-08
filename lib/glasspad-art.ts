/**
 * "Arte e raridade" do glasspad, gravado em `specs.details.art`.
 *
 * Sim/Não ficam como "yes" | "no" (vazio = não informado), igual aos outros
 * selects da ficha. Os campos que dependem de uma resposta "Sim" (artista, bio,
 * rede social; quantidade e país do drop) só são gravados quando ela é "yes":
 * trocar para "Não" no admin descarta o que estava preenchido, em vez de deixar
 * o dado escondido no JSON.
 */

export type YesNo = "yes" | "no"

export type GlasspadArt = {
  byArtist?: YesNo
  artistName?: string
  artistBio?: string
  artistSocial?: string
  usesAi?: YesNo
  limitedDrop?: YesNo
  dropQuantity?: number
  launchCountry?: string
}

export const GLASSPAD_ARTIST_BIO_MAX_LENGTH = 400

function yesNo(value: unknown): YesNo | undefined {
  return value === "yes" || value === "no" ? value : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function positiveInt(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** Normaliza o que veio do formulário ou do banco. `undefined` quando nada foi informado. */
export function parseGlasspadArt(raw: unknown): GlasspadArt | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const source = raw as Record<string, unknown>

  const byArtist = yesNo(source.byArtist)
  const limitedDrop = yesNo(source.limitedDrop)
  const art: GlasspadArt = {
    byArtist,
    artistName: byArtist === "yes" ? text(source.artistName) : undefined,
    artistBio: byArtist === "yes" ? text(source.artistBio)?.slice(0, GLASSPAD_ARTIST_BIO_MAX_LENGTH) : undefined,
    artistSocial: byArtist === "yes" ? text(source.artistSocial) : undefined,
    usesAi: yesNo(source.usesAi),
    limitedDrop,
    dropQuantity: limitedDrop === "yes" ? positiveInt(source.dropQuantity) : undefined,
    launchCountry: limitedDrop === "yes" ? text(source.launchCountry) : undefined,
  }

  const cleaned = Object.fromEntries(Object.entries(art).filter(([, v]) => v !== undefined)) as GlasspadArt
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}
