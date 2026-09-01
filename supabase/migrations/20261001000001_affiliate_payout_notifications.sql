-- Notificação de mudança de status do saque do afiliado.
--
-- Diferente das RPCs de `20261001000000_affiliate_payout_flow.sql`, este
-- arquivo é só constraint — pode ir por `supabase db push` normalmente.
--
-- Novo tipo `affiliate_payout` + nova entidade `affiliate_payout`. A lista
-- inteira é repetida porque o check é reescrito, não estendido (mesmo padrão
-- de 20260921000017 e 20260929000000).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'aura_received', 'post_comment', 'comment_reply', 'new_follower', 'system', 'mention',
  'new_post', 'order_status', 'support_reply', 'support_new_ticket', 'support_user_reply',
  'support_status', 'store_restock', 'affiliate_payout'
));

alter table public.notifications drop constraint if exists notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check (entity_type in (
  'forum_post', 'forum_comment', 'blog_post', 'blog_comment', 'user', 'peripheral', 'order',
  'support_ticket', 'store_product', 'affiliate_payout'
));
