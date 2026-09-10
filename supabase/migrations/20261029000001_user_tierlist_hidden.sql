-- Tierlist pessoal: o dono pode ocultar a própria tierlist — SEM exigir VIP.
--
-- Motivo: montar/editar a tierlist é feature VIP, mas quem deixou o VIP
-- expirar fica com a tierlist congelada E pública, sem nenhuma forma de
-- tirá-la do ar (o editor e a RLS de `note`/itens barram tudo que não seja
-- VIP ativo). `is_hidden` é a válvula de escape: qualquer dono logado pode
-- ligar/desligar, com ou sem VIP.
--
-- Ocultar tira a tierlist de:
--   * `/tierlist/comunidade`  (a view `user_tierlist_public_summary` filtra —
--     ver migration 20261029000002)
--   * `/perfil/[handle]/tierlist` para visitantes (a página dá notFound)
--   * o link "Ver tierlist" no perfil
-- O dono continua vendo (e, se VIP, editando) o próprio board em
-- `/tierlist/pessoal`.

alter table public.user_tierlist_meta
  add column if not exists is_hidden boolean not null default false;

-- A escrita de `is_hidden` passa pela rota `/api/perfil/tierlist/visibilidade`
-- (admin client, só checa dono — nada de VIP). A policy de update abaixo é a
-- defesa de última linha para o caso de alguém escrever direto com a chave
-- anon: o dono pode dar update na própria linha. `note` continua protegido
-- pela policy VIP já existente ("VIP users can manage their own tierlist
-- meta") — as duas policies de update coexistem e o Postgres aceita o UPDATE
-- se qualquer uma passar, então a rota de `note` é quem de fato impede o
-- não-VIP de editar o recado (mesmo modelo de defesa-em-profundidade dos
-- itens).
drop policy if exists "Owners can toggle their tierlist visibility" on public.user_tierlist_meta;
create policy "Owners can toggle their tierlist visibility"
  on public.user_tierlist_meta for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on column public.user_tierlist_meta.is_hidden is
  'Dono ocultou a própria tierlist. Não exige VIP — via /api/perfil/tierlist/visibilidade. Some de /tierlist/comunidade, da view pública e do link no perfil.';
