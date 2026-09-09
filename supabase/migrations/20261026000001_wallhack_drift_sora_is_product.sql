-- Correção de catálogo: "Wallhack Drift Sora" foi cadastrado como
-- `kind='avatar_frame'`, mas é um PRODUTO físico (ligado a um periférico) —
-- unidade limitada, sem desconto VIP, trava de nível verificado. Estava
-- aparecendo na grade genérica de cosméticos com um selo "−10% VIP" que
-- produto nunca tem.
--
-- Seguro converter: 0 posses, 0 compras, ninguém com a moldura equipada
-- (verificado antes de escrever). `frame_asset_url` some — produto não tem
-- asset sobreposto ao avatar, a foto vai em `image_url` (já preenchida).
--
-- Idempotente: o `where kind = 'avatar_frame'` faz a migration não ter efeito
-- se rodar duas vezes.
update public.aura_items
set kind = 'peripheral',
    frame_asset_url = null,
    stock = greatest(stock, 1)
where slug = 'wallhack-drift-sora'
  and kind = 'avatar_frame';
