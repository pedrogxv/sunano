-- Dados de compra no perfil do usuário (cadastro completo).
-- Todos os campos são opcionais: o cadastro básico (apenas para comentar/
-- participar) não os preenche; o cadastro completo, para comprar, sim.
-- Rode este script no SQL editor do Supabase.

alter table public.user_profiles
  add column if not exists full_name    text,
  add column if not exists cpf          text,
  add column if not exists phone        text,
  add column if not exists postal_code  text,
  add column if not exists street       text,
  add column if not exists number       text,
  add column if not exists complement   text,
  add column if not exists neighborhood text,
  add column if not exists city         text,
  add column if not exists state        text;
