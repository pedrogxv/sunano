-- Adiciona categorias de fórum: Setup, Dúvida, Ajuda
insert into public.forum_categories (slug, name, sort_order) values
  ('setup',  'Setup',  13),
  ('duvida', 'Dúvida', 14),
  ('ajuda',  'Ajuda',  15)
on conflict do nothing;
