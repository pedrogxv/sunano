"use client"

/**
 * "A pessoa queria assinar o VIP, mas não tinha sessão."
 *
 * POR QUE EXISTE
 * --------------
 * O `VipUpsellModal` é aberto por vários pontos de entrada (sidebar, menu da
 * conta, Central de Aura, gate da tierlist). Para quem está deslogado ele
 * troca os controles de pagamento por "Entrar"/"Criar conta" — e, terminado o
 * login, o popup do VIP precisa VOLTAR sozinho: mandar a pessoa recomeçar a
 * procurar o botão depois de autenticar é justamente o atrito que o fluxo
 * antigo criava (o toast "Você precisa estar logado" e nada mais).
 *
 * Só que o login tem DOIS finais diferentes:
 *
 * - e-mail/senha pelo modal — a sessão nasce de uma server action, a página
 *   não recarrega e o `refresh()` do auth-context é quem avisa;
 * - Google/Discord — o navegador SAI da página, passa pelo provedor e volta
 *   em `/auth/callback?next=…`, num carregamento novo em que todo `useState`
 *   já morreu.
 *
 * Um sinal em memória cobriria só o primeiro. Por isso a intenção mora no
 * `sessionStorage`: sobrevive ao redirect do OAuth e morre junto com a aba,
 * que é exatamente o tempo de vida que ela deve ter (voltar ao site amanhã
 * não pode abrir um popup de cobrança sozinho).
 *
 * Como o `auth-snapshot`, isto é só uma DICA DE INTERFACE: não concede nada,
 * não guarda dado nenhum do usuário e tudo que faz é decidir se um modal
 * reabre. Todo acesso é embrulhado em try/catch porque `sessionStorage` LANÇA
 * em aba anônima com storage bloqueado e em webview.
 */

const KEY = "sunano:vip-intent:v1"

/** Teto de idade da intenção, para o caso de a aba ficar aberta sem terminar o
 *  login. Sem isso, um login feito uma hora depois por outro motivo qualquer
 *  reabriria o popup de VIP do nada. */
const MAX_AGE_MS = 30 * 60 * 1000

export function rememberVipIntent(): void {
  try {
    window.sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Storage indisponível: o fluxo segue, só não reabre o modal sozinho.
  }
}

/**
 * Consome a intenção: devolve `true` UMA única vez e já apaga o registro.
 *
 * Ler e limpar no mesmo passo é o que impede o popup de voltar a cada
 * navegação depois do login — o watcher que chama isto roda em toda página.
 */
export function consumeVipIntent(): boolean {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return false
    window.sessionStorage.removeItem(KEY)
    const at = Number(raw)
    return Number.isFinite(at) && Date.now() - at < MAX_AGE_MS
  } catch {
    return false
  }
}

export function forgetVipIntent(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // Idem: nada a fazer.
  }
}
