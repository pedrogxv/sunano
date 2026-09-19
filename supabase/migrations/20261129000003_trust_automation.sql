-- Automação do Trust Factor (§7 do documento): "toda ação relevante gera
-- automaticamente um evento de confiança".
--
-- ONDE A AUTOMAÇÃO MORA, E POR QUÊ
-- ---------------------------------
-- Em TRIGGER, sobre a tabela que a ação escreve — nunca dentro do corpo das
-- RPCs de Aura. Mesmo motivo das molduras de Ofensiva (`20261121000000`): as
-- RPCs de missão/aura foram recriadas meia dúzia de vezes ao longo do projeto
-- (20260808000001, 20260828, 20260930000000, 20261004000000 …), e a próxima
-- recriação que esquecer o trecho quebraria a concessão em silêncio. O único
-- ponto por onde TODAS as versões passam é a escrita na tabela. O trigger
-- mora lá.
--
-- O TETO DE +3/DIA É O QUE TORNA ISSO SEGURO
-- -------------------------------------------
-- `apply_trust_event` apara todo ganho positivo pelo teto diário, então não
-- importa quantos gatilhos positivos existam: a soma de um dia nunca passa de
-- +3. É por isso que dá para pendurar o evento na atividade comum sem virar
-- um segundo sistema de Aura — e é o que o documento pede com "ações
-- repetitivas ou artificiais podem valer 0".
--
-- O `dedupe_key` amarra cada evento a um fato único (o dia, o ciclo, a
-- denúncia), para que retry de rota, duplo clique ou reprocessamento não
-- contem duas vezes.

-- ────────────────────────────────────────────
-- 1. Missões diárias concluídas → confiança
-- ────────────────────────────────────────────
-- "cumprir missões e compromissos corretamente" (§3). A ofensiva avançar é a
-- prova de participação legítima e continuada mais barata que o site tem: ela
-- só anda quando as três missões do dia foram completadas.
--
-- `dedupe_key` inclui a data do último dia completado, então o evento entra
-- UMA vez por dia mesmo que `user_streaks` seja atualizada várias vezes.
create or replace function public.trust_on_streak_advance()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if new.last_completed_date is null then
    return new;
  end if;

  -- Só quando o dia realmente virou (a ofensiva avançou), não em toda escrita.
  if tg_op = 'UPDATE'
     and old.last_completed_date is not distinct from new.last_completed_date then
    return new;
  end if;

  perform public.apply_trust_event(
    new.user_id,
    'mission_streak',
    1,
    'positive',
    'Missões diárias concluídas',
    'system',
    'mission_streak:' || new.user_id || ':' || new.last_completed_date::text
  );

  return new;
end;
$$;

drop trigger if exists trg_trust_on_streak_advance on public.user_streaks;
create trigger trg_trust_on_streak_advance
  after insert or update on public.user_streaks
  for each row execute function public.trust_on_streak_advance();

-- ────────────────────────────────────────────
-- 2. Review de periférico publicada → confiança
-- ────────────────────────────────────────────
-- "criar comentários, reviews ou posts úteis" (§3). A review é a contribuição
-- de maior esforço do site, e a única cuja qualidade a equipe já revisa.
--
-- `is_hidden` no WHERE: review já criada oculta (por moderação) não gera
-- evento positivo. O dedupe é por review, então apagar e recriar não paga de
-- novo — mesma régua que o crédito de Aura da review já usa.
create or replace function public.trust_on_review_created()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if coalesce(new.is_hidden, false) then
    return new;
  end if;

  perform public.apply_trust_event(
    new.user_id,
    'helpful_contribution',
    1,
    'positive',
    'Avaliação de periférico publicada',
    'system',
    'review:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists trg_trust_on_review_created on public.peripheral_reviews;
create trigger trg_trust_on_review_created
  after insert on public.peripheral_reviews
  for each row execute function public.trust_on_review_created();

-- ────────────────────────────────────────────
-- 3. Conteúdo ocultado por moderação → penalidade
-- ────────────────────────────────────────────
-- "conteúdo removido por infração: -1 a -2" (§4). Entra com -2 (o topo da
-- faixa, que é o valor que o documento lista primeiro) e severidade leve, que
-- começa a perder peso após 30 dias.
--
-- CUIDADO QUE ESTE TRIGGER TOMA: `is_hidden` é a MESMA coluna que o próprio
-- dono usa para ocultar o que escreveu, e que `admin_ban_account` usa em massa.
-- Penalizar toda transição para `true` puniria alguém por apagar o próprio
-- post, e puniria o banido uma vez por conteúdo (dezenas de eventos por um
-- único ban, que já é evento crítico à parte). Por isso o evento só nasce
-- quando a linha tem denúncia revisada — é o que caracteriza "removido por
-- infração", e não "removido".
create or replace function public.trust_on_forum_post_hidden()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if coalesce(old.is_hidden, false) or not coalesce(new.is_hidden, false) then
    return new;
  end if;

  -- Só conta como infração se houve denúncia revisada sobre este conteúdo.
  if not exists (
    select 1 from public.forum_reports
    where post_id = new.id and target_type = 'post' and status = 'reviewed'
  ) then
    return new;
  end if;

  perform public.apply_trust_event(
    new.user_id,
    'content_removed',
    -2,
    'light',
    'Post removido por infração',
    'moderation',
    'content_removed:post:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists trg_trust_on_forum_post_hidden on public.forum_posts;
create trigger trg_trust_on_forum_post_hidden
  after update of is_hidden on public.forum_posts
  for each row execute function public.trust_on_forum_post_hidden();

create or replace function public.trust_on_forum_comment_hidden()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if coalesce(old.is_hidden, false) or not coalesce(new.is_hidden, false) then
    return new;
  end if;

  if not exists (
    select 1 from public.forum_reports
    where comment_id = new.id and target_type = 'comment' and status = 'reviewed'
  ) then
    return new;
  end if;

  perform public.apply_trust_event(
    new.user_id,
    'content_removed',
    -2,
    'light',
    'Comentário removido por infração',
    'moderation',
    'content_removed:comment:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists trg_trust_on_forum_comment_hidden on public.forum_comments;
create trigger trg_trust_on_forum_comment_hidden
  after update of is_hidden on public.forum_comments
  for each row execute function public.trust_on_forum_comment_hidden();

-- ────────────────────────────────────────────
-- 4. Detecção de padrões suspeitos (§12, item 6)
-- ────────────────────────────────────────────
-- Roda na rotina diária. Duas detecções que os dados já sustentam hoje, sem
-- schema novo:
--
--   AURA_FARMING — concentração: a pessoa gastou o teto diário de reações
--   quase todo em POUCOS destinatários, repetidamente. Reação espalhada é uso
--   normal; reação concentrada em 1–2 contas, dia após dia, é o padrão de
--   troca mútua que o teto por par já tenta conter.
--
--   SPAM — volume de denúncias REVISADAS (não apenas abertas: denúncia
--   pendente é acusação, não fato) num intervalo curto.
--
-- MULTI_ACCOUNT não entra aqui de propósito: o sinal confiável para isso é o
-- de identidade do programa de indicação (CPF/`identity_id`), que já tem
-- anti-fraude próprio, e uma heurística fraca aqui levantaria flag em irmãos
-- na mesma casa. Fica para levantamento manual pelo painel.
create or replace function public.trust_detect_suspicious()
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  -- Farming: nos últimos 7 dias, deu muita reação concentrada em pouca gente.
  for v_row in
    select l.giver_id as user_id,
           count(*) as given,
           count(distinct l.user_id) as targets
    from public.aura_ledger l
    where l.giver_id is not null
      and l.created_at >= now() - interval '7 days'
      and l.reason in (
        'post_aura_received', 'comment_aura_received', 'blog_comment_aura_received',
        'peripheral_comment_aura_received'
      )
    group by l.giver_id
    having count(*) >= 60 and count(distinct l.user_id) <= 3
  loop
    perform public.raise_trust_flag(
      v_row.user_id,
      'AURA_FARMING',
      format('%s reações em 7 dias concentradas em %s destinatário(s)', v_row.given, v_row.targets),
      null,
      jsonb_build_object('given', v_row.given, 'targets', v_row.targets)
    );
    v_count := v_count + 1;
  end loop;

  -- Spam: 3+ denúncias REVISADAS sobre conteúdo da pessoa em 30 dias.
  for v_row in
    select p.user_id, count(*) as reports
    from public.forum_reports r
    join public.forum_posts p on p.id = r.post_id
    where r.status = 'reviewed'
      and r.created_at >= now() - interval '30 days'
    group by p.user_id
    having count(*) >= 3
  loop
    perform public.raise_trust_flag(
      v_row.user_id,
      'SPAM',
      format('%s denúncias revisadas em 30 dias', v_row.reports),
      null,
      jsonb_build_object('reports', v_row.reports)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.trust_detect_suspicious() from public, anon, authenticated;
grant execute on function public.trust_detect_suspicious() to service_role;

-- ────────────────────────────────────────────
-- 5. A rotina diária completa
-- ────────────────────────────────────────────
-- Um único ponto de entrada para o cron: recalcula (recuperação + maturidade)
-- e depois varre padrões suspeitos. A ordem importa — a flag levantada pela
-- detecção muda `trust_status`, que o recálculo do dia seguinte considera.
create or replace function public.trust_daily_job()
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_recalculated integer;
  v_flagged      integer;
begin
  v_recalculated := public.trust_daily_recalc();
  v_flagged := public.trust_detect_suspicious();

  return jsonb_build_object(
    'recalculated', v_recalculated,
    'flagged', v_flagged
  );
end;
$$;

revoke execute on function public.trust_daily_job() from public, anon, authenticated;
grant execute on function public.trust_daily_job() to service_role;
