-- Formulário pós-compra do Xianyu Express (ver lib/store-service-form.ts).
--
-- 20261228000000 criou o formulário, mas só a consulta Expert Buy foi semeada
-- (20261229000000). O Xianyu Express ficou com `service_form_fields = []`, e
-- pedido sem campo no snapshot não mostra card nenhum em Meus Pedidos.
--
-- Pedido do dono (23/10/2026): nome do item (obrigatório), link do item
-- (Taobao/Goofish) e fotos do item ou modelo.

update public.store_products
set service_form_fields = '[
  {"id": "nome-item", "label": "Nome do item", "type": "text", "required": true, "placeholder": "Ex: Logitech G Pro X Superlight 2", "options": []},
  {"id": "link-item", "label": "Link do item (Taobao/Goofish)", "type": "url", "required": false, "placeholder": "Cole o link do anúncio no Taobao ou no Goofish", "options": []},
  {"id": "fotos", "label": "Fotos do item ou modelo", "type": "image", "required": false, "placeholder": "Print do anúncio ou foto do modelo que você quer.", "options": []}
]'::jsonb
where slug = 'xianyu-express'
  and service_form_fields = '[]'::jsonb;

-- Pedidos já pagos ficaram sem o snapshot. Só os que o comprador ainda pode
-- preencher (mesma régua de `isServiceFormEditable`) e sem resposta: o que já
-- foi feito ou despachado não ganha formulário depois.
update public.store_orders o
set items = (
  select jsonb_agg(
    case
      when item->>'id' = p.id::text and not (item ? 'service_form')
        then item || jsonb_build_object('service_form', p.service_form_fields)
      else item
    end
    order by ord
  )
  from jsonb_array_elements(o.items) with ordinality as e(item, ord)
)
from public.store_products p
where p.slug = 'xianyu-express'
  and jsonb_array_length(p.service_form_fields) > 0
  and o.status in ('paid', 'awaiting_shipping_info')
  and o.service_form_answers is null
  and exists (
    select 1 from jsonb_array_elements(o.items) item
    where item->>'id' = p.id::text and not (item ? 'service_form')
  );
