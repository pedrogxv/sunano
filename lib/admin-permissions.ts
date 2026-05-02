export type AdminRole = "admin" | "moderator" | "webmaster"

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

export type AdminProfile = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  role: AdminRole
  permissions: Record<string, boolean> | null
}

export type AdminFeatureKey = "dashboard" | "peripherals" | "blog" | "settings" | "tiers" | "maintenance" | "profile" | "offers"

export const ADMIN_FEATURES: Array<{ key: AdminFeatureKey; label: string; readKey: AdminPermissionKey; writeKey: AdminPermissionKey }> = [
  { key: "dashboard", label: "Dashboard", readKey: "dashboard_read", writeKey: "dashboard_read" },
  { key: "peripherals", label: "Tier List", readKey: "peripherals_read", writeKey: "peripherals_write" },
  { key: "blog", label: "Blog", readKey: "blog_read", writeKey: "blog_write" },
  { key: "settings", label: "Configurações", readKey: "settings_read", writeKey: "settings_write" },
  { key: "tiers", label: "Tiers", readKey: "tiers_read", writeKey: "tiers_write" },
  { key: "maintenance", label: "Manutenção", readKey: "maintenance_read", writeKey: "maintenance_write" },
  { key: "profile", label: "Perfil", readKey: "profile_read", writeKey: "profile_write" },
  { key: "offers", label: "Ofertas", readKey: "offers_read", writeKey: "offers_write" },
]

export const ADMIN_PERMISSION_KEYS: AdminPermissionKey[] = [
  "dashboard_read",
  "peripherals_read",
  "peripherals_write",
  "blog_read",
  "blog_write",
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
]

export function createFullPermissions() {
  return ADMIN_PERMISSION_KEYS.reduce<Record<string, boolean>>((accumulator, key) => {
    accumulator[key] = true
    return accumulator
  }, {})
}

export function createDefaultPermissions() {
  return ADMIN_PERMISSION_KEYS.reduce<Record<string, boolean>>((accumulator, key) => {
    accumulator[key] = key.endsWith("_read")
    return accumulator
  }, {})
}

export function normalizePermissions(permissions: Record<string, boolean> | null | undefined) {
  return ADMIN_PERMISSION_KEYS.reduce<Record<string, boolean>>((accumulator, key) => {
    accumulator[key] = Boolean(permissions?.[key])
    return accumulator
  }, {})
}

export function isWebMaster(profile: AdminProfile | null | undefined) {
  return profile?.role === "webmaster"
}

export function hasAdminPermission(
  profile: AdminProfile | null | undefined,
  permission: AdminPermissionKey
) {
  if (!profile) return false
  if (isWebMaster(profile)) return true
  return Boolean(profile.permissions?.[permission])
}

export function hasAnyPermission(
  profile: AdminProfile | null | undefined,
  permissions: AdminPermissionKey[]
) {
  return permissions.some((permission) => hasAdminPermission(profile, permission))
}

export function canChangePasswords(profile: AdminProfile | null | undefined) {
  return isWebMaster(profile)
}

export function canEditOtherWebMaster(profile: AdminProfile | null | undefined) {
  return isWebMaster(profile)
}
