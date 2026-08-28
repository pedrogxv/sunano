import "server-only"

import { revalidatePath } from "next/cache"

import { buildPeripheralSlug } from "@/lib/peripheral-slug"

/**
 * Invalida as rotas públicas afetadas quando conteúdo indexável muda no admin.
 *
 * O sitemap é uma rota estática com `revalidate` de 6 horas — o que garante que
 * conteúdo novo eventualmente aparece, mas não que apareça já. Chamar isto no
 * fim de uma escrita derruba o cache na hora, então a ficha nova e o sitemap
 * que a anuncia ficam consistentes no mesmo instante em que o admin salva.
 *
 * Nunca deve derrubar a requisição que a chamou: uma falha de revalidação é um
 * detalhe de cache, não um erro de escrita — o dado já foi gravado, e o
 * `revalidate` de 6h continua sendo a rede de segurança.
 */
export function revalidatePeripheral(peripheral?: { id: string; name: string } | null) {
  try {
    revalidatePath("/perifericos")
    revalidatePath("/sitemap.xml")
    if (peripheral) {
      revalidatePath(`/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}`)
    }
  } catch (error) {
    console.error("[revalidate-public] revalidatePeripheral:", error)
  }
}

/** Equivalente para post de blog/notícia, que compartilham a tabela `blog_posts`. */
export function revalidateBlogPost(slug?: string | null) {
  try {
    revalidatePath("/blog")
    revalidatePath("/noticias")
    revalidatePath("/sitemap.xml")
    if (slug) {
      revalidatePath(`/blog/${slug}`)
      revalidatePath(`/noticias/${slug}`)
    }
  } catch (error) {
    console.error("[revalidate-public] revalidateBlogPost:", error)
  }
}
