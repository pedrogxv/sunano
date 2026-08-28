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

/**
 * Nome de exibição do periférico, sem repetir a marca.
 *
 * `brand` vem de uma tabela separada (`brands`), mas o `name` cadastrado no
 * admin quase sempre já começa pela marca ("Razer DeathAdder V3 Pro"). Concatenar
 * os dois cru produzia "Razer Razer DeathAdder V3 Pro" no `<title>`, no
 * `og:title`, na meta description e no JSON-LD — em praticamente todo o
 * catálogo. Além de parecer descuidado na SERP, um título que gasta a palavra
 * mais buscada duas vezes desperdiça o orçamento de ~60 chars antes do corte.
 *
 * A comparação é acento/caixa-insensível e só remove a marca quando ela é o
 * primeiro token completo — "Razer" não pode sumir de um nome como
 * "Razerblade" nem de "Pro Razer Edition".
 */
export function buildPeripheralDisplayName(brand: string | null | undefined, name: string): string {
  const cleanName = name.trim()
  const cleanBrand = brand?.trim()
  if (!cleanBrand) return cleanName

  const norm = (v: string) => slugify(v)
  const brandSlug = norm(cleanBrand)
  if (!brandSlug) return cleanName

  const nameSlug = norm(cleanName)
  // Só considera prefixo se terminar em limite de token ("-" ou fim da string),
  // evitando cortar "razer" de "razerblade".
  if (nameSlug === brandSlug) return cleanName
  if (nameSlug.startsWith(`${brandSlug}-`)) return cleanName

  return `${cleanBrand} ${cleanName}`
}
