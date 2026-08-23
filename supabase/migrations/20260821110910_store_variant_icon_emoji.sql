-- Troca o ícone da variante de nome lucide (lista fechada, ex: "flame") pra
-- emoji real digitável — o seletor no admin virou um EmojiPicker (Command +
-- dataset unicode-emoji-json) em vez dos 15 botões de ícone fixos.
update public.store_product_variants
set icon = case icon
  when 'circle'    then '⚪'
  when 'square'    then '⬜'
  when 'triangle'  then '🔺'
  when 'star'      then '⭐'
  when 'heart'     then '❤️'
  when 'diamond'   then '💎'
  when 'hexagon'   then '🔶'
  when 'sparkles'  then '✨'
  when 'sun'       then '☀️'
  when 'moon'      then '🌙'
  when 'flame'     then '🔥'
  when 'snowflake' then '❄️'
  when 'zap'       then '⚡'
  when 'droplet'   then '💧'
  when 'leaf'      then '🍃'
  else icon
end
where icon in (
  'circle', 'square', 'triangle', 'star', 'heart', 'diamond', 'hexagon',
  'sparkles', 'sun', 'moon', 'flame', 'snowflake', 'zap', 'droplet', 'leaf'
);
