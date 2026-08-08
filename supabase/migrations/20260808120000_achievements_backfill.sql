-- Backfill de conquistas gerais (posts/comentários/seguidores) para
-- usuários que já tinham atividade antes de 20260808_achievements_streak.sql
-- existir. `check_and_award_track_achievements` só é chamada a partir de
-- ações novas (criar post, comentar, seguir) — quem já tinha contagem alta
-- nunca disparou a concessão retroativa, por isso os cards ficavam presos
-- em "sem nível" mesmo com contagem acima do threshold do bronze.
do $$
declare
  v_row record;
begin
  for v_row in
    select user_id, count(*)::integer as cnt
    from public.forum_posts
    where is_hidden = false and user_id is not null
    group by user_id
  loop
    perform public.check_and_award_track_achievements(v_row.user_id, 'posts', v_row.cnt);
  end loop;

  for v_row in
    select user_id, count(*)::integer as cnt
    from public.forum_comments
    where is_hidden = false and user_id is not null
    group by user_id
  loop
    perform public.check_and_award_track_achievements(v_row.user_id, 'comments', v_row.cnt);
  end loop;

  for v_row in
    select following_id as user_id, count(*)::integer as cnt
    from public.user_follows
    where following_id is not null
    group by following_id
  loop
    perform public.check_and_award_track_achievements(v_row.user_id, 'followers', v_row.cnt);
  end loop;
end $$;
