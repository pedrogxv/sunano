-- RESTAURADA A PARTIR DO BANCO REMOTO (2026-09-12).
--
-- Esta migration foi aplicada direto no banco, sem que o arquivo
-- chegasse ao repositório — o histórico local e o remoto divergiram, e
-- `supabase db push` passou a recusar QUALQUER migration nova com
-- LegacyDbPushMissingLocalError. O conteúdo abaixo é o SQL real gravado
-- em `supabase_migrations.schema_migrations`, recuperado para o repo.
--
-- NÃO reexecutar manualmente: já está aplicada no remoto. O arquivo
-- existe para o histórico bater e para o próximo `db push` funcionar.
-- Ver AGENTS.md, seção de drift de histórico.

-- ============================================================================
-- Fechamento de escrita aberta via PostgREST (varredura 2026-09-11)
--
-- Continuação de 20261102000000_fix_privilege_escalation_rls.sql. Aquele fechou
-- admin_profiles/user_profiles. Esta varredura leu as policies VIVAS em
-- produção (pg_policies) em vez dos arquivos de migration, e achou buracos que
-- não estavam no relatório original:
--
--  1. peripherals  - INSERT/UPDATE/DELETE com predicado `true` para o role
--     `authenticated`. Qualquer usuário logado podia editar ou APAGAR o
--     catálogo inteiro escrevendo direto na API REST. Os grants confirmam
--     DELETE/INSERT/UPDATE para anon e authenticated, então a RLS era o único
--     portão - e ela estava escancarada.
--  2. blog_posts   - idem. Qualquer usuário logado podia publicar, editar ou
--     apagar artigos (defacement + conteúdo arbitrário no site).
--  3. home_banners - bastava EXISTIR uma linha em admin_profiles, de qualquer
--     cargo, sem checar a permissão granular `banners_write`.
--  4. forum_aura   - `for all using (auth.uid() = giver_id)` deixava o usuário
--     inserir/apagar reações direto, pulando os limites diários, o limite por
--     par e a trava de auto-reação que vivem na RPC `toggle_forum_aura`.
--  5. user_tierlist_meta - a policy de UPDATE do dono não restringe COLUNAS
--     (mesma classe de bug do `account_tier`): o dono podia escrever
--     `hearts_count` direto e inflar o próprio ranking em /tierlist/comunidade.
--     A trigger `sync_user_tierlist_hearts_count` só corrige no próximo
--     heart/unheart, então o número forjado persiste.
--  6. tierlist oculta - `is_hidden` some da UI e da view pública, mas as três
--     tabelas tinham SELECT `using (true)`: dava pra ler a tierlist escondida
--     (e o `note`) direto na API REST com a chave anon.
--
-- Estratégia: escrita administrativa passa a exigir a MESMA permissão granular
-- que a rota já checa na camada de app (admin_has_permission), então o painel
-- continua funcionando igual - inclusive /api/admin/blog, que escreve com o
-- client de SESSÃO e não com service_role. Onde não existe escrita legítima
-- pelo cliente, a policy some de vez e sobra só service_role.
--
-- Guard de coluna é feito por TRIGGER, não por policy: só no trigger existem
-- OLD/NEW. Mesmo padrão de 20261102000000.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. peripherals - escrita exige peripherals_write
-- ---------------------------------------------------------------------------
drop policy if exists "Peripherals can be inserted by authenticated users" on public.peripherals;
drop policy if exists "Peripherals can be updated by authenticated users" on public.peripherals;
drop policy if exists "Peripherals can be deleted by authenticated users" on public.peripherals;
create policy "Peripherals insert requires peripherals_write"
on public.peripherals for insert to authenticated
with check (public.admin_has_permission('peripherals_write'));
create policy "Peripherals update requires peripherals_write"
on public.peripherals for update to authenticated
using (public.admin_has_permission('peripherals_write'))
with check (public.admin_has_permission('peripherals_write'));
create policy "Peripherals delete requires peripherals_write"
on public.peripherals for delete to authenticated
using (public.admin_has_permission('peripherals_write'));
-- ---------------------------------------------------------------------------
-- 2. blog_posts - escrita exige blog_write
--
-- /api/admin/blog/route.ts escreve com createSupabaseServerClient (token do
-- admin logado), não com service_role - por isso a policy precisa permitir o
-- admin autenticado, e não só sumir.
-- ---------------------------------------------------------------------------
drop policy if exists "Blog posts can be inserted by authenticated users" on public.blog_posts;
drop policy if exists "Blog posts can be updated by authenticated users" on public.blog_posts;
drop policy if exists "Blog posts can be deleted by authenticated users" on public.blog_posts;
create policy "Blog posts insert requires blog_write"
on public.blog_posts for insert to authenticated
with check (public.admin_has_permission('blog_write'));
create policy "Blog posts update requires blog_write"
on public.blog_posts for update to authenticated
using (public.admin_has_permission('blog_write'))
with check (public.admin_has_permission('blog_write'));
create policy "Blog posts delete requires blog_write"
on public.blog_posts for delete to authenticated
using (public.admin_has_permission('blog_write'));
-- ---------------------------------------------------------------------------
-- 3. home_banners - exige banners_write, não "ser admin qualquer"
-- ---------------------------------------------------------------------------
drop policy if exists "Admins manage home banners" on public.home_banners;
create policy "Home banners manage requires banners_write"
on public.home_banners for all to authenticated
using (public.admin_has_permission('banners_write'))
with check (public.admin_has_permission('banners_write'));
-- ---------------------------------------------------------------------------
-- 4. forum_aura - cliente perde a escrita; leitura da própria reação fica
--
-- Toda reação passa por toggle_forum_aura / toggle_forum_post_aura (chamadas
-- com service_role em lib/server/repositories/aura-repository.ts), que é onde
-- vivem os limites. Escrever direto na tabela pulava tudo isso.
-- ---------------------------------------------------------------------------
drop policy if exists "Users manage their own aura" on public.forum_aura;
create policy "Users read their own aura reactions"
on public.forum_aura for select to authenticated
using (auth.uid() = giver_id);
-- ---------------------------------------------------------------------------
-- 5. user_tierlist_meta - hearts_count deixa de ser escrevível pelo cliente
-- ---------------------------------------------------------------------------
create or replace function public.guard_user_tierlist_meta_columns()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role','') = 'service_role'
     or auth.role() = 'service_role' then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    new.hearts_count := 0;
    return new;
  end if;

  -- Silent revert, mesmo padrão de user_profiles: um "salvar" que reenvie a
  -- linha inteira não quebra, só não consegue mexer no contador.
  new.hearts_count := old.hearts_count;
  return new;
end $fn$;
drop trigger if exists trg_guard_user_tierlist_meta_columns on public.user_tierlist_meta;
create trigger trg_guard_user_tierlist_meta_columns
  before insert or update on public.user_tierlist_meta
  for each row execute function public.guard_user_tierlist_meta_columns();
-- ---------------------------------------------------------------------------
-- 6. Tierlist oculta deixa de ser legível pela chave anon
--
-- Todas as leituras do app passam por service_role
-- (lib/server/repositories/user-tierlist-repository.ts), que ignora RLS - então
-- restringir aqui não muda nada para o site e fecha o acesso direto.
-- ---------------------------------------------------------------------------
drop policy if exists "Tierlist items are publicly readable" on public.user_tierlist_items;
create policy "Tierlist items are publicly readable"
on public.user_tierlist_items for select
using (
  auth.uid() = user_id
  or not exists (
    select 1 from public.user_tierlist_meta m
    where m.user_id = user_tierlist_items.user_id and m.is_hidden
  )
);
drop policy if exists "Tierlist tiers are publicly readable" on public.user_tierlist_tiers;
create policy "Tierlist tiers are publicly readable"
on public.user_tierlist_tiers for select
using (
  auth.uid() = user_id
  or not exists (
    select 1 from public.user_tierlist_meta m
    where m.user_id = user_tierlist_tiers.user_id and m.is_hidden
  )
);
drop policy if exists "Tierlist meta is publicly readable" on public.user_tierlist_meta;
create policy "Tierlist meta is publicly readable"
on public.user_tierlist_meta for select
using (auth.uid() = user_id or not is_hidden);
-- ---------------------------------------------------------------------------
-- 7. Bucket `peripherals` - teto de tamanho e allowlist de MIME
--
-- O bucket estava sem limite de tamanho E sem restrição de MIME. A policy
-- "Scoped upload access" deixa o usuário subir `user-avatar-<uid>-*`,
-- `forum-post-<uid>-*` etc. direto no Storage, pulando as rotas - ou seja,
-- qualquer arquivo, de qualquer tipo, de qualquer tamanho. As rotas já
-- validam jpeg/png/webp/gif e no máximo UPLOAD_LIMITS.image (20MB); isto só
-- replica o mesmo teto na borda do Storage.
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'peripherals'
