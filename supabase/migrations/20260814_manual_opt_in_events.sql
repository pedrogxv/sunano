-- Eventos com resgate manual: até aqui só existia `first_n_signups`
-- (concessão automática no cadastro/login). Adiciona `manual_opt_in`, em que
-- o próprio usuário clica em "Resgatar" em `/eventos` enquanto houver vagas.
--
-- `claim_event_medal` (20260804_events.sql, corrigida em
-- 20260812_fix_event_medal_duplicate_counter.sql) não precisa mudar: ela já
-- é agnóstica ao critério — só verifica `active`/vagas e concede a medalha de
-- forma atômica e idempotente. A distinção de critério fica só na aplicação
-- (lib/server/repositories/events-repository.ts), que decide quem pode
-- chamá-la automaticamente (login/cadastro) vs. sob clique do usuário.

alter table public.events drop constraint if exists events_criteria_type_check;
alter table public.events add constraint events_criteria_type_check
  check (criteria_type in ('first_n_signups', 'manual_opt_in'));
