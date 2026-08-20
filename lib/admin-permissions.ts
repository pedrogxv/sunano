export type AdminRole = "webmaster" | "admin" | "moderator" | "editor" | "vendedor" | "suporte"

// Hierarquia de poder do painel admin, do maior para o menor. É a fonte
// única de ordenação para seletores/listas de cargo e para qualquer
// comparação de nível — nada de listas soltas duplicando esta ordem.
export const ADMIN_ROLE_ORDER: AdminRole[] = ["webmaster", "admin", "moderator", "editor", "vendedor", "suporte"]

/** Posição na hierarquia (0 = mais poderoso). "user" (usuário comum, sem linha em admin_profiles) fica sempre por último. */
export function getAdminRoleRank(role: AdminRole | "user"): number {
  if (role === "user") return ADMIN_ROLE_ORDER.length
  return ADMIN_ROLE_ORDER.indexOf(role)
}

export type AdminPermissionKey =
  | "dashboard_read"
  | "peripherals_read"
  | "peripherals_write"
  | "blog_read"
  | "blog_write"
  | "settings_read"
  | "settings_write"
  | "tiers_read"
  | "tiers_write"
  | "profile_read"
  | "profile_write"
  | "maintenance_read"
  | "maintenance_write"
  | "offers_read"
  | "offers_write"
  | "forum_read"
  | "forum_write"
  | "store_read"
  | "store_write"
  | "market_read"
  | "market_write"
  | "banners_read"
  | "banners_write"
  | "events_read"
  | "events_write"
  | "brands_read"
  | "brands_write"
  | "affiliates_read"
  | "affiliates_write"
  | "support_read"
  | "support_write"

export type AdminProfile = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  role: AdminRole
  permissions: Record<string, boolean> | null
}

export type AdminFeatureKey = "dashboard" | "peripherals" | "blog" | "settings" | "tiers" | "maintenance" | "profile" | "offers" | "forum" | "store" | "market" | "banners" | "events" | "brands" | "affiliates" | "support"

export const ADMIN_FEATURES: Array<{ key: AdminFeatureKey; label: string; readKey: AdminPermissionKey; writeKey: AdminPermissionKey }> = [
  { key: "dashboard", label: "Dashboard", readKey: "dashboard_read", writeKey: "dashboard_read" },
  { key: "peripherals", label: "Tier List", readKey: "peripherals_read", writeKey: "peripherals_write" },
  { key: "brands", label: "Marcas", readKey: "brands_read", writeKey: "brands_write" },
  { key: "blog", label: "Blog", readKey: "blog_read", writeKey: "blog_write" },
  { key: "forum", label: "Fórum", readKey: "forum_read", writeKey: "forum_write" },
  { key: "support", label: "Suporte", readKey: "support_read", writeKey: "support_write" },
  { key: "settings", label: "Configurações", readKey: "settings_read", writeKey: "settings_write" },
  { key: "tiers", label: "Tiers", readKey: "tiers_read", writeKey: "tiers_write" },
  { key: "maintenance", label: "Manutenção", readKey: "maintenance_read", writeKey: "maintenance_write" },
  { key: "profile", label: "Perfil", readKey: "profile_read", writeKey: "profile_write" },
  { key: "offers", label: "Ofertas", readKey: "offers_read", writeKey: "offers_write" },
  { key: "store", label: "Loja", readKey: "store_read", writeKey: "store_write" },
  { key: "market", label: "Mercado", readKey: "market_read", writeKey: "market_write" },
  { key: "banners", label: "Banners da Home", readKey: "banners_read", writeKey: "banners_write" },
  { key: "events", label: "Conquistas", readKey: "events_read", writeKey: "events_write" },
  { key: "affiliates", label: "Afiliados", readKey: "affiliates_read", writeKey: "affiliates_write" },
]

export const ADMIN_PERMISSION_KEYS: AdminPermissionKey[] = [
  "dashboard_read",
  "peripherals_read",
  "peripherals_write",
  "blog_read",
  "blog_write",
  "forum_read",
  "forum_write",
  "settings_read",
  "settings_write",
  "tiers_read",
  "tiers_write",
  "profile_read",
  "profile_write",
  "maintenance_read",
  "maintenance_write",
  "offers_read",
  "offers_write",
  "store_read",
  "store_write",
  "market_read",
  "market_write",
  "banners_read",
  "banners_write",
  "events_read",
  "events_write",
  "brands_read",
  "brands_write",
  "affiliates_read",
  "affiliates_write",
  "support_read",
  "support_write",
]

function full(): Record<AdminPermissionKey, boolean> {
  return ADMIN_PERMISSION_KEYS.reduce<Record<string, boolean>>((accumulator, key) => {
    accumulator[key] = true
    return accumulator
  }, {}) as Record<AdminPermissionKey, boolean>
}

function none(): Record<AdminPermissionKey, boolean> {
  return ADMIN_PERMISSION_KEYS.reduce<Record<string, boolean>>((accumulator, key) => {
    accumulator[key] = false
    return accumulator
  }, {}) as Record<AdminPermissionKey, boolean>
}

function build(grants: Partial<Record<AdminPermissionKey, boolean>>): Record<AdminPermissionKey, boolean> {
  return { ...none(), ...grants }
}

// Matriz fixa de permissões por cargo — fonte única de autorização do painel.
// Cargo define acesso; não há mais toggle individual por usuário nem exceção
// pontual. Acesso decrescente conforme a hierarquia (ADMIN_ROLE_ORDER):
// Web Master e Admin têm acesso total; os demais cargos têm acesso recortado
// à sua especialidade, e "user" (sem linha em admin_profiles) não tem nenhum.
export const ROLE_PERMISSIONS: Record<AdminRole, Record<AdminPermissionKey, boolean>> = {
  webmaster: full(),
  // Admin tem acesso total como o Web Master; a única diferença (não gerenciar
  // ou rebaixar um Web Master) é resolvida pela hierarquia de cargos
  // (getAdminRoleRank/isWebMaster), não por uma permissão desta matriz.
  admin: full(),
  // Gerencia e vigia a comunidade: só Fórum e Blog (onde ficam os comentários).
  moderator: build({
    dashboard_read: true,
    profile_read: true,
    profile_write: true,
    blog_read: true,
    blog_write: true,
    forum_read: true,
    forum_write: true,
  }),
  // Cria/gerencia guias e participa da Tierlist/Periféricos: Tier List, Tiers
  // e Marcas. Não há módulo de Guias no painel ainda — sinalizado ao usuário.
  editor: build({
    dashboard_read: true,
    profile_read: true,
    profile_write: true,
    peripherals_read: true,
    peripherals_write: true,
    tiers_read: true,
    tiers_write: true,
    brands_read: true,
    brands_write: true,
  }),
  // Gestão da loja: Loja/Bazar (módulo "store"; Bazar foi incorporado à Loja)
  // e Tickets (módulo "support", os chamados em /admin/suporte).
  vendedor: build({
    dashboard_read: true,
    profile_read: true,
    profile_write: true,
    store_read: true,
    store_write: true,
    support_read: true,
    support_write: true,
  }),
  // Beta tester da comunidade: silencia/apaga postagens e apazigua conflitos
  // em Fórum e Blog. O sistema não distingue "moderação leve" de edição
  // completa dentro do módulo, então aplica-se Leitura e Edição completas
  // ali — limitação sinalizada ao usuário.
  suporte: build({
    dashboard_read: true,
    profile_read: true,
    profile_write: true,
    blog_read: true,
    blog_write: true,
    forum_read: true,
    forum_write: true,
  }),
}

/** Permissões efetivas de um cargo. "user" (sem linha em admin_profiles) não tem nenhuma. */
export function getRolePermissions(role: AdminRole | "user"): Record<AdminPermissionKey, boolean> {
  if (role === "user") return none()
  return ROLE_PERMISSIONS[role]
}

export function normalizePermissions(permissions: Record<string, boolean> | null | undefined) {
  return ADMIN_PERMISSION_KEYS.reduce<Record<string, boolean>>((accumulator, key) => {
    accumulator[key] = Boolean(permissions?.[key])
    return accumulator
  }, {})
}

type PermissionProfile = Pick<AdminProfile, "role" | "permissions">

export function isWebMaster(profile: PermissionProfile | null | undefined) {
  return profile?.role === "webmaster"
}

// Autorização no app (Next.js) deriva 100% do cargo — sem fallback estático e
// sem ler a coluna `permissions` do perfil aqui. Mas essa coluna NÃO é só um
// espelho: as RLS policies do Supabase (admin_has_permission() em
// supabase/security.sql) leem ela direto pra autorizar escritas no banco, então
// ela precisa ficar sincronizada com esta matriz via migration sempre que a
// matriz mudar — ver supabase/migrations/20260921000019_role_based_permissions.sql.
export function hasAdminPermission(
  profile: PermissionProfile | null | undefined,
  permission: AdminPermissionKey
) {
  if (!profile) return false
  return Boolean(getRolePermissions(profile.role)[permission])
}

export function hasAnyPermission(
  profile: PermissionProfile | null | undefined,
  permissions: AdminPermissionKey[]
) {
  return permissions.some((permission) => hasAdminPermission(profile, permission))
}

// Critério para entrar no painel: ter perfil administrativo com pelo menos uma
// seção liberada. Não usar `dashboard_read` para isso — a grade da tela de
// usuários não expõe esse toggle, então um moderador legítimo pode não tê-lo.
export function hasAnyAdminAccess(profile: PermissionProfile | null | undefined) {
  if (!profile) return false
  return isWebMaster(profile) || hasAnyPermission(profile, ADMIN_PERMISSION_KEYS)
}

export function canChangePasswords(profile: PermissionProfile | null | undefined) {
  return isWebMaster(profile)
}

export function canEditOtherWebMaster(profile: PermissionProfile | null | undefined) {
  return isWebMaster(profile)
}
