<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Migrations do Supabase — padrão obrigatório

O CLI do Supabase usa o **prefixo do nome do arquivo** como *version*. Dois arquivos
`supabase/migrations/` com o mesmo prefixo colidem na mesma versão e quebram
`supabase db push` (o segundo arquivo fica pra sempre marcado como não-aplicado).

Regras ao criar uma migration nova:

1. **Nome:** `YYYYMMDDHHMMSS_descricao.sql`. Se já existir outro arquivo com o
   mesmo prefixo de data no dia, **sempre** sufixe com horário (`HHMMSS` ou um
   contador `000001`, `000002`, …). Nunca deixe dois `YYYYMMDD_*.sql` sem sufixo
   coexistindo — nem em commits diferentes.
2. **Idempotência:** antes de `create policy` / `create trigger`, sempre
   `drop policy if exists` / `drop trigger if exists` (Postgres não tem
   `create or replace` nem `if not exists` pra esses). Use `if not exists` /
   `add column if not exists` no resto.
3. **Nunca rode migration ad-hoc colando SQL no Dashboard.** Foi assim que o
   histórico desalinhou 2×. Se o `db push` estiver bloqueado, conserte o
   bloqueio, não contorne.

## Consertar drift de histórico (migrations aplicadas mas não registradas)

Sintoma: `supabase migration list --linked` mostra linhas com `remote` vazio para
migrations que **já rodaram** no banco (schema já existe lá).

1. Confirme por conteúdo que já foram aplicadas — consulte objetos reais no
   remoto: `npx supabase db query --linked -f check.sql` (procure tabelas,
   colunas, `pg_proc`, constraints que a migration cria).
2. `npx supabase migration repair --status applied <version> [<version> …]` —
   **só escreve em `supabase_migrations.schema_migrations`, não executa SQL.**
3. Para colisão de prefixo: `git mv` o arquivo em conflito para um timestamp
   livre e faça `repair --status applied` do novo prefixo.
4. Valide: `npx supabase db push --dry-run` deve dizer `Remote database is up to date`.
