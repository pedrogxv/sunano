-- Nome de exibição único + URL de perfil pelo nome (`/perfil/joao-silva`).
--
-- Até aqui `display_name` era texto livre e repetível, e o perfil público só
-- era alcançável pelo UUID. Duas pessoas podiam usar o mesmo nome no fórum e
-- ninguém era encontrável pelo nome.
--
-- A unicidade é decidida pelo *slug* do nome, não pelo texto cru: "João
-- Silva", "joao silva" e "JOAO  SILVA" produzem `joao-silva` e portanto
-- colidem entre si. O nome continua livre para exibição (acentos, espaços,
-- maiúsculas).
--
-- A garantia mora aqui e não só na aplicação porque a policy "Users can
-- manage their own profile" (auth.uid() = id) deixa o próprio usuário
-- escrever em `user_profiles` via PostgREST — sem o trigger + índice único,
-- bastaria um UPDATE direto para roubar o nome de outro.
--
-- lib/profile-name.ts espelha `slugify_display_name` no cliente (preview da
-- URL e checagem de disponibilidade). O valor gravado é sempre o daqui.

-- ────────────────────────────────────────────
-- 1. Slug do nome — determinístico e IMMUTABLE (usado em índice)
-- ────────────────────────────────────────────
create or replace function public.slugify_display_name(name text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      -- Corta em 40 e remove um "-" que tenha sobrado na ponta.
      left(
        regexp_replace(
          translate(
            replace(replace(replace(lower(coalesce(name, '')), 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'),
            -- Mesmo comprimento e posição a posição (28 caracteres), igual ao
            -- mapa de lib/profile-name.ts.
            'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ',
            'aaaaaaceeeeiiiinoooooouuuuyy'
          ),
          '[^a-z0-9]+', '-', 'g'
        ),
        40
      ),
      '^-|-$', '', 'g'
    ),
    ''
  );
$$;

comment on function public.slugify_display_name(text) is
  'Identificador público derivado do nome de exibição. Espelhado em lib/profile-name.ts.';

-- ────────────────────────────────────────────
-- 2. Resolve os nomes que já existem
--    A conta mais antiga fica com o nome; as demais ganham sufixo numérico.
--    Nome vazio (ou só emoji/símbolos, que não geram slug) vira user-<id>.
-- ────────────────────────────────────────────
do $$
declare
  r              record;
  base_name      text;
  candidate_name text;
  candidate_slug text;
  attempt        int;
begin
  create temp table _slugs_taken (slug text primary key) on commit drop;

  for r in
    select id, display_name, created_at
    from public.user_profiles
    order by created_at nulls last, id
  loop
    -- Corta em 30 (o máximo do produto, ver lib/profile-name.ts). Isso também
    -- garante que o sufixo numérico caiba dentro dos 40 do slug: com um nome
    -- de 40+ caracteres o "2" cairia fora do corte, o slug não mudaria e o
    -- laço abaixo giraria para sempre.
    base_name := left(coalesce(nullif(btrim(r.display_name), ''), ''), 30);
    candidate_slug := public.slugify_display_name(base_name);

    if candidate_slug is null or char_length(candidate_slug) < 2 then
      base_name := 'user-' || left(replace(r.id::text, '-', ''), 8);
      candidate_slug := public.slugify_display_name(base_name);
    end if;

    candidate_name := base_name;
    attempt := 1;

    -- O sufixo pode colidir com um nome que já existe ("tried2" ocupado),
    -- por isso tenta até achar um livre em vez de somar 1 uma única vez.
    while exists (select 1 from _slugs_taken t where t.slug = candidate_slug) loop
      attempt := attempt + 1;
      if attempt > 500 then
        -- Rede de segurança: nome derivado do id, que não disputa com ninguém.
        candidate_name := 'user-' || left(replace(r.id::text, '-', ''), 8);
        candidate_slug := public.slugify_display_name(candidate_name);
        exit;
      end if;
      candidate_name := base_name || attempt::text;
      candidate_slug := public.slugify_display_name(candidate_name);
    end loop;

    insert into _slugs_taken (slug) values (candidate_slug);

    if candidate_name is distinct from r.display_name then
      update public.user_profiles set display_name = candidate_name where id = r.id;
    end if;
  end loop;
end $$;

-- ────────────────────────────────────────────
-- 3. Coluna do slug, mantida pelo banco
-- ────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists display_slug text;

update public.user_profiles
   set display_slug = public.slugify_display_name(display_name)
 where display_slug is distinct from public.slugify_display_name(display_name);

create or replace function public.sync_display_slug()
returns trigger
language plpgsql
as $$
declare
  candidate text;
begin
  candidate := public.slugify_display_name(new.display_name);

  -- Nome ausente ou sem letras/números (só emoji, só pontuação): nenhuma linha
  -- pode ficar sem endereço público, então o perfil nasce com um nome derivado
  -- do id. Isto não é a validação do produto — essa vive na aplicação e
  -- devolve erro ao usuário; aqui é só a rede de segurança para escritas que
  -- não passam por lá (upsert de consentimento LGPD, login social, SQL direto).
  if candidate is null or char_length(candidate) < 2 then
    new.display_name := 'user-' || left(replace(new.id::text, '-', ''), 8);
    candidate := public.slugify_display_name(new.display_name);
  end if;

  new.display_slug := candidate;
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_display_slug on public.user_profiles;
create trigger trg_user_profiles_display_slug
  before insert or update on public.user_profiles
  for each row execute function public.sync_display_slug();

alter table public.user_profiles
  alter column display_slug set not null;

-- Unicidade real do nome de exibição. O nome da constraint aparece no erro
-- 23505 e é traduzido por lib/db-errors.ts.
drop index if exists public.user_profiles_display_slug_key;
create unique index user_profiles_display_slug_key
  on public.user_profiles (display_slug);

comment on column public.user_profiles.display_slug is
  'Slug único derivado de display_name (trigger). É o segmento da URL /perfil/<slug>.';
