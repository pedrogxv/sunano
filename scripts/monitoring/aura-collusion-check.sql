-- ============================================================================
-- Monitoramento de conluio na Aura (rodar de vez em quando)
--   npx supabase db query --linked -f scripts/monitoring/aura-collusion-check.sql
--
-- Não bloqueia nada — só evidencia PARES de contas que ficam trocando aura
-- entre si de forma recíproca (sinal de multi-conta/conluio pra farmar missão
-- diária + streak → validação de indicação). forum_aura não guarda o autor do
-- alvo: ele é derivado de forum_posts/forum_comments.
-- ============================================================================
with recent as (
  select fa.giver_id,
         coalesce(fp.user_id, fc.user_id) as target_user_id
  from forum_aura fa
  left join forum_posts    fp on fp.id = fa.post_id
  left join forum_comments fc on fc.id = fa.comment_id
  where fa.created_at > now() - interval '14 days'
),
edges as (
  select giver_id, target_user_id
  from recent
  where target_user_id is not null
    and giver_id <> target_user_id
),
pairs as (
  select least(giver_id, target_user_id)    as a,
         greatest(giver_id, target_user_id) as b,
         count(*)                           as trocas,
         count(distinct giver_id)           as direcoes  -- 2 = recíproco
  from edges
  group by 1, 2
)
select p.a, pa.display_name as nome_a,
       p.b, pb.display_name as nome_b,
       p.trocas, p.direcoes
from pairs p
left join user_profiles pa on pa.id = p.a
left join user_profiles pb on pb.id = p.b
where p.direcoes = 2      -- trocam nos DOIS sentidos
  and p.trocas   >= 6     -- ajuste o limiar conforme o volume real
order by p.trocas desc
limit 50;
