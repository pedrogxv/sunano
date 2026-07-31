-- Torna atômico o "curtir periférico" do card em /perifericos.
--
-- POST /api/peripherals/:id/like fazia check-then-insert em duas queries:
-- lia os favoritos, comparava com o limite do tier e só então inseria. Dois
-- likes simultâneos do mesmo usuário (dois cliques rápidos em cards
-- diferentes, duas abas) podiam ambos ler `count = limite - 1` e ambos
-- inserir, estourando o limite do plano. Mesma classe de bug que
-- 20260724_fix_stock_oversell.sql resolveu no checkout.
--
-- O limite NÃO vive aqui: continua em lib/account-tier.ts e chega como
-- parâmetro. A migration do perfil público já estabeleceu que rebaixar um
-- usuário de tier não pode apagar dados dele, então o banco não deve ter
-- opinião sobre quantos favoritos são "válidos" — ele só garante que a
-- decisão tomada pela camada de domínio seja aplicada sem corrida.

create or replace function public.add_favorite_peripheral(
  p_user_id uuid,
  p_peripheral_id uuid,
  p_limit integer
)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_count integer;
  v_next_position smallint;
begin
  -- Serializa apenas os likes deste usuário. `count(*) ... for update` não é
  -- válido em Postgres (FOR UPDATE não combina com agregado), e travar a
  -- tabela inteira penalizaria usuários sem relação entre si.
  perform pg_advisory_xact_lock(hashtext('favorite_peripheral:' || p_user_id::text));

  if exists (
    select 1 from public.user_favorite_peripherals
    where user_id = p_user_id and peripheral_id = p_peripheral_id
  ) then
    return 'already_liked';
  end if;

  select count(*) into v_count
  from public.user_favorite_peripherals
  where user_id = p_user_id;

  if v_count >= p_limit then
    return 'limit_reached';
  end if;

  select coalesce(max(position), -1) + 1 into v_next_position
  from public.user_favorite_peripherals
  where user_id = p_user_id;

  insert into public.user_favorite_peripherals (user_id, peripheral_id, position)
  values (p_user_id, p_peripheral_id, v_next_position);

  return 'liked';
end;
$$;

-- Mesma postura de 20260718_security_hardening.sql: a função roda como
-- SECURITY DEFINER e recebe o user_id por parâmetro, então só o service-role
-- (usado pelos repositórios em lib/server/**) pode chamá-la. Exposta ao
-- `authenticated` ela permitiria favoritar em nome de outro usuário.
revoke execute on function public.add_favorite_peripheral(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.add_favorite_peripheral(uuid, uuid, integer) to service_role;
