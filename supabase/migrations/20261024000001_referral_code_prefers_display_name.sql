-- `ensure_referral_code`: usa o nome de exibição PURO como cupom, e só cai no
-- sufixo aleatório quando ele de fato não serve.
--
-- Contexto: `user_profiles.display_name` já é único no site (o cadastro recusa
-- nome repetido). O programa tem poucos usuários. `SUNANO` + 4 hex sempre
-- coladso no fim (`FULANO3F9A`) deixava o cupom com cara de aleatório sem
-- necessidade — se o nome basta e já é único, o cupom é o nome.
--
-- Regras do código não mudam: `^[A-Z0-9]{4,20}$` (o CHECK de `referral_codes`),
-- ASCII porque viaja em `?convite=` e é ditado de boca. Então:
--
--   1. normaliza o nome (tira acento/espaço/emoji, caixa alta, corta em 20)
--   2. se sobrar >= 4 chars e o código não estiver tomado nem for reservado,
--      é esse — sem sufixo
--   3. senão, `<base ou SUNANO> + 4 hex`, tentando de novo em colisão
--
-- Personalização (`set_referral_code`) e todo o resto do arquivo
-- 20261023000000_referral_program.sql continuam iguais.

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

  -- Só ASCII alfanumérico, caixa alta, no máximo 20 (o teto do CHECK).
  v_base := upper(regexp_replace(coalesce(p_seed, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_base := substring(v_base from 1 for 20);

  -- Tentativa 1: o nome cru, sem sufixo. Só se ele sozinho já satisfaz o
  -- formato (>= 4 chars) e não é um código reservado a nível de aplicação
  -- (RESERVED_CODES em lib/referral-code.ts — a lista curta mais provável de
  -- bater com um nome real).
  if length(v_base) >= 4
     and v_base not in (
       'ADMIN','ADMINISTRADOR','MODERADOR','MOD','SUPORTE','SUPPORT','SUNANO',
       'STAFF','OFICIAL','OFFICIAL','ROOT','SISTEMA','SYSTEM','CONVITE','INDICACAO'
     )
  then
    begin
      insert into public.referral_codes (user_id, code) values (p_user_id, v_base);
      return v_base;
    exception
      when unique_violation then
        -- Já existe (do próprio usuário numa corrida, ou de outro com o mesmo
        -- nome normalizado — nomes diferentes podem colapsar no mesmo ASCII).
        select code into v_code from public.referral_codes where user_id = p_user_id;
        if v_code is not null then
          return v_code;
        end if;
        -- Cai para o caminho com sufixo.
    end;
  end if;

  -- Base curta demais / reservada / colidiu: volta ao esquema com sufixo.
  if length(v_base) < 3 then
    v_base := 'SUNANO';
  else
    v_base := substring(v_base from 1 for 10);
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := v_base || upper(substring(md5(gen_random_uuid()::text) from 1 for 4));

    begin
      insert into public.referral_codes (user_id, code) values (p_user_id, v_code);
      return v_code;
    exception
      when unique_violation then
        select code into v_code from public.referral_codes where user_id = p_user_id;
        if v_code is not null then
          return v_code;
        end if;
        if v_attempt >= 10 then
          raise exception 'referral_code_generation_failed';
        end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.ensure_referral_code(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_referral_code(uuid, text) to service_role;
