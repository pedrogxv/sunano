import type { CSSProperties } from "react"

/**
 * Bolinha de cor da variante: cores muito escuras somem no tema escuro e cores
 * muito claras somem no tema claro. Em vez de uma borda fixa (`border-black/10`),
 * calcula a luminância da cor e devolve uma borda/sombra que sempre contrasta com
 * o fundo atual — mais um xadrez discreto quando não há cor definida.
 */

/** Converte `#rgb`, `#rrggbb` ou `rgb()/rgba()` em [r, g, b] 0-255. `null` se não der pra ler. */
function parseColor(input: string): [number, number, number] | null {
  const value = input.trim().toLowerCase()

  const hex = value.replace(/^#/, "")
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ]
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  }

  return null
}

/** Luminância relativa (WCAG), 0 = preto, 1 = branco. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export type ColorSwatchStyle = {
  /** Estilo inline pronto pro `<span>` da bolinha. */
  style: CSSProperties
  /** true quando não há cor legível (mostra xadrez de "sem cor"). */
  isUnknown: boolean
}

/**
 * Estilo da bolinha para uma cor de variante.
 *
 * - Cor escura (luminância baixa): anel claro + halo branco fraco, pra não sumir no dark.
 * - Cor clara (luminância alta): anel escuro, pra não sumir no light.
 * - Cor intermediária: anel neutro semitransparente que funciona nos dois temas.
 * - Sem cor: xadrez cinza.
 */
export function getColorSwatchStyle(color: string | null | undefined): ColorSwatchStyle {
  const rgb = color ? parseColor(color) : null

  if (!color || !rgb) {
    return {
      isUnknown: true,
      style: {
        backgroundColor: "transparent",
        backgroundImage:
          "linear-gradient(45deg, rgba(128,128,128,0.45) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.45) 75%), linear-gradient(45deg, rgba(128,128,128,0.45) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.45) 75%)",
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 4px 4px",
        boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.55)",
      },
    }
  }

  const luminance = relativeLuminance(rgb)

  // O anel é sempre `inset` (não aumenta o tamanho da bolinha) e o halo externo
  // só aparece nos extremos, onde a cor pode encostar no fundo do tema.
  let boxShadow: string
  if (luminance < 0.12) {
    // Quase preto: precisa de contorno claro no dark e continua ok no light.
    boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.42), 0 0 0 1px rgba(255,255,255,0.14)"
  } else if (luminance > 0.82) {
    // Quase branco: precisa de contorno escuro no light e continua ok no dark.
    boxShadow = "inset 0 0 0 1px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.12)"
  } else {
    boxShadow = "inset 0 0 0 1px rgba(128,128,128,0.45)"
  }

  return { isUnknown: false, style: { backgroundColor: color, boxShadow } }
}
