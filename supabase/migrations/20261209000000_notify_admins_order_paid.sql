-- Aviso no sino da equipe quando um pedido da loja é pago.
--
-- Sobe DEPOIS do deploy do front. O build anterior não conhece o tipo
-- `order_paid`: `ICONS[n.type]` saía undefined e o React derrubava a lista do
-- sino inteira para quem recebesse o aviso. Por isso o prefixo fica acima de
-- 20261208*, que precisam ir ANTES do deploy (o código novo lê as colunas).
--
-- Um chamado de suporte novo já avisava todo admin com `support_read`
-- (trg_notify_support_user_message), mas um pedido pago não avisava ninguém
-- no site: a venda só aparecia no canal do Discord. Na prática a equipe
-- descobria o pedido quando o cliente abria o suporte perguntando dele.
--
-- Em trigger, não na rota, pelo mesmo motivo das outras notificações: são
-- dois webhooks (PIX e checkout de cartão) mais o resgate da Central de Aura
-- chegando em `paid`, e o caminho que ficasse de fora só apareceria como
-- "vendi e ninguém viu".
--
-- Quem recebe: webmaster e quem tem `store_read`, lido da coluna
-- `permissions`, que é mantida em sincronia com a matriz de cargos (ver
-- 20260921000019_role_based_permissions.sql). Mesmo critério do fan-out de
-- suporte.
--
-- O check de `type` é reescrito inteiro (Postgres não tem `add value` para
-- check), com a lista atual de 20261130000000 mais o tipo novo.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention',
  'new_post', 'order_status', 'support_reply', 'support_new_ticket', 'support_user_reply',
  'support_status', 'store_restock', 'affiliate_payout', 'rank_frame',
  'peripheral_request_status', 'order_paid'
));

create or replace function public.trg_notify_admins_order_paid()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_admin record;
  v_actor_id uuid;
  v_items text;
  v_body text;
begin
  -- Pago sem endereço chega como `awaiting_shipping_info` (o trigger BEFORE
  -- de 20261206000002 decide entre os dois), e é venda do mesmo jeito.
  if new.status not in ('paid', 'awaiting_shipping_info') then return new; end if;
  -- Só a CHEGADA no pós-pagamento. `refunded -> paid` é o estorno desfeito em
  -- `syncOrderRefundState`, não uma venda nova; `awaiting_shipping_info ->
  -- paid` é o cliente informando o endereço; e o pedido que já andou no
  -- fluxo nunca volta para trás.
  if tg_op = 'UPDATE' and old.status not in ('pending', 'expired', 'cancelled') then
    return new;
  end if;

  -- Aviso é best-effort: esta trigger roda dentro do UPDATE que confirma o
  -- pagamento, e um `items` fora do formato ou um `user_id` inválido no
  -- metadata não pode desfazer a confirmação. Todo o resto vai neste bloco.
  begin
    v_actor_id := nullif(new.metadata ->> 'user_id', '')::uuid;

    select string_agg(
             coalesce(item ->> 'quantity', '1') || 'x ' || coalesce(item ->> 'name', 'Produto'),
             ', '
           )
      into v_items
      from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) as item;

    -- O prefixo diz de cara o que fazer: produto é separar e despachar,
    -- serviço é combinar o atendimento no chamado.
    v_body := concat_ws(
      ' · ',
      case when new.is_sandbox then 'Teste' end,
      case
        when new.payment_method = 'aura' then 'Resgate com Aura'
        when new.requires_shipping_address = false then 'Serviço'
        else 'Produto'
      end,
      v_items
    );

    for v_admin in
      select id from public.admin_profiles
      where role = 'webmaster' or coalesce((permissions ->> 'store_read')::boolean, false)
    loop
      perform public.push_notification(
        p_user_id     => v_admin.id,
        p_type        => 'order_paid',
        -- Sem `p_actor_id` de propósito: `push_notification` descarta o aviso
        -- quando autor = destinatário, e aqui o aviso é trabalho na fila, não
        -- interação social. Um admin comprando na própria loja (é assim que
        -- se testa o checkout) também precisa ver o pedido chegar.
        p_actor_name  => coalesce(nullif(new.customer_name, ''), public.notification_actor_name(v_actor_id)),
        p_entity_type => 'order',
        p_entity_id   => new.id,
        p_link        => '/admin/store/orders',
        -- Mesmo número curto de `orderNumber` (lib/order-number.ts).
        p_title       => upper(left(replace(new.id::text, '-', ''), 8)),
        p_body        => left(v_body, 140)
      );
    end loop;
  exception when others then
    raise warning 'trg_notify_admins_order_paid falhou (pedido %): %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.trg_notify_admins_order_paid() from public, anon, authenticated;

drop trigger if exists trg_store_orders_notify_admins_paid on public.store_orders;
create trigger trg_store_orders_notify_admins_paid
  after insert or update of status on public.store_orders
  for each row execute function public.trg_notify_admins_order_paid();
