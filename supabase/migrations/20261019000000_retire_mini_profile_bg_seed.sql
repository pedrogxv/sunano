-- Retira da loja a primeira leva de Fundos de Mini Perfil (seed de
-- 20261018000000). A arte não passou no crivo; a ESTRUTURA fica de pé para a
-- próxima leva.
--
-- O que NÃO se mexe aqui, de propósito:
--   • o kind `mini_profile_bg` no check de `aura_items`;
--   • a coluna `user_profiles.equipped_mini_profile_bg_id` e seu índice;
--   • `user_aura_items` / `aura_purchases` de quem comprou.
-- Relançar = inserir itens novos (ou reativar estes) com slug batendo com
-- `MINI_PROFILE_BG_THEMES` em lib/mini-profile-backgrounds.ts.
--
-- Por que DESATIVAR e não deletar: os itens já foram comprados. `delete`
-- levaria junto a posse em `user_aura_items` (FK on delete cascade) e
-- apagaria a referência do histórico de compras — reescrever o passado de uma
-- wallet para arrumar uma decisão de vitrine. `active = false` já tira o item
-- do catálogo em toda parte: `listActiveAuraItems()` é a única leitura da
-- loja E do seletor do perfil (/api/aura/mini-profile-bg), e a RPC
-- `redeem_aura_item` recusa item inativo.

-- ────────────────────────────────────────────
-- 1. Fora da vitrine
-- ────────────────────────────────────────────
update public.aura_items
set active = false
where kind = 'mini_profile_bg';

-- ────────────────────────────────────────────
-- 2. Desequipa quem estava usando um deles
--    Sem isto, o cartão de Mini Perfil seguiria apontando para um item
--    retirado. Não quebraria a tela (slug sem tema = cartão sem efeito, a
--    degradação suave já prevista), mas deixaria o slot ocupado por algo que
--    o dono não consegue mais ver nem trocar no seletor — que só lista item
--    ativo. Zerar aqui devolve o cartão ao padrão de fábrica.
-- ────────────────────────────────────────────
update public.user_profiles p
set equipped_mini_profile_bg_id = null
where p.equipped_mini_profile_bg_id in (
  select i.id from public.aura_items i where i.kind = 'mini_profile_bg'
);
