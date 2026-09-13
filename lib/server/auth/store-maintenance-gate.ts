import "server-only"

import type { Metadata } from "next"

import { canUseStoreNow } from "@/lib/server/auth/store-access"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"

/**
 * Fonte única do portão de manutenção das páginas de NAVEGAÇÃO da Loja.
 *
 * Por que existe (varredura de 13/09/2026): o proxy só fecha o caminho de
 * ESCRITA (`STORE_ORDER_WRITE_PATHS = ["/api/store/checkout"]`, ver proxy.ts).
 * Todo o resto de `/loja/**` precisa se fechar sozinho — e o comentário do
 * proxy afirma que "as páginas /loja mostram 'em breve' sozinhas". Só que a
 * regra estava copiada à mão em duas páginas (`/loja` e `/loja/[slug]`) e
 * FALTAVA em três: `/loja/categoria/[categoria]`, `/loja/marca/[marca]` e
 * `/loja/avaliacoes`. Em produção, com a loja em manutenção, essas rotas
 * serviam o catálogo inteiro (nome, preço, desconto, disponibilidade) com
 * HTTP 200 enquanto `/loja` dizia "Coming soon".
 *
 * A causa não foi descuido pontual: era regra duplicada sem dono. Toda rota
 * nova de navegação da Loja deve chamar `isStoreBrowsingBlocked()` e
 * `storeMaintenanceMetadata()` em vez de repetir a condição.
 *
 * NÃO cobre o caminho de escrita — checkout, cancelamento e afins continuam
 * com as próprias travas (proxy + a checagem dentro da rota).
 */

/**
 * A navegação da Loja deve mostrar "Coming soon" para ESTE visitante?
 *
 * `true` quando há manutenção e a pessoa não fura (WEB MASTER ou
 * `user_profiles.store_access`). Mesmo critério do checkout, via
 * `canUseStoreNow` — as duas respostas precisam concordar, senão o usuário
 * navega na loja e toma 503 ao comprar.
 */
export async function isStoreBrowsingBlocked(): Promise<boolean> {
  if (!isStoreMaintenanceEnabled()) return false
  return !(await canUseStoreNow())
}

/**
 * Metadata das páginas da Loja enquanto a manutenção estiver ligada.
 *
 * Devolve `null` fora da manutenção — a página então monta a própria metadata
 * normalmente (título do produto, preço no card, JSON-LD), sem perder nada do
 * SEO que já existe hoje.
 *
 * Durante a manutenção TODA rota de `/loja/**` renderiza a mesma tela
 * "Coming soon". Deixar isso indexável criaria dezenas de URLs de conteúdo
 * idêntico — o problema de "conteúdo fino" que já custou 732 URLs em
 * "Detectada mas não indexada". Antes desta função, `generateMetadata` fazia
 * `return {}` na manutenção, e `{}` HERDA o `index, follow` do layout raiz:
 * o placeholder era servido com 200 e convite explícito ao rastreador.
 *
 * `thinContent` (noindex, follow) em vez de `noIndex` (noindex, nofollow) é
 * deliberado: a tela é pública e legítima, e o `follow` preserva o caminho de
 * descoberta pelos links do menu. Quando a loja abrir, basta desligar a env —
 * as páginas voltam a indexar sozinhas, sem deploy e sem `noindex` residual.
 */
export function storeMaintenanceMetadata(input: {
  /** Título da aba, sem o sufixo do site. */
  title: string
  /** Caminho canônico da própria rota, para o card e o `canonical`. */
  path: string
}): Metadata | null {
  if (!isStoreMaintenanceEnabled()) return null

  return {
    title: input.title,
    description:
      "A Loja Sunano está sendo preparada para o lançamento. Fique de olho nas redes para saber quando abrir.",
    alternates: { canonical: input.path },
    robots: { index: false, follow: true },
  }
}
