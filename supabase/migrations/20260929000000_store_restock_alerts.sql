-- "Avise-me quando voltar": inscrição de um usuário logado num produto (ou
-- numa cor específica dele) esgotado. Quando o admin tira o esgotado, um
-- trigger notifica todo mundo inscrito e marca a inscrição como avisada.
--
-- Sem tabela de fila própria: a notificação reaproveita o sistema já
-- existente (20260819_notifications.sql) via push_notification.

create table if not exists public.store_restock_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references public.store_products(id) on delete cascade,
  -- null = "qualquer cor volte"; preenchido = só aquela cor interessa.
  variant_id  uuid references public.store_product_variants(id) on delete cascade,
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Uma inscrição por (usuário, produto, cor). `coalesce` porque índice único
-- em Postgres trata NULLs como distintos entre si, o que deixaria a mesma
-- pessoa se inscrever N vezes no produto inteiro.
create unique index if not exists store_restock_alerts_unique
  on public.store_restock_alerts (user_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists store_restock_alerts_product_idx
  on public.store_restock_alerts (product_id) where notified_at is null;
create index if not exists store_restock_alerts_variant_idx
  on public.store_restock_alerts (variant_id) where notified_at is null;
create index if not exists store_restock_alerts_user_idx
  on public.store_restock_alerts (user_id);

alter table public.store_restock_alerts enable row level security;

-- Leitura/escrita só do próprio usuário. As rotas do app usam service role
-- (que ignora RLS), então isto protege o acesso direto via anon key.
drop policy if exists "restock alerts own select" on public.store_restock_alerts;
create policy "restock alerts own select" on public.store_restock_alerts
  for select using (auth.uid() = user_id);

drop policy if exists "restock alerts own insert" on public.store_restock_alerts;
create policy "restock alerts own insert" on public.store_restock_alerts
  for insert with check (auth.uid() = user_id);

drop policy if exists "restock alerts own delete" on public.store_restock_alerts;
create policy "restock alerts own delete" on public.store_restock_alerts
  for delete using (auth.uid() = user_id);

-- Novo tipo de notificação. Repete a lista inteira porque o check é
-- reescrito, não estendido (mesmo padrão de 20260921000017).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention',
  'new_post', 'order_status', 'support_reply', 'support_new_ticket', 'support_user_reply',
  'support_status', 'store_restock'
));

alter table public.notifications drop constraint if exists notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check (entity_type in (
  'forum_post', 'forum_comment', 'blog_post', 'blog_comment', 'user', 'peripheral', 'order',
  'support_ticket', 'store_product'
));

/**
 * Dispara os avisos de um produto que voltou. `p_variant_id` null = o produto
 * inteiro voltou, então notifica também quem só queria uma cor.
 */
create or replace function public.notify_restock(p_product_id uuid, p_variant_id uuid default null)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_product record;
  v_alert   record;
  v_label   text;
begin
  select id, name, slug into v_product
  from public.store_products where id = p_product_id;
  if not found then return; end if;

  for v_alert in
    select a.id, a.user_id, a.variant_id
    from public.store_restock_alerts a
    where a.product_id = p_product_id
      and a.notified_at is null
      -- Voltou o produto inteiro: avisa todo mundo. Voltou só uma cor: avisa
      -- quem pediu essa cor e quem pediu "qualquer cor".
      and (p_variant_id is null or a.variant_id is null or a.variant_id = p_variant_id)
  loop
    select label into v_label
    from public.store_product_variants
    where id = coalesce(p_variant_id, v_alert.variant_id);

    perform public.push_notification(
      p_user_id     => v_alert.user_id,
      p_type        => 'store_restock',
      p_entity_type => 'store_product',
      p_entity_id   => v_product.id,
      p_link        => '/loja/' || v_product.slug,
      p_title       => v_product.name,
      p_body        => v_label
    );

    update public.store_restock_alerts set notified_at = now() where id = v_alert.id;
  end loop;
end;
$$;

/** Produto saiu do esgotado (na mão ou por estoque reposto). */
create or replace function public.trg_store_product_restock()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_was_out bool := old.is_sold_out or (old.stock is not null and old.stock = 0);
  v_is_out  bool := new.is_sold_out or (new.stock is not null and new.stock = 0);
begin
  -- Só avisa quando de fato saiu do esgotado E continua visível na loja.
  if v_was_out and not v_is_out and new.is_active then
    perform public.notify_restock(new.id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_store_products_restock on public.store_products;
create trigger trg_store_products_restock
  after update on public.store_products
  for each row execute function public.trg_store_product_restock();

/** Uma cor específica voltou. */
create or replace function public.trg_store_variant_restock()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_was_out bool := old.is_sold_out or (old.stock is not null and old.stock = 0);
  v_is_out  bool := new.is_sold_out or (new.stock is not null and new.stock = 0);
begin
  if v_was_out and not v_is_out and new.is_active then
    perform public.notify_restock(new.product_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_store_product_variants_restock on public.store_product_variants;
create trigger trg_store_product_variants_restock
  after update on public.store_product_variants
  for each row execute function public.trg_store_variant_restock();
