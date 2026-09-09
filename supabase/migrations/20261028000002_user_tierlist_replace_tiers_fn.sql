-- Troca o conjunto inteiro de tiers do usuário numa transação só.
--
-- Por que função e não uma sequência de chamadas do supabase-js: cada
-- statement do client roda em autocommit, então uma reordenação feita em
-- várias idas ao banco esbarra na unique (user_id, position) no meio do
-- caminho — o tier que sai da posição 0 antes de o outro entrar. Aqui tudo
-- acontece na mesma transação e a constraint (DEFERRABLE INITIALLY DEFERRED,
-- ver a migration de criação da tabela) só é checada no commit, com as
-- posições já finais. De quebra some o estado parcial: se qualquer passo
-- falhar, nada é gravado.
--
-- Contrato de retorno, no mesmo estilo de `redeem_aura_peripheral`:
--   'ok'            — gravado
--   'in_use:<label>'— um tier que sairia da lista ainda tem periférico dentro
--   'bad_count'     — fora do intervalo de 2 a 6 tiers
--   'bad_ids'       — a lista traz id de tier que não é do usuário
-- Rótulo/cor inválidos ficam por conta dos CHECKs da tabela (a rota já valida
-- antes, isto é a última linha).
create or replace function public.replace_user_tierlist_tiers(
  p_user_id uuid,
  p_tiers   jsonb
)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_count    integer;
  v_kept     uuid[];
  v_blocking text;
  v_tier     jsonb;
  v_index    integer := 0;
begin
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then
    return 'bad_count';
  end if;

  v_count := jsonb_array_length(p_tiers);
  if v_count < 2 or v_count > 6 then
    return 'bad_count';
  end if;

  -- Ids que continuam existindo. Tier novo chega sem `id` e é filtrado aqui.
  select coalesce(array_agg((t.value ->> 'id')::uuid), '{}'::uuid[])
    into v_kept
  from jsonb_array_elements(p_tiers) as t
  where t.value ->> 'id' is not null;

  -- Todo id enviado tem que ser de um tier do próprio usuário. Sem esta
  -- checagem, um id de terceiro passaria pelo `v_kept` (blindando um tier que
  -- não é dele) e o UPDATE correspondente cairia no vazio por causa do
  -- `user_id = p_user_id` — o dono acabaria com menos tiers do que pediu.
  if (select count(*) from public.user_tierlist_tiers
      where user_id = p_user_id and id = any(v_kept)) <> coalesce(array_length(v_kept, 1), 0) then
    return 'bad_ids';
  end if;

  -- Apagar um tier que ainda tem periférico derruba a operação inteira: com
  -- a FK em cascade, deixar passar apagaria os itens junto sem o dono pedir.
  select tr.label into v_blocking
  from public.user_tierlist_tiers tr
  where tr.user_id = p_user_id
    and not (tr.id = any(v_kept))
    and exists (select 1 from public.user_tierlist_items i where i.tier_id = tr.id)
  limit 1;

  if v_blocking is not null then
    return 'in_use:' || v_blocking;
  end if;

  delete from public.user_tierlist_tiers tr
  where tr.user_id = p_user_id
    and not (tr.id = any(v_kept));

  -- A ordem do array É a ordem dos tiers: `position` sai do índice.
  for v_tier in select value from jsonb_array_elements(p_tiers)
  loop
    if v_tier ->> 'id' is not null then
      update public.user_tierlist_tiers
      set label      = btrim(v_tier ->> 'label'),
          color      = v_tier ->> 'color',
          position   = v_index,
          updated_at = now()
      where id = (v_tier ->> 'id')::uuid
        and user_id = p_user_id;
    else
      insert into public.user_tierlist_tiers (user_id, position, label, color)
      values (p_user_id, v_index, btrim(v_tier ->> 'label'), v_tier ->> 'color');
    end if;

    v_index := v_index + 1;
  end loop;

  return 'ok';
end;
$$;

revoke execute on function public.replace_user_tierlist_tiers(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_user_tierlist_tiers(uuid, jsonb) to service_role;
