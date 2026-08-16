-- Amplia o sistema de notificações (20260819_notifications.sql) para cobrir
-- mudança de status de pedido. Diferente dos outros tipos, este NÃO nasce de
-- trigger: é disparado por chamada explícita em orders-repository.ts, porque
-- store_orders não tem (nem precisa ganhar aqui) um trigger de pós-venda.

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system',
    'mention', 'new_post', 'order_status'
  ));

alter table public.notifications
  drop constraint if exists notifications_entity_type_check;
alter table public.notifications
  add constraint notifications_entity_type_check check (entity_type in (
    'forum_post', 'forum_comment', 'blog_post', 'blog_comment', 'user', 'peripheral', 'order'
  ));
