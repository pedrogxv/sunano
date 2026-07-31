-- Corrige `claim_event_medal` (20260804_events.sql): o contador `current_count`
-- era incrementado incondicionalmente após o `insert ... on conflict do nothing`
-- em `user_medals`. Numa chamada duplicada para um usuário que já tinha a
-- medalha (ex.: cadastro chamado duas vezes por retry/erro de rede), o insert
-- virava no-op mas o contador subia mesmo assim — inflando `current_count`
-- acima da quantidade real de usuários que ganharam a medalha, podendo fechar
-- o evento (`active = false`) antes de bater os `max_participants` reais.
--
-- Auditoria em produção confirmou o sintoma: current_count chegou a 14
-- enquanto só 12 usuários distintos tinham a medalha `pioneiro`. Este arquivo
-- corrige a função e reconcilia os contadores existentes.

create or replace function public.claim_event_medal(p_event_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare
  v_medal_id uuid;
  v_max integer;
  v_count integer;
  v_inserted integer;
begin
  select medal_id, max_participants, current_count
    into v_medal_id, v_max, v_count
  from public.events
  where id = p_event_id and active = true
  for update;

  if not found or v_count >= v_max then
    return false;
  end if;

  insert into public.user_medals (user_id, medal_id)
  values (p_user_id, v_medal_id)
  on conflict (user_id, medal_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Usuário já tinha a medalha (chamada duplicada): não conta a vaga de novo.
  if v_inserted = 0 then
    return true;
  end if;

  update public.events
  set current_count = current_count + 1,
      active = (current_count + 1 < v_max),
      end_date = case when current_count + 1 >= v_max then now() else end_date end,
      updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

-- Reconcilia o drift já existente: recalcula `current_count` de cada evento
-- a partir da contagem real de `user_medals` para a medalha vinculada, e
-- reabre o evento se a contagem corrigida ficar abaixo de `max_participants`.
update public.events e
set current_count = real_count.n,
    active = real_count.n < e.max_participants,
    updated_at = now()
from (
  select medal_id, count(*) as n
  from public.user_medals
  group by medal_id
) real_count
where real_count.medal_id = e.medal_id
  and e.current_count <> real_count.n;
