-- Aviso no sino da equipe quando chega um pedido de cadastro de periférico.
--
-- Sobe DEPOIS do deploy do front. O build anterior não conhece o tipo
-- `peripheral_request_new`: `ICONS[n.type]` saía undefined e o React derrubava a lista do
-- sino inteira para quem recebesse o aviso. Por isso o prefixo fica acima de
-- 20261208*, que precisam ir ANTES do deploy (o código novo lê as colunas).
--
-- A fila de Cadastros (/admin/perifericos/pedidos) só aparecia como o número
-- no badge da sidebar, que a equipe só vê com o painel aberto. Um pedido novo
-- ficava parado até alguém entrar no painel por outro motivo.
--
-- Em trigger, não na rota, pelo mesmo motivo das outras notificações
-- (trg_notify_admins_order_paid, trg_notify_support_user_message): nenhum
-- caminho novo de criação precisa lembrar de avisar.
--
-- Quem recebe: webmaster e quem tem `peripherals_read`, que é a mesma
-- permissão que abre a fila no painel (AdminSidebar). Avisar quem não tem a
-- permissão seria mandar um link para uma tela que responde "sem acesso".
--
-- O check de `type` é reescrito inteiro (Postgres não tem `add value` para
-- check), com a lista atual de 20261209000000 mais o tipo novo.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention',
  'new_post', 'order_status', 'support_reply', 'support_new_ticket', 'support_user_reply',
  'support_status', 'store_restock', 'affiliate_payout', 'rank_frame',
  'peripheral_request_status', 'order_paid', 'peripheral_request_new'
));

create or replace function public.trg_notify_staff_peripheral_request()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_admin record;
  v_actor_name text;
begin
  -- Aviso é best-effort: roda dentro do INSERT do pedido, e falhar ao avisar
  -- não pode desfazer o pedido que a pessoa acabou de mandar.
  begin
    v_actor_name := public.notification_actor_name(new.user_id);

    for v_admin in
      select id from public.admin_profiles
      where role = 'webmaster' or coalesce((permissions ->> 'peripherals_read')::boolean, false)
    loop
      perform public.push_notification(
        p_user_id     => v_admin.id,
        p_type        => 'peripheral_request_new',
        -- Com `p_actor_id`: um admin que pede um cadastro não precisa ser
        -- avisado do próprio pedido (os outros continuam sendo).
        p_actor_id    => new.user_id,
        p_actor_name  => v_actor_name,
        p_entity_type => 'peripheral_request',
        p_entity_id   => new.id,
        p_link        => '/admin/perifericos/pedidos/' || new.id,
        -- Marca + modelo, igual a trg_notify_peripheral_request_status.
        p_title       => left(new.brand_name || ' ' || new.model_name, 200),
        -- Chave da categoria; o front traduz o rótulo.
        p_body        => new.category
      );
    end loop;
  exception when others then
    raise warning 'trg_notify_staff_peripheral_request falhou (pedido %): %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.trg_notify_staff_peripheral_request() from public, anon, authenticated;

drop trigger if exists trg_peripheral_requests_notify_staff on public.peripheral_requests;
create trigger trg_peripheral_requests_notify_staff
  after insert on public.peripheral_requests
  for each row execute function public.trg_notify_staff_peripheral_request();
