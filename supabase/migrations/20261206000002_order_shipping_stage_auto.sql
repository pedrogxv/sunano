-- "Aguardando dados de entrega" deixa de ser um botão do admin e passa a ser
-- consequência do dado: o pedido pago de item físico fica nesse status
-- enquanto o cliente não informou o endereço, e sai dele sozinho quando
-- informa.
--
-- Fluxo pós-venda de produto físico:
--   pending -> awaiting_shipping_info (pago, sem endereço)
--           -> paid ("Pedido feito": pago, com endereço, esperando o produto
--              chegar ao armazém para ser postado)
--           -> shipped (admin, com código de rastreio)
--           -> delivered (admin OU o próprio cliente, "Já recebi")
--
-- Antes, `awaiting_shipping_info` tinha o rótulo "Aguardando dados de
-- entrega" mas era o admin que clicava para entrar nele, e na prática
-- significava o contrário ("tem endereço, falta despachar"): a rota de
-- endereço movia `paid -> awaiting_shipping_info` justamente quando o dado
-- chegava. O admin via um botão pedindo que ele marcasse uma pendência que
-- era do cliente.
--
-- Em trigger, não na rota, pelo mesmo motivo do aviso de pedido pago: são três
-- caminhos até `paid` (webhook de PIX, webhook do checkout de cartão, resgate
-- da Central de Aura) mais o estorno desfeito em `syncOrderRefundState`, e o
-- que ficasse de fora mostraria "Pedido feito" para quem nunca deu endereço.
--
-- Só mexe entre os dois status pré-despacho. `shipped` em diante não volta, e
-- serviço/digital (`requires_shipping_address = false`) nunca precisa de
-- endereço: fica em `paid` até o admin concluir.

create or replace function public.trg_store_orders_shipping_stage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status not in ('paid', 'awaiting_shipping_info') then
    return new;
  end if;

  if new.requires_shipping_address is distinct from false
     and new.shipping_address_filled_at is null then
    new.status := 'awaiting_shipping_info';
  else
    new.status := 'paid';
  end if;

  return new;
end;
$$;

revoke execute on function public.trg_store_orders_shipping_stage() from public, anon, authenticated;

-- BEFORE: o status gravado já sai certo, e o trigger AFTER de aviso aos admins
-- (20261209000000) enxerga o valor final.
drop trigger if exists trg_store_orders_shipping_stage on public.store_orders;
create trigger trg_store_orders_shipping_stage
  before insert or update of status, shipping_address_filled_at, requires_shipping_address
  on public.store_orders
  for each row execute function public.trg_store_orders_shipping_stage();

-- Pedidos já existentes: mesma regra do trigger. Hoje há `paid` sem endereço
-- (compra que pulou o CEP) e `awaiting_shipping_info` com endereço (o que a
-- rota de endereço fazia). Só as linhas que mudam, para não gerar UPDATE à toa.
update public.store_orders
set status = case
  when requires_shipping_address is distinct from false
       and shipping_address_filled_at is null then 'awaiting_shipping_info'
  else 'paid'
end
where status in ('paid', 'awaiting_shipping_info')
  and status is distinct from case
    when requires_shipping_address is distinct from false
         and shipping_address_filled_at is null then 'awaiting_shipping_info'
    else 'paid'
  end;
