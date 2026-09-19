#!/usr/bin/env bash
# Recopia o banco de PRODUCAO para o Supabase LOCAL.
#
# Uso:  ./scripts/refresh-local-db.sh
#
# O que faz: dump do remoto (roles, schema, dados, historico de migrations),
# reset do banco local e restauracao. Os dumps ficam em ~/.supabase-dumps,
# FORA do repo -- contem dados pessoais reais (LGPD). Nao commite nada de la.
#
# Nao toca em producao: todos os comandos remotos sao somente-leitura (pg_dump).
set -euo pipefail

DUMPS="$HOME/.supabase-dumps"
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

mkdir -p "$DUMPS"; chmod 700 "$DUMPS"
cd "$(dirname "$0")/.."

echo "==> 1/5 Dump do remoto (somente leitura)"
npx supabase db dump --linked --role-only                       -f "$DUMPS/roles.sql"
npx supabase db dump --linked --schema public,storage,auth      -f "$DUMPS/schema.sql"
npx supabase db dump --linked --data-only --schema public,storage,auth -f "$DUMPS/data.sql"
npx supabase db dump --linked --schema supabase_migrations      -f "$DUMPS/migration_history.sql"
npx supabase db dump --linked --data-only --schema supabase_migrations -f "$DUMPS/migration_history_data.sql"

echo "==> 2/5 Reset do banco local (apaga o local, nunca o remoto)"
# As migrations do repo nao rodam do zero (a mais antiga assume schema pre-existente),
# entao resetamos sem aplica-las e restauramos o schema real do dump.
MIGDIR="supabase/migrations"
TMPDIR_MIG="$(mktemp -d)"
mv "$MIGDIR" "$TMPDIR_MIG/migrations"
mkdir -p "$MIGDIR"
restore_migrations() { rm -rf "$MIGDIR"; mv "$TMPDIR_MIG/migrations" "$MIGDIR"; }
trap restore_migrations EXIT

npx supabase db reset --local --no-seed
restore_migrations
trap - EXIT

echo "==> 3/5 Restaurando schema + dados"
psql "$DB" -q -f "$DUMPS/schema.sql"
psql "$DB" -q -f "$DUMPS/data.sql"
psql "$DB" -q -f "$DUMPS/migration_history.sql"
psql "$DB" -q -f "$DUMPS/migration_history_data.sql"

echo "==> 4/5 Alinhando grants com producao"
# O Supabase local concede a anon/authenticated privilegios que a nuvem nao da.
psql "$DB" -q <<'SQL'
do $$
declare r record;
begin
  for r in
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated')
      and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')
  loop
    execute format('revoke %s on public.%I from %I', r.privilege_type, r.table_name, r.grantee);
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
revoke execute on function public.get_giver_trust_tier(uuid) from public, anon, authenticated;
SQL

echo "==> 5/5 Invariantes de seguranca (tem que voltar VAZIO)"
psql "$DB" -f supabase/tests/security_invariants.sql

echo
echo "Pronto. Studio: http://127.0.0.1:54323"
echo "Migrations pendentes no local:"
npx supabase migration up --local --dry-run 2>/dev/null || true
