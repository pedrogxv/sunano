import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { storeApiMaintenanceResponse } from "@/lib/server/auth/store-maintenance-gate"
import { validateCartLines } from "@/lib/server/repositories/store-repository"

export const runtime = "nodejs"

/**
 * Estado ATUAL (preço, estoque, disponibilidade) das linhas de um carrinho.
 *
 * O carrinho vive no localStorage e congela preço, estoque e nome no momento
 * em que o item foi adicionado — nada revalidava isso até o submit do
 * checkout, então uma divergência (preço mudou, item esgotou, variante foi
 * desativada) só aparecia DEPOIS do clique em comprar, como erro. Um erro no
 * carrinho é recuperável; o mesmo erro depois do clique é abandono.
 *
 * Não há risco de fraude no caminho contrário: o checkout continua
 * recalculando tudo do banco e ignorando qualquer preço vindo do cliente.
 * Esta rota existe só para a tela poder avisar antes.
 *
 * Separada de `/checkout/payer-info` de propósito: aquela responde sobre o
 * PERFIL (e só recebia `productIds` por carona), esta responde sobre o
 * CARRINHO. Eram duas responsabilidades numa rota só, e o checkout a chamava
 * duas vezes na abertura por causa disso.
 */

const MAX_LINES = 50

type RequestLine = {
  productId?: unknown
  variantId?: unknown
  variantOptionIds?: unknown
}

export async function POST(request: NextRequest) {
  // Com a Loja fechada a vitrine não é pública, então preço e disponibilidade
  // também não. O /checkout já trata a recusa como "sem divergência" e mostra
  // a faixa de loja fechada.
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  // Sem autenticação: são dados públicos da vitrine (preço e disponibilidade
  // do que já está listado na loja), e o carrinho existe antes do login.
  //
  // Justamente por ser pública e sem sessão, é a rota mais barata de chamar e
  // das mais caras de servir do fluxo — cada requisição resolve até 50 linhas
  // (produto, variante, opções e combinações esgotadas). O teto é generoso
  // porque a tela chama isto ao abrir o carrinho e o checkout: segura abuso
  // sem atrapalhar navegação real.
  //
  // `onError: "open"` de propósito (ao contrário do checkout): se o limiter
  // cair, recusar bloquearia a vitrine inteira, e aqui não há dinheiro nem
  // estoque em jogo — o checkout revalida tudo do banco de qualquer forma.
  const { allowed } = await checkRateLimit({
    action: "store_cart_validate",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
    onError: "open",
  })
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Aguarde um instante e tente novamente." },
      { status: 429 }
    )
  }

  const body = (await request.json().catch(() => null)) as {
    items?: RequestLine[]
  } | null

  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Carrinho inválido." }, { status: 400 })
  }

  const lines = body.items
    .slice(0, MAX_LINES)
    .map((item) => ({
      productId: typeof item.productId === "string" ? item.productId : null,
      variantId: typeof item.variantId === "string" ? item.variantId : null,
      optionIds: Array.isArray(item.variantOptionIds)
        ? item.variantOptionIds.filter((id): id is string => typeof id === "string")
        : [],
    }))
    .filter((line): line is { productId: string; variantId: string | null; optionIds: string[] } =>
      line.productId !== null
    )

  if (lines.length === 0) {
    return NextResponse.json({ lines: [], cartNeedsShipping: false })
  }

  const result = await validateCartLines(lines)
  return NextResponse.json(result)
}
