import "server-only"
import * as z from "zod"

/**
 * Imagem de medalha: URL do upload do admin (Storage) OU arte que mora em
 * `/public/images/medals/` e chega com caminho relativo — é o caso da
 * conquista CLIENTE SUNANO, semeada pela migration 20261210000000. Só com
 * `.url()`, salvar essa conquista pelo painel sem trocar a imagem falhava,
 * porque o form reenvia o caminho que veio do banco.
 */
export const medalImageUrl = z.union([
  z.string().url(),
  z.string().regex(/^\/images\/medals\/[\w.-]+$/, "Imagem inválida."),
])
