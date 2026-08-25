import "server-only"

import { findUserIdByDisplaySlug } from "@/lib/server/repositories/users-repository"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O segmento de `/perfil/[handle]` é o slug do nome, mas UUID continua
 * resolvendo: links antigos foram compartilhados antes do nome único existir.
 *
 * Compartilhado entre a página do perfil e a rota de OG image — as duas
 * recebem o mesmo `handle` da URL e precisam resolver pro mesmo userId.
 */
export async function resolveProfileUserId(handle: string): Promise<string | null> {
  const value = decodeURIComponent(handle)
  if (UUID_PATTERN.test(value)) return value
  return findUserIdByDisplaySlug(value)
}
