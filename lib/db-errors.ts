/**
 * Database error humanizer.
 *
 * Converts raw Postgres / PostgREST errors into safe, specific messages
 * suitable for end users. Keeps the message helpful (mentions which field
 * is wrong) without leaking constraint names, SQL fragments, or table layout.
 *
 * Use HumanizedDbError.message in API responses instead of error.message.
 */

export type HumanizedDbError = {
  message: string
  status: number
  field?: string
}

const PERIPHERAL_CATEGORIES = [
  "mouse", "keyboard", "pcb", "mousepad", "glasspad", "iem", "headset",
  "feet", "chairs", "monitors", "switches", "dac_amp",
] as const

const PERIPHERAL_TIERS = ["GOAT", "SS", "S", "A", "B", "C", "L"] as const

const STORE_TYPES = ["store", "bazaar"] as const
const STORE_CONDITIONS = ["new", "used", "opened"] as const

/**
 * Known CHECK constraints — explicit mappings tell the user the exact list
 * of accepted values without leaking the raw constraint name.
 */
const CONSTRAINT_MAP: Record<string, { message: string; field?: string; status?: number }> = {
  peripherals_category_check: {
    message: `Categoria inválida. Use uma das opções: ${PERIPHERAL_CATEGORIES.join(", ")}.`,
    field: "category",
    status: 400,
  },
  peripherals_tier_check: {
    message: `Tier inválido. Use uma das opções: ${PERIPHERAL_TIERS.join(", ")} ou deixe vazio.`,
    field: "tier",
    status: 400,
  },
  store_products_type_check: {
    message: `Tipo inválido. Use "${STORE_TYPES.join('" ou "')}".`,
    field: "type",
    status: 400,
  },
  store_products_condition_check: {
    message: `Condição inválida. Use "${STORE_CONDITIONS.join('", "')}".`,
    field: "condition",
    status: 400,
  },
  store_products_price_cents_check: {
    message: "Preço deve ser maior que zero.",
    field: "price_cents",
    status: 400,
  },
  store_products_stock_check: {
    message: "Estoque não pode ser negativo.",
    field: "stock",
    status: 400,
  },
  home_banners_link_url_check: {
    message:
      'Link inválido. Use um caminho interno (ex.: "/tierlist") ou uma URL completa começando com http:// ou https://.',
    field: "link_url",
    status: 400,
  },
  home_banners_schedule_window_check: {
    message: "A data de fim do agendamento precisa ser posterior à data de início.",
    field: "ends_at",
    status: 400,
  },
}

const NOT_NULL_FIELD_LABELS: Record<string, string> = {
  name: "nome",
  brand: "marca",
  category: "categoria",
  price: "preço",
  price_cents: "preço",
  title: "título",
  content: "conteúdo",
  peripheral_id: "periférico vinculado",
  slug: "identificador (slug)",
  type: "tipo",
  email: "email",
  role: "cargo",
  link: "link",
  value: "valor",
}

const COLUMN_LABELS: Record<string, string> = {
  ...NOT_NULL_FIELD_LABELS,
  display_name: "nome de exibição",
  display_slug: "nome de exibição",
  cover_image_url: "imagem de capa",
  cover_thumbnail_url: "thumbnail",
  video_url: "URL do vídeo",
  excerpt: "resumo",
  is_published: "status de publicação",
  is_active: "status ativo",
}

type SupabaseLikeError = {
  message?: string | null
  code?: string | null
  details?: string | null
  hint?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function pickStringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key]
  return typeof value === "string" ? value : null
}

function asSupabaseError(err: unknown): SupabaseLikeError | null {
  if (!isRecord(err)) return null
  return {
    message: pickStringField(err, "message"),
    code: pickStringField(err, "code"),
    details: pickStringField(err, "details"),
    hint: pickStringField(err, "hint"),
  }
}

function extractConstraintName(text: string): string | null {
  const match = text.match(/violates check constraint "([^"]+)"/i)
  return match?.[1] ?? null
}

function extractMissingColumn(text: string): string | null {
  const match = text.match(/null value in column "([^"]+)"/i)
  return match?.[1] ?? null
}

function extractUniqueColumn(text: string): string | null {
  const match = text.match(/Key \(([^)]+)\)=/i)
  return match?.[1]?.split(",")[0]?.trim() ?? null
}

function extractForeignKeyColumn(text: string): string | null {
  const match = text.match(/Key \(([^)]+)\)=/i)
  return match?.[1]?.split(",")[0]?.trim() ?? null
}

/**
 * Convert any DB / Postgres / PostgREST error into a safe user-facing message.
 *
 * - Recognized CHECK constraints get specific guidance (list of allowed values).
 * - Unknown CHECK / FK / unique / not-null errors are mapped to a generic
 *   but actionable Portuguese message, without leaking raw constraint names.
 * - Anything else falls back to a single safe message.
 */
export function humanizeDbError(err: unknown, fallback = "Erro ao processar a operação."): HumanizedDbError {
  const sb = asSupabaseError(err)
  const raw = (sb?.message ?? (err instanceof Error ? err.message : "")) || ""
  const details = sb?.details ?? ""
  const code = sb?.code ?? ""
  const haystack = `${raw}\n${details}`

  // 1) CHECK constraints — match the known ones first
  const constraint = extractConstraintName(haystack)
  if (constraint) {
    const mapped = CONSTRAINT_MAP[constraint]
    if (mapped) {
      return { message: mapped.message, status: mapped.status ?? 400, field: mapped.field }
    }
    return {
      message: "Um dos campos contém um valor inválido para este registro. Revise os campos destacados e tente novamente.",
      status: 400,
    }
  }

  // 2) NOT NULL violations
  const missing = extractMissingColumn(haystack)
  if (missing || code === "23502") {
    const label = missing ? (NOT_NULL_FIELD_LABELS[missing] ?? missing) : "obrigatório"
    return { message: `Campo obrigatório não preenchido: ${label}.`, status: 400, field: missing ?? undefined }
  }

  // 3) Unique violations (23505)
  if (code === "23505" || /duplicate key|already exists/i.test(haystack)) {
    const col = extractUniqueColumn(haystack)
    const label = col ? (COLUMN_LABELS[col] ?? col) : null
    return {
      message: label
        ? `Já existe um registro com este valor de ${label}. Use um valor diferente.`
        : "Já existe um registro com esse identificador. Use um valor diferente.",
      status: 409,
      field: col ?? undefined,
    }
  }

  // 4) Foreign key violations (23503)
  if (code === "23503" || /violates foreign key/i.test(haystack)) {
    const col = extractForeignKeyColumn(haystack)
    const label = col ? (COLUMN_LABELS[col] ?? col) : null
    return {
      message: label
        ? `Referência inválida em ${label}. O item vinculado não existe mais.`
        : "Referência inválida — o item vinculado não foi encontrado.",
      status: 400,
      field: col ?? undefined,
    }
  }

  // 5) Type / numeric / format errors (22xxx family)
  if (code?.startsWith("22")) {
    return { message: "Algum campo está em formato inválido (número, data ou texto fora do esperado).", status: 400 }
  }

  // 6) Permission errors
  if (code === "42501" || /permission denied|row-level security|RLS/i.test(haystack)) {
    return { message: "Você não tem permissão para realizar esta operação.", status: 403 }
  }

  // 7) Connection / timeout — surface as 503
  if (/timeout|ECONNREFUSED|fetch failed|network/i.test(haystack)) {
    return { message: "Falha de conexão com o banco. Tente novamente em alguns segundos.", status: 503 }
  }

  return { message: fallback, status: 500 }
}

/**
 * Convenience: build a NextResponse-compatible JSON body for an error.
 * Returns `{ body, status }` so the caller can wrap with NextResponse.json.
 */
export function dbErrorResponse(err: unknown, fallback?: string) {
  const humanized = humanizeDbError(err, fallback)
  return {
    body: { error: humanized.message, field: humanized.field },
    status: humanized.status,
  }
}

export const ALLOWED_PERIPHERAL_CATEGORIES = PERIPHERAL_CATEGORIES
export const ALLOWED_PERIPHERAL_TIERS = PERIPHERAL_TIERS
