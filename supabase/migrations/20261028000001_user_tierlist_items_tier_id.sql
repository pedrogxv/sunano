-- Aponta `user_tierlist_items` pros tiers de verdade do usuário
-- (`user_tierlist_tiers`, migration anterior) em vez do texto fixo
-- S/A/B/C/D. Quem já tinha itens ganha o preset padrão (mesmas cores da
-- tierlist oficial, `lib/tierlist-theme.ts` TIER_BASE_COLORS) como ponto de
-- partida — o usuário pode renomear/recolorir depois.
-- `on delete cascade`, e NÃO `restrict`: as duas tabelas penduram em
-- `auth.users` com cascade, e a ordem em que o Postgres dispara os triggers
-- RI irmãos é alfabética pelo nome interno (`RI_ConstraintTrigger_c_<oid>`),
-- ou seja, imprevisível. Com `restrict`, apagar uma conta falharia sempre que
-- o tier fosse limpo antes do item que aponta pra ele — quebrando a exclusão
-- de usuário do admin. Quem protege o dono de apagar um tier cheio sem querer
-- é `replace_user_tierlist_tiers`, que recusa a operação antes de deletar.
alter table public.user_tierlist_items
  add column if not exists tier_id uuid references public.user_tierlist_tiers(id) on delete cascade;

do $$
declare
  target_user uuid;
begin
  for target_user in
    select distinct user_id from public.user_tierlist_items where tier_id is null
  loop
    if not exists (select 1 from public.user_tierlist_tiers where user_id = target_user) then
      insert into public.user_tierlist_tiers (user_id, position, label, color) values
        (target_user, 0, 'S', '#F97316'),
        (target_user, 1, 'A', '#F59E0B'),
        (target_user, 2, 'B', '#22C55E'),
        (target_user, 3, 'C', '#3B82F6'),
        (target_user, 4, 'D', '#6B7280');
    end if;

    update public.user_tierlist_items i
    set tier_id = t.id
    from public.user_tierlist_tiers t
    where i.user_id = target_user
      and i.tier_id is null
      and t.user_id = target_user
      and t.label = i.tier;
  end loop;
end $$;

alter table public.user_tierlist_items alter column tier_id set not null;
alter table public.user_tierlist_items drop column if exists tier;

drop index if exists idx_user_tierlist_items_user;
create index if not exists idx_user_tierlist_items_user
  on public.user_tierlist_items(user_id, tier_id, position);
