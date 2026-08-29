-- Adiciona a categoria de fórum "Fontes" (análises de fontes de alimentação).
insert into public.forum_categories (slug, name, sort_order) values
  ('fontes', 'Fontes', 16)
on conflict do nothing;
