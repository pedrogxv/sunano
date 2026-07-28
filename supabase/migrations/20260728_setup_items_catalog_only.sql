-- Vitrine: o setup do perfil só aceita periférico do catálogo.
--
-- 20260728_public_profile_showcase.sql permitia `custom_label` (texto livre)
-- para itens que ainda não existiam em `peripherals`. Como o setup aparece no
-- perfil público, isso é um campo de escrita aberta — qualquer usuário podia
-- publicar o texto que quisesse ali.
--
-- Tirar o campo da UI não bastaria: a policy "Users can manage their own
-- setup" deixa o próprio usuário escrever na tabela via PostgREST, então a
-- garantia precisa estar no banco. Depois desta migration um slot é, por
-- definição, uma referência a `peripherals` — não há mais texto do usuário.

-- 1. Slots que só tinham texto livre deixam de existir (não há para onde
--    convertê-los: o periférico correspondente não está no catálogo).
delete from public.user_setup_items where peripheral_id is null;

-- 2. A regra "tem periférico OU tem texto" perde o sentido.
alter table public.user_setup_items
  drop constraint if exists user_setup_items_has_content;

alter table public.user_setup_items
  drop column if exists custom_label;

-- 3. `on delete set null` era compatível com o texto livre (o slot sobrevivia
--    ao periférico apagado). Sem ele, apagar um periférico do catálogo tem de
--    remover o slot, senão a coluna NOT NULL abaixo bloquearia a exclusão.
alter table public.user_setup_items
  drop constraint if exists user_setup_items_peripheral_id_fkey;

alter table public.user_setup_items
  add constraint user_setup_items_peripheral_id_fkey
  foreign key (peripheral_id) references public.peripherals(id) on delete cascade;

alter table public.user_setup_items
  alter column peripheral_id set not null;
