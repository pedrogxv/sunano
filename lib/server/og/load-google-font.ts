import "server-only"

/**
 * Busca um recorte (`text=`) de uma fonte do Google Fonts como .ttf, pro
 * Satori usar em `ImageResponse` (og image). O endpoint `css2` da Google
 * devolve `.woff2` por padrão — o Satori não lê esse formato — mas responde
 * com `.ttf` quando o User-Agent é de um browser antigo o suficiente para
 * "não suportar" woff2. `text` limita a fonte aos glifos realmente usados na
 * imagem (nome do usuário incluso), então cobre acentuação/PT-BR sem baixar
 * o charset inteiro a cada requisição.
 */
export async function loadGoogleFontTtf(
  family: string,
  weight: number,
  text: string
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({ family: `${family}:wght@${weight}`, text })
  const css = await fetch(`https://fonts.googleapis.com/css2?${params.toString()}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36",
    },
  }).then((res) => res.text())

  const fontUrl = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype|woff)'\)/)?.[1]
  if (!fontUrl) {
    throw new Error(`[load-google-font] fonte "${family}" peso ${weight} não encontrada`)
  }

  const fontRes = await fetch(fontUrl)
  return fontRes.arrayBuffer()
}
