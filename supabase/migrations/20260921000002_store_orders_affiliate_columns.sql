-- Atribuição de venda a um afiliado. Colunas tipadas (não jsonb `metadata`)
-- para ficar filtrável/indexável em relatórios — mesmo padrão de
-- `asaas_payment_id`/`misticpay_transaction_id` já serem colunas próprias.
--
-- `affiliate_id` referencia o cadastro atual; `affiliate_code` é o snapshot
-- textual do código clicado no momento da compra, sobrevive a uma eventual
-- troca de código do afiliado depois (auditoria histórica).
--
-- IMPORTANTE — aplicar manualmente via Supabase Dashboard (SQL Editor): o
-- histórico de migrations deste projeto está dessincronizado desde 04/08,
-- não rodar via `supabase db push`.

alter table public.store_orders
  add column if not exists affiliate_id uuid references public.affiliates(id),
  add column if not exists affiliate_code text;

-- Parcial: a esmagadora maioria dos pedidos não tem afiliado.
create index if not exists store_orders_affiliate_idx
  on public.store_orders (affiliate_id)
  where affiliate_id is not null;
