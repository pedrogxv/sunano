-- Depoimentos de clientes cadastrados pelo admin: gente que comprou FORA do
-- site (WhatsApp, Instagram, Discord, marketplace) e ainda não tem conta ou
-- pedido aqui. É separado de store_product_reviews de propósito: aquela tabela
-- exige user_id + pedido pago e carrega o selo "Compra verificada". Misturar os
-- dois faria o selo mentir. Aqui a tela diz a origem ("Depoimento de cliente")
-- e pode mostrar a PROVA (print da conversa ou foto do produto recebido).
-- Tabela nasce sem grant para anon/authenticated: leitura só pela rota.
create table if not exists public.store_testimonials (
  id              uuid primary key default gen_random_uuid(),
  customer_name   text not null check (char_length(customer_name) between 1 and 80),
  source          text not null default 'other'
                  check (source in ('whatsapp', 'instagram', 'discord', 'marketplace', 'other')),
  product_id      uuid references public.store_products(id) on delete set null,
  product_label   text check (product_label is null or char_length(product_label) <= 120),
  rating          integer not null check (rating between 1 and 5),
  body            text not null check (char_length(body) between 1 and 1500),
  proof_image_url text,
  purchased_on    date,
  is_published    boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists store_testimonials_published_idx
  on public.store_testimonials (is_published, sort_order, created_at desc);

drop trigger if exists store_testimonials_updated_at on public.store_testimonials;
create trigger store_testimonials_updated_at
  before update on public.store_testimonials
  for each row execute function public.set_updated_at();

alter table public.store_testimonials enable row level security;
-- Sem policy: escrita e leitura só via service_role (rotas do Next).
revoke all on public.store_testimonials from anon, authenticated;
