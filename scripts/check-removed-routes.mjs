// Rotas que o dono do site mandou remover e que já voltaram por merge. O build
// falha se alguma reaparecer, em vez de ela chegar ao site sem ninguém ver.
import { existsSync } from "node:fs"

const REMOVED = [
  {
    path: "app/admin/login",
    why: "O login é um só para membro e cargo: /login. O proxy só redireciona /admin/login para lá.",
  },
]

const found = REMOVED.filter(({ path }) => existsSync(path))

if (found.length > 0) {
  for (const { path, why } of found) {
    console.error(`\n✖ ${path} não pode existir. ${why}`)
  }
  console.error("")
  process.exit(1)
}
