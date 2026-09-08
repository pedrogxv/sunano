-- Fecha a leitura pública de `user_discord_membership`.
--
-- A policy anterior (`using (true)`, em
-- 20261015000000_discord_membership_achievement.sql) expunha a linha INTEIRA
-- via PostgREST, incluindo `discord_user_id` — o id numérico da conta do
-- Discord, resolvível em nome de usuário e avatar pela API pública deles.
-- Verificado em produção antes desta migration:
--
--   GET /rest/v1/user_discord_membership?select=user_id,discord_user_id
--   → 200, com os ids reais de todos os membros confirmados.
--
-- O comentário daquela migration já dizia que `discord_user_id` "não deve
-- vazar para o navegador de estranhos" e que toda leitura passa pelo
-- repositório em service role. A intenção estava certa; a policy é que não a
-- implementava — RLS filtra LINHAS, nunca colunas, então `using (true)` não
-- tinha como esconder a coluna.
--
-- Nada no app depende dessa leitura anônima: o único consumidor é
-- `lib/server/repositories/discord-membership-repository.ts`, que usa service
-- role (ignora RLS) e seleciona apenas `user_id`. Nenhum componente client
-- consulta a tabela. Restringir aqui não muda comportamento nenhum do site.
--
-- Mantém-se uma policy de SELECT para o próprio dono: é o que permite a
-- alguém logado verificar o próprio vínculo sem passar pelo servidor, e
-- espelha o mínimo necessário. Escrita continua sem policy — só via
-- `confirm_discord_membership` (service role), como antes.

drop policy if exists "Discord membership is publicly readable" on public.user_discord_membership;

create policy "Own discord membership readable"
  on public.user_discord_membership for select
  to authenticated
  using (user_id = auth.uid());

comment on column public.user_discord_membership.discord_user_id is
  'Id da conta do Discord. NUNCA deve ser exposto publicamente — RLS restringe a leitura ao próprio dono; a vitrine de conquistas lê via service role selecionando só user_id.';
