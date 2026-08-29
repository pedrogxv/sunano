import fs from "node:fs"
import path from "node:path"

/**
 * Falha o build se algum upload pro Storage esquecer compressão ou cache longo.
 *
 * Por que existe: em agosto/2026 o egresso do Supabase estourou a cota (297GB
 * de 250GB) porque as imagens iam pro bucket no tamanho original e com o
 * `cacheControl` padrão de 1 hora — todo visitante recorrente rebaixava tudo
 * várias vezes ao dia. As rotas foram corrigidas uma a uma, mas nada impede a
 * próxima rota de upload de nascer sem os dois cuidados: é uma linha fácil de
 * esquecer, e o efeito só aparece na fatura semanas depois.
 *
 * A checagem é textual de propósito. O que se quer garantir é que quem
 * escrever `.upload(` num arquivo novo passe `cacheControl`, e um lint de
 * texto pega isso sem precisar de infra de teste — o `tsc` não tem como saber
 * que um literal ausente custa dinheiro.
 */

const ROOTS = ["app", "lib", "components"]

/** Upload de mídia que não é imagem (vídeo) não passa por `sharp`. */
const COMPRESSION_EXEMPT = new Set(["app/api/admin/store-banners/upload-video/route.ts"])

type Finding = { file: string; problem: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function main() {
  const findings: Finding[] = []
  let checked = 0

  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue
    for (const file of walk(root)) {
      const source = fs.readFileSync(file, "utf8")

      // Só interessa `.upload(`/`.update(` encadeado em `storage.from(bucket)`.
      // Casar as duas coisas soltas no arquivo daria falso positivo em
      // repository que faz `db.from("tabela").update({...})` e, noutro ponto,
      // `db.storage.from(bucket).remove(...)` — atualização de linha, não de
      // objeto. O `[\s\S]*?` cobre o encadeamento quebrado em várias linhas
      // pelo formatador.
      const STORAGE_WRITE = /storage\s*[\s\S]{0,40}?\.from\(\s*[^)]*\)\s*[\s\S]{0,80}?\.(upload|update)\(/
      if (!STORAGE_WRITE.test(source)) continue
      checked++

      if (!source.includes("cacheControl")) {
        findings.push({
          file,
          problem: "grava no Storage sem `cacheControl` — cai no padrão de 1h e custa egresso",
        })
      }

      const isImageRoute = /image|avatar|banner|cover|media|photo/i.test(file)
      if (
        isImageRoute &&
        !COMPRESSION_EXEMPT.has(file.split(path.sep).join("/")) &&
        !source.includes("compressUploadedImage")
      ) {
        findings.push({
          file,
          problem: "sobe imagem sem `compressUploadedImage` — o original vai inteiro pro bucket",
        })
      }
    }
  }

  if (findings.length > 0) {
    console.error(`\n✗ ${findings.length} problema(s) de upload:\n`)
    for (const f of findings) console.error(`  ${f.file}\n    ${f.problem}\n`)
    console.error(
      "Todo upload precisa de `cacheControl: IMMUTABLE_CACHE_CONTROL` e, para imagem,\n" +
        "de `compressUploadedImage` com um preset de `IMAGE_PRESETS`.\n" +
        "Ver lib/server/image-compression.ts.\n"
    )
    process.exit(1)
  }

  console.log(`✓ ${checked} ponto(s) de escrita no Storage — compressão e cache longo em todos`)
}

main()
