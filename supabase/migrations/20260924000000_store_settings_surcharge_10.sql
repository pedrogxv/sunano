-- Sobe o acréscimo padrão do cartão de 5% para 10% — atualiza a linha única
-- existente (não só o default da coluna, que só vale pra novas linhas).
update public.store_settings
  set card_surcharge_percent = 10.00
  where card_surcharge_percent = 5.00;

alter table public.store_settings
  alter column card_surcharge_percent set default 10.00;
