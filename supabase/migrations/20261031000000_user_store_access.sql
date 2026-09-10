-- Liberação individual da Loja + Programa de Afiliados ("pacote Loja").
--
-- Até aqui a Loja em manutenção (STORE_MAINTENANCE_MODE=true) só tinha UM
-- bypass: ser WEB MASTER. Isso obriga a dar cargo administrativo a quem só
-- precisa testar/comprar — ou a abrir a loja para todo mundo. Esta coluna cria
-- a terceira via: um usuário comum com `store_access = true` atravessa a
-- manutenção e usa a Loja e os Afiliados exatamente como um usuário normal
-- usaria com a loja aberta (mesmas regras de estoque, preço, comissão e
-- pagamento — o flag NÃO dá nenhum privilégio além de "a loja está aberta
-- para mim").
--
-- Os dois andam juntos de propósito: sem loja aberta não há venda para
-- comissionar, então liberar afiliado sem loja não faria sentido (mesma
-- razão pela qual a env já fecha os dois juntos — ver proxy.ts).
--
-- Quem concede: SOMENTE o WEB MASTER, em /admin/users (a rota
-- PATCH /api/admin/users já exige isWebMaster).

alter table public.user_profiles
  add column if not exists store_access boolean not null default false;

comment on column public.user_profiles.store_access is
  'Libera Loja + Programa de Afiliados para este usuário mesmo com STORE_MAINTENANCE_MODE=true. Concedido só por WEB MASTER em /admin/users. Não dá privilégio nenhum além de furar a manutenção.';

-- Índice parcial: a esmagadora maioria das contas nunca recebe o acesso, então
-- o índice fica pequeno. Serve para listar/auditar quem tem o bypass ligado.
create index if not exists idx_user_profiles_store_access
  on public.user_profiles (store_access)
  where store_access;

-- ────────────────────────────────────────────
-- Guarda contra auto-concessão
--
-- A policy "Users can manage their own profile" (auth.uid() = id, ver
-- supabase/security.sql) cobre UPDATE do próprio registro — e RLS no Postgres
-- NÃO restringe por coluna. Sem esta trava, qualquer usuário logado poderia
-- dar `store_access = true` a si mesmo com a chave anon e furar a manutenção
-- sozinho. Mesmo problema já visto em `discord_user_id` (RLS `using (true)`
-- não filtra coluna).
--
-- A regra: só o service-role (as rotas do app, que já checaram isWebMaster) e
-- o WEB MASTER autenticado podem MUDAR o valor. Qualquer outro update que
-- tente alterar a coluna é silenciosamente revertido ao valor antigo, em vez
-- de dar erro — assim um PATCH legítimo de perfil (nome, avatar, endereço)
-- que reenvie a linha inteira continua funcionando.
-- ────────────────────────────────────────────
create or replace function public.enforce_store_access_grant()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.store_access is distinct from old.store_access then
    -- `auth.role()` é 'service_role' quando a escrita vem do admin client do
    -- servidor; nesse caso a autorização já foi feita na rota.
    if coalesce(auth.role(), '') <> 'service_role' and not public.is_webmaster() then
      new.store_access := old.store_access;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_store_access_grant on public.user_profiles;
create trigger trg_enforce_store_access_grant
  before update of store_access on public.user_profiles
  for each row execute function public.enforce_store_access_grant();
