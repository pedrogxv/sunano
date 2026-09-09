-- Programa de Indicação de Amigos ("Cupom de Indicação").
--
-- Diferente do Programa de Afiliados (`affiliates`, 20260921000001 e
-- 20261016000000), que paga COMISSÃO EM DINHEIRO sobre venda confirmada e
-- exige aprovação manual: aqui a moeda é Aura, todo mundo participa sem
-- solicitar nada, e o gatilho é o CADASTRO de alguém novo — não uma compra.
-- Os dois programas convivem no mesmo link (`?ref=` é do afiliado,
-- `?convite=` é daqui) e nunca disputam o mesmo cookie.
--
-- Recompensa em dois níveis, e só dois:
--   nível 1 (+50) — quem indicou diretamente
--   nível 2 (+20) — quem indicou o indicador ("avô")
-- A cadeia NÃO é recursiva de propósito: sem isso o programa vira pirâmide,
-- onde uma conta no topo lucra com indicações que ela não fez.
--
-- Ambas são recompensa de VALOR FIXO: creditam direto na carteira, sem passar
-- por `apply_aura_gain`. Essa é a regra que 20260930000000_aura_fixed_rewards.sql
-- estabeleceu (multiplicador só vale para ganho por atividade) e que
-- `lib/aura-faq.ts` promete ao usuário. Uma indicação anunciada como 50 tem
-- que pagar 50 — foi exatamente o descasamento inverso (conquista de 25
-- pagando 26) que motivou aquela migration.
--
-- ────────────────────────────────────────────
-- O VERIFICADOR (por que não basta "cadastrar")
-- ────────────────────────────────────────────
-- Cadastro puro é gratuito de repetir, então pagar por cadastro é pagar por
-- e-mail descartável. A indicação só credita quando o indicado prova ser uma
-- pessoa distinta, por um destes três caminhos:
--
--   'discord_member'  — confirmou ser membro do servidor oficial
--                       (`user_discord_membership`, que já tem
--                       `unique (discord_user_id)`)
--   'oauth_identity'  — vinculou Google/Discord à conta, com o par
--                       (provider, provider_id) ÚNICO EM TODO O SITE
--   'streak_3d'       — ofensiva de 3 dias (3 dias de missões completas)
--
-- O `unique` global de `referral_verified_identities` é o ponto central deste
-- arquivo. Sem ele, "vincular uma conta Google" não é gate nenhum: o
-- `linkIdentity` do Supabase aceita uma conta Google diferente por usuário, e
-- criar 20 contas Google é questão de minutos — 20 fakes = 1000 de Aura. Com
-- ele, cada conta Google/Discord do mundo valida no máximo UMA indicação em
-- todo o site, para sempre, e o custo do ataque passa a ser uma conta real
-- por fake. É o mesmo raciocínio do `unique (discord_user_id)` em
-- `user_discord_membership` (20261015000000).

-- ────────────────────────────────────────────
-- 1. Código de indicação (um por usuário, gerado sob demanda)
-- ────────────────────────────────────────────
-- Ao contrário de `affiliates.code`, que a pessoa escolhe e um admin aprova,
-- aqui o código nasce sozinho na primeira visita ao painel. Personalizar é
-- opcional e vale UMA VEZ (`customized_at`): links já compartilhados por aí
-- não podem quebrar a cada troca de ideia, e um código liberado repetidamente
-- permitiria "passar" um código bonito adiante.
create table if not exists public.referral_codes (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  code           text not null unique,
  customized_at  timestamptz,
  created_at     timestamptz not null default now(),
  constraint referral_codes_code_format check (code ~ '^[A-Z0-9]{4,20}$')
);

alter table public.referral_codes enable row level security;

-- Sem policy de select público: o código é resolvido no cadastro (quem digita
-- o cupom ainda não tem sessão) pelo repositório, que roda com service role.
-- Expor a tabela ao anon permitiria enumerar todos os códigos do site e
-- descobrir quem indicou quem.
drop policy if exists "Users read their own referral code" on public.referral_codes;
create policy "Users read their own referral code"
  on public.referral_codes for select using (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- 2. A indicação em si
-- ────────────────────────────────────────────
-- `referred_user_id` é a PK, não um id próprio: cada pessoa é indicada no
-- máximo UMA vez, para sempre. Isso mata na raiz a disputa de atribuição
-- ("dois indicadores reivindicam o mesmo cadastro") sem precisar de regra de
-- desempate, e torna `register_referral` naturalmente idempotente.
create table if not exists public.referrals (
  referred_user_id  uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id  uuid not null references auth.users(id) on delete cascade,
  status            text not null default 'pending'
                      check (status in ('pending', 'validated', 'rejected', 'expired')),
  -- Qual dos três gates validou. Null enquanto pendente.
  validated_via     text check (validated_via in ('discord_member', 'oauth_identity', 'streak_3d')),
  -- IP do cadastro + o /24 derivado, para o teto por faixa. Guardar o prefixo
  -- numa coluna própria (em vez de calcular no filtro) permite indexar.
  signup_ip         inet,
  signup_ip_prefix  text,
  -- Prazo para cumprir o gate. Sem isso a fila de pendentes cresce para
  -- sempre e o painel do indicador vira uma lista de fantasmas.
  expires_at        timestamptz not null,
  validated_at      timestamptz,
  rejected_reason   text,
  created_at        timestamptz not null default now(),
  -- Auto-indicação barrada no schema, não só no código: é a fraude mais
  -- óbvia e a que mais barato sai de tentar.
  constraint referrals_no_self check (referrer_user_id <> referred_user_id)
);

create index if not exists idx_referrals_referrer on public.referrals(referrer_user_id, status);
create index if not exists idx_referrals_pending_expiry on public.referrals(status, expires_at)
  where status = 'pending';
create index if not exists idx_referrals_ip_prefix on public.referrals(referrer_user_id, signup_ip_prefix)
  where status = 'validated';

alter table public.referrals enable row level security;

-- Só as duas pontas enxergam a indicação. Nada de `using (true)`: a tabela
-- liga duas contas entre si e carrega `signup_ip` — dado pessoal (LGPD) que
-- não pode vazar para o navegador de estranhos.
drop policy if exists "Referral parties read their own referrals" on public.referrals;
create policy "Referral parties read their own referrals"
  on public.referrals for select
  using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

-- ────────────────────────────────────────────
-- 3. Identidades já usadas para validar (o gate forte)
-- ────────────────────────────────────────────
-- `unique (provider, provider_id)` é GLOBAL, não por usuário — ver a nota no
-- cabeçalho. `provider_id` é o id da conta no Google/Discord.
create table if not exists public.referral_verified_identities (
  provider      text not null check (provider in ('google', 'discord')),
  provider_id   text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  verified_at   timestamptz not null default now(),
  primary key (provider, provider_id)
);

create index if not exists idx_referral_identities_user on public.referral_verified_identities(user_id);

alter table public.referral_verified_identities enable row level security;

-- Leitura só do dono. `provider_id` é identificador de conta de terceiro:
-- sob `using (true)` qualquer visitante conseguiria cruzar usuário do site
-- com conta do Google/Discord — exatamente o vazamento que a
-- 20261017000000_discord_membership_private_read.sql veio corrigir.
drop policy if exists "Users read their own verified identities" on public.referral_verified_identities;
create policy "Users read their own verified identities"
  on public.referral_verified_identities for select using (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- 4. Novos motivos no extrato de aura
-- ────────────────────────────────────────────
-- Mesmo padrão de toda migration que adiciona motivo: redefine o CHECK
-- inteiro com a lista completa vigente (copiada de
-- 20261015000000_discord_membership_achievement.sql) + os dois novos.
alter table public.aura_ledger
  drop constraint if exists aura_ledger_reason_check;
alter table public.aura_ledger
  add constraint aura_ledger_reason_check check (reason in (
    'post_aura_received', 'post_aura_removed',
    'comment_aura_received', 'comment_aura_removed',
    'event_medal_redeemed',
    'blog_post_aura_received', 'blog_post_aura_removed',
    'blog_comment_aura_received', 'blog_comment_aura_removed',
    'post_aura_disliked', 'post_aura_undisliked',
    'comment_aura_disliked', 'comment_aura_undisliked',
    'blog_post_aura_disliked', 'blog_post_aura_undisliked',
    'blog_comment_aura_disliked', 'blog_comment_aura_undisliked',
    'post_created', 'comment_created', 'blog_comment_created',
    'daily_mission_completed', 'daily_streak_bonus', 'achievement_unlocked',
    'peripheral_comment_aura_received', 'peripheral_comment_aura_removed',
    'peripheral_comment_aura_disliked', 'peripheral_comment_aura_undisliked',
    'peripheral_comment_created',
    'peripheral_review_created',
    'aura_item_redeemed',
    'youtube_subscription_confirmed',
    'vip_purchased',
    'display_name_changed',
    'account_banned_adjustment',
    'streak_shield_purchased',
    'discord_membership_confirmed',
    'referral_signup',
    'referral_indirect'
  ));

-- ────────────────────────────────────────────
-- 5. Parâmetros do programa (funções, não constantes espalhadas)
-- ────────────────────────────────────────────
-- Mesmo idioma de `affiliate_min_payout_cents` (20261016000000): o número
-- mora no banco, ao lado de quem o aplica, e o TypeScript espelha só para
-- exibir. Assim mudar o valor não exige achar todos os literais.
create or replace function public.referral_reward_direct()   returns integer language sql immutable as $$ select 50 $$;
create or replace function public.referral_reward_indirect() returns integer language sql immutable as $$ select 20 $$;
-- Janela para cumprir o verificador.
create or replace function public.referral_validation_days() returns integer language sql immutable as $$ select 30 $$;
-- Teto de indicações validadas por usuário. Não é desconfiança do usuário
-- comum (ninguém honesto chega perto): é o limite superior do prejuízo se
-- todas as outras camadas falharem ao mesmo tempo.
create or replace function public.referral_max_per_user()    returns integer language sql immutable as $$ select 50 $$;
-- Teto por faixa /24 do IP de cadastro. Acima disso a indicação NÃO é negada
-- em silêncio — vai para revisão no admin. Casas com várias pessoas, CGNAT,
-- faculdade e rede corporativa são casos legítimos e comuns.
create or replace function public.referral_max_per_ip_prefix() returns integer language sql immutable as $$ select 3 $$;

-- ────────────────────────────────────────────
-- 6. ensure_referral_code — cria o código na primeira visita ao painel
-- ────────────────────────────────────────────
-- Geração preguiçosa (na leitura) em vez de trigger no cadastro: um trigger
-- em `auth.users` faria toda criação de conta depender desta tabela, e um
-- erro aqui quebraria o cadastro inteiro. O painel é o único lugar que
-- precisa do código existir.
--
-- `p_seed` é o nome de exibição; vira a parte legível do código, com sufixo
-- aleatório para não colidir. Se o nome não render nada aproveitável
-- (acentos, emoji, alfabeto não-latino), cai num código totalmente aleatório.
create or replace function public.ensure_referral_code(
  p_user_id uuid,
  p_seed    text default null
)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_code     text;
  v_base     text;
  v_attempt  integer := 0;
begin
  select code into v_code from public.referral_codes where user_id = p_user_id;
  if v_code is not null then
    return v_code;
  end if;

  -- Só ASCII alfanumérico: o código viaja na querystring (`?convite=`) e é
  -- digitado à mão no cadastro.
  v_base := upper(regexp_replace(coalesce(p_seed, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_base := substring(v_base from 1 for 10);
  if length(v_base) < 3 then
    v_base := 'SUNANO';
  end if;

  -- Tenta algumas vezes; o `unique` é quem decide de verdade.
  loop
    v_attempt := v_attempt + 1;
    v_code := v_base || upper(substring(md5(gen_random_uuid()::text) from 1 for 4));

    begin
      insert into public.referral_codes (user_id, code) values (p_user_id, v_code);
      return v_code;
    exception
      when unique_violation then
        -- Corrida: outra chamada criou o código deste usuário primeiro.
        select code into v_code from public.referral_codes where user_id = p_user_id;
        if v_code is not null then
          return v_code;
        end if;
        -- Senão foi colisão do código sorteado — tenta de novo.
        if v_attempt >= 10 then
          raise exception 'referral_code_generation_failed';
        end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.ensure_referral_code(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_referral_code(uuid, text) to service_role;

-- ────────────────────────────────────────────
-- 7. set_referral_code — personalização, uma vez só
-- ────────────────────────────────────────────
-- Códigos: taken | already_customized | not_found | ok
create or replace function public.set_referral_code(
  p_user_id uuid,
  p_code    text
)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_row public.referral_codes%rowtype;
begin
  select * into v_row from public.referral_codes where user_id = p_user_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_row.customized_at is not null then
    return 'already_customized';
  end if;

  begin
    update public.referral_codes
      set code = upper(p_code), customized_at = now()
      where user_id = p_user_id;
  exception
    when unique_violation then
      return 'taken';
  end;

  return 'ok';
end;
$$;

revoke execute on function public.set_referral_code(uuid, text) from public, anon, authenticated;
grant execute on function public.set_referral_code(uuid, text) to service_role;

-- ────────────────────────────────────────────
-- 8. register_referral — grava a indicação no cadastro (status 'pending')
-- ────────────────────────────────────────────
-- Chamada logo depois de criar o perfil, nos DOIS caminhos de cadastro
-- (e-mail em app/register/actions.ts, social em app/auth/callback/route.ts).
-- Nunca credita Aura: só registra quem indicou quem. O crédito é de
-- `validate_referral`, quando o gate for cumprido.
--
-- Códigos: ok | invalid_code | self_referral | already_referred |
--          referrer_banned | duplicate_identity
create or replace function public.register_referral(
  p_referred_user_id uuid,
  p_code             text,
  p_signup_ip        text default null
)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_referrer        uuid;
  v_ip              inet;
  v_prefix          text;
  v_referred_cpf    text;
  v_referrer_cpf    text;
  v_banned          boolean;
begin
  select user_id into v_referrer
    from public.referral_codes
    where code = upper(trim(coalesce(p_code, '')));

  if v_referrer is null then
    return 'invalid_code';
  end if;

  if v_referrer = p_referred_user_id then
    return 'self_referral';
  end if;

  -- Indicador banido não acumula indicação nova. A marca de banimento é
  -- `account_banned_at` (ver `getAccountBanStatus` em
  -- account-ban-repository.ts), não uma flag booleana.
  select (account_banned_at is not null) into v_banned
    from public.user_profiles where id = v_referrer;

  if coalesce(v_banned, false) then
    return 'referrer_banned';
  end if;

  -- Auto-indicação por CPF: a mesma pessoa criando a segunda conta. Só vale
  -- quando os dois lados preencheram o campo (é opcional no cadastro).
  select cpf into v_referred_cpf from public.user_profiles where id = p_referred_user_id;
  select cpf into v_referrer_cpf from public.user_profiles where id = v_referrer;
  if v_referred_cpf is not null and v_referred_cpf <> ''
     and v_referred_cpf = v_referrer_cpf then
    return 'self_referral';
  end if;

  begin
    v_ip := p_signup_ip::inet;
    -- /24 para IPv4, /64 para IPv6 (a faixa que costuma pertencer a um mesmo
    -- assinante; /24 em IPv6 seria grande demais e agruparia estranhos).
    v_prefix := host(network(set_masklen(v_ip, case when family(v_ip) = 4 then 24 else 64 end)));
  exception when others then
    v_ip := null;
    v_prefix := null;
  end;

  insert into public.referrals (
    referred_user_id, referrer_user_id, signup_ip, signup_ip_prefix, expires_at
  ) values (
    p_referred_user_id, v_referrer, v_ip, v_prefix,
    now() + (public.referral_validation_days() || ' days')::interval
  )
  on conflict (referred_user_id) do nothing;

  if not found then
    return 'already_referred';
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.register_referral(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_referral(uuid, text, text) to service_role;

-- ────────────────────────────────────────────
-- 9. claim_referral_identity — reserva (provider, provider_id) globalmente
-- ────────────────────────────────────────────
-- Chamada quando o usuário vincula Google/Discord. Retorna se ESTA conta
-- ainda estava livre. Uma conta já usada por outro usuário devolve
-- 'in_use' — e não valida indicação nenhuma.
--
-- Códigos: claimed | already_mine | in_use
create or replace function public.claim_referral_identity(
  p_user_id     uuid,
  p_provider    text,
  p_provider_id text
)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_owner uuid;
begin
  insert into public.referral_verified_identities (provider, provider_id, user_id)
    values (p_provider, p_provider_id, p_user_id)
    on conflict do nothing;

  if found then
    return 'claimed';
  end if;

  select user_id into v_owner
    from public.referral_verified_identities
    where provider = p_provider and provider_id = p_provider_id;

  if v_owner = p_user_id then
    return 'already_mine';
  end if;

  return 'in_use';
end;
$$;

revoke execute on function public.claim_referral_identity(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_referral_identity(uuid, text, text) to service_role;

-- ────────────────────────────────────────────
-- 10. validate_referral — o coração: valida e credita os dois níveis
-- ────────────────────────────────────────────
-- Tudo numa transação, com `for update` na linha da indicação: é Aura
-- (dinheiro) sendo criada, e a função é chamada de vários gatilhos
-- concorrentes (login OAuth, callback do Discord, missão diária). Sem o lock,
-- dois gatilhos simultâneos creditariam 50 duas vezes.
--
-- Idempotente por construção: só age sobre 'pending', e a primeira coisa que
-- faz é sair do estado 'pending'.
--
-- Códigos: validated | not_pending | expired | capped_ip | capped_total | no_referral
create or replace function public.validate_referral(
  p_referred_user_id uuid,
  p_via              text
)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_ref              public.referrals%rowtype;
  v_grandparent      uuid;
  v_ip_count         integer;
  v_total_count      integer;
  v_direct           integer := public.referral_reward_direct();
  v_indirect         integer := public.referral_reward_indirect();
begin
  select * into v_ref from public.referrals
    where referred_user_id = p_referred_user_id
    for update;

  if not found then
    return 'no_referral';
  end if;

  if v_ref.status <> 'pending' then
    return 'not_pending';
  end if;

  -- Passou da janela: marca e sai. Quem cumprir o gate depois não credita —
  -- senão a janela não significaria nada.
  if v_ref.expires_at < now() then
    update public.referrals set status = 'expired' where referred_user_id = p_referred_user_id;
    return 'expired';
  end if;

  -- Teto global do indicador.
  select count(*) into v_total_count from public.referrals
    where referrer_user_id = v_ref.referrer_user_id and status = 'validated';
  if v_total_count >= public.referral_max_per_user() then
    update public.referrals
      set status = 'rejected', rejected_reason = 'max_per_user'
      where referred_user_id = p_referred_user_id;
    return 'capped_total';
  end if;

  -- Teto por faixa de IP. Vira 'rejected' com motivo explícito para o admin
  -- poder reverter à mão (`reject_referral` tem o par que reabre) — a lista
  -- em /admin/indicacoes filtra justamente por este motivo.
  if v_ref.signup_ip_prefix is not null then
    select count(*) into v_ip_count from public.referrals
      where referrer_user_id = v_ref.referrer_user_id
        and signup_ip_prefix = v_ref.signup_ip_prefix
        and status = 'validated';
    if v_ip_count >= public.referral_max_per_ip_prefix() then
      update public.referrals
        set status = 'rejected', rejected_reason = 'ip_limit'
        where referred_user_id = p_referred_user_id;
      return 'capped_ip';
    end if;
  end if;

  update public.referrals
    set status = 'validated', validated_via = p_via, validated_at = now()
    where referred_user_id = p_referred_user_id;

  -- Nível 1: +50 ao indicador. Crédito direto, sem `apply_aura_gain`.
  insert into public.user_aura_wallet (user_id, balance)
    values (v_ref.referrer_user_id, v_direct)
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + v_direct, updated_at = now();

  insert into public.aura_ledger (user_id, delta, reason)
    values (v_ref.referrer_user_id, v_direct, 'referral_signup');

  -- Nível 2: o "avô". Resolvido AGORA, não no cadastro — se a indicação do
  -- próprio indicador foi rejeitada/expirada nesse meio-tempo, ou se ele foi
  -- banido, o bônus indireto não sai. Só uma indicação VALIDADA gera avô:
  -- do contrário bastaria criar uma corrente de contas pendentes para o topo
  -- lucrar sem ninguém nunca ter passado por um verificador.
  select r.referrer_user_id into v_grandparent
    from public.referrals r
    where r.referred_user_id = v_ref.referrer_user_id
      and r.status = 'validated';

  if v_grandparent is not null and v_grandparent <> p_referred_user_id then
    insert into public.user_aura_wallet (user_id, balance)
      values (v_grandparent, v_indirect)
      on conflict (user_id) do update
        set balance = user_aura_wallet.balance + v_indirect, updated_at = now();

    insert into public.aura_ledger (user_id, delta, reason)
      values (v_grandparent, v_indirect, 'referral_indirect');
  end if;

  return 'validated';
end;
$$;

revoke execute on function public.validate_referral(uuid, text) from public, anon, authenticated;
grant execute on function public.validate_referral(uuid, text) to service_role;

-- ────────────────────────────────────────────
-- 11. review_referral — decisão manual do admin
-- ────────────────────────────────────────────
-- `p_approve` true reabre uma indicação rejeitada por teto (o caso legítimo:
-- família na mesma casa) e credita normalmente, reusando `validate_referral`
-- com os tetos já resolvidos. False rejeita de vez.
create or replace function public.review_referral(
  p_referred_user_id uuid,
  p_approve          boolean,
  p_reason           text default null
)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_ref public.referrals%rowtype;
begin
  select * into v_ref from public.referrals
    where referred_user_id = p_referred_user_id for update;
  if not found then
    return 'no_referral';
  end if;

  if not p_approve then
    update public.referrals
      set status = 'rejected', rejected_reason = coalesce(p_reason, 'admin_rejected')
      where referred_user_id = p_referred_user_id;
    return 'rejected';
  end if;

  if v_ref.status = 'validated' then
    return 'not_pending';
  end if;

  -- Reabre e credita à mão: os tetos já foram julgados pelo admin, então
  -- este caminho não passa por eles de novo (senão cairia no mesmo 'rejected').
  update public.referrals
    set status = 'validated',
        validated_via = coalesce(v_ref.validated_via, 'oauth_identity'),
        validated_at = now(),
        rejected_reason = null
    where referred_user_id = p_referred_user_id;

  insert into public.user_aura_wallet (user_id, balance)
    values (v_ref.referrer_user_id, public.referral_reward_direct())
    on conflict (user_id) do update
      set balance = user_aura_wallet.balance + public.referral_reward_direct(), updated_at = now();

  insert into public.aura_ledger (user_id, delta, reason)
    values (v_ref.referrer_user_id, public.referral_reward_direct(), 'referral_signup');

  return 'validated';
end;
$$;

revoke execute on function public.review_referral(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_referral(uuid, boolean, text) to service_role;
