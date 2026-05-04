const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export function buildPeripheralSlug(name: string, id: string) {
  return `${slugify(name)}--${id}`
}

export function extractPeripheralId(slug: string) {
  const markerIndex = slug.lastIndexOf("--")
  if (markerIndex === -1) return null

  const id = slug.slice(markerIndex + 2)
  return id || null
}

export function coercePeripheralId(slug: string) {
  const fromComposite = extractPeripheralId(slug)
  if (fromComposite) return fromComposite
  return UUID_REGEX.test(slug) ? slug : null
}

export function slugToSearchPattern(slug: string) {
  const core = slug.replace(/-/g, "%")
  return `%${core}%`
}
