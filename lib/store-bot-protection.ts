/**
 * Rotas da Loja conferidas pelo Vercel BotID (modo Basic, gratuito), num
 * lugar só: o cliente (`CheckoutBotProtection`) anexa o desafio às chamadas
 * para elas, e o servidor (`rejectIfBot`) confere. Rota nova protegida entra
 * aqui E chama `rejectIfBot` — uma sem a outra marca toda compra como bot.
 *
 * `checkLevel: "basic"` explícito: Deep Analysis é cobrado por chamada
 * (US$ 1/1.000) e foi descartado de propósito. Fixar aqui impede que ligar o
 * Deep Analysis no painel da Vercel passe a cobrar estas rotas.
 */
export const STORE_BOTID_ROUTES = [
  { path: "/api/store/checkout", method: "POST", advancedOptions: { checkLevel: "basic" as const } },
  { path: "/api/store/orders/*/card-payment", method: "POST", advancedOptions: { checkLevel: "basic" as const } },
]
