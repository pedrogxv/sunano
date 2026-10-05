-- Item de tierlist só pode apontar para tier do PRÓPRIO dono.
--
-- `user_tierlist_items.tier_id` referenciava `user_tierlist_tiers(id)` sozinho,
-- então o banco aceitava um item do usuário A num tier do usuário B. A rota
-- (`upsertTierlistItem`) agora confere, mas o banco é a segunda barreira: o
-- FK composto amarra `(user_id, tier_id)` ao par `(user_id, id)` do tier.
--
-- Por que importava: `replace_user_tierlist_tiers` recusa apagar um tier que
-- ainda tem item apontando para ele (`in_use`). Um item alheio pendurado ali
-- travava o dono de remover o próprio tier, sem ele conseguir ver nem apagar
-- o item que o prendia.
--
-- Produção conferida antes: 0 itens em tier de outro usuário (25 itens).
-- O FK antigo (`user_tierlist_items_tier_id_fkey`) continua; o novo só
-- acrescenta a exigência de o dono bater. Ambos em cascade.
alter table public.user_tierlist_tiers
  drop constraint if exists user_tierlist_tiers_user_id_id_key;
alter table public.user_tierlist_tiers
  add constraint user_tierlist_tiers_user_id_id_key unique (user_id, id);

alter table public.user_tierlist_items
  drop constraint if exists user_tierlist_items_user_tier_fkey;
alter table public.user_tierlist_items
  add constraint user_tierlist_items_user_tier_fkey
  foreign key (user_id, tier_id)
  references public.user_tierlist_tiers (user_id, id)
  on delete cascade;
