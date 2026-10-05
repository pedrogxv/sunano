import * as z from "zod"

import { isOwnStorageObject } from "@/lib/server/storage-origin"

/** Bucket e prefixo dos arquivos de logo (ver upload-image/route.ts). */
export const SOFTWARE_LOGO_BUCKET = "peripherals"
export const SOFTWARE_LOGO_PREFIX = "software-logo-"

/** O que a limpeza de logo pode apagar: só o que o upload de logo gerou. */
export function isSoftwareLogoObject(object: { bucket: string; path: string }): boolean {
  return object.bucket === SOFTWARE_LOGO_BUCKET && object.path.startsWith(SOFTWARE_LOGO_PREFIX)
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}

export const softwarePayload = z.object({
  brandId: z.uuid("Selecione uma marca."),
  // Só logo enviada pelo nosso upload: URL colada à mão abriria a página para
  // imagem de terceiro (pixel de rastreio, arquivo que some depois).
  logoUrl: z
    .string()
    .trim()
    .min(1, "Envie a logo da marca.")
    .refine(
      (url) => isOwnStorageObject(url, SOFTWARE_LOGO_BUCKET, (name) => name.startsWith(SOFTWARE_LOGO_PREFIX)),
      "Envie a logo pelo botão de upload."
    ),
  hubUrl: z
    .string()
    .trim()
    .min(1, "Informe o link do Web Hub.")
    .max(500, "Link muito longo (máx. 500 caracteres).")
    .refine(isHttpUrl, "O link precisa começar com https:// ou http://."),
})
