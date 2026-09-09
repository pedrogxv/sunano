import Image from "next/image"

import { sortTiers, tierGradientStyle, tierTextColor } from "@/lib/personal-tierlist-theme"
import type { TierlistItem, TierlistTierDef } from "@/lib/personal-tierlist"

/** Quantos periféricos cabem numa linha da imagem exportada — mais que isso e a imagem fica larga demais pra compartilhar. */
export const EXPORT_ITEMS_PER_ROW = 6

const EXPORT_WIDTH = 720
/**
 * Medidas do board, nomeadas porque a largura do card é derivada delas
 * (`CARD_WIDTH`). Antes esse cálculo estava embutido no card e não batia com
 * o layout — esquecia a borda e contava a margem lateral uma vez só, dando
 * 96px onde só cabiam 93. Com `flexShrink: 0`, os 18px de sobra empurravam o
 * sexto card pra fora e o `overflow: hidden` do board cortava ele na imagem.
 */
const BOARD_MARGIN_X = 16
const BOARD_BORDER = 1
const TIER_COLUMN_WIDTH = 72
const ITEMS_PADDING = 8
const ITEMS_GAP = 8

/** Largura interna da área de itens, já descontada a coluna do tier. */
const ITEMS_INNER_WIDTH =
  EXPORT_WIDTH -
  BOARD_MARGIN_X * 2 -
  BOARD_BORDER * 2 -
  TIER_COLUMN_WIDTH -
  ITEMS_PADDING * 2

const CARD_WIDTH = Math.floor(
  (ITEMS_INNER_WIDTH - ITEMS_GAP * (EXPORT_ITEMS_PER_ROW - 1)) / EXPORT_ITEMS_PER_ROW
)

/** Quebra um array em blocos de tamanho `size` — garante o limite real por linha (ao contrário de `flex-wrap`, que só quebra quando o container acaba). */
function chunk<T>(list: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size))
  return rows
}

/**
 * Versão estática do board pra virar imagem (`PersonalTierlistExportButton`,
 * via `html-to-image`) — sem hover, tooltip ou link, e cada tier quebra os
 * itens em linhas de `EXPORT_ITEMS_PER_ROW` (a tierlist cresce em altura, não
 * em largura, quando tem muito item). Sem avatar do dono nem marca d'água de
 * propósito: só o board.
 *
 * Renderizada fora da tela (o botão que a monta cuida do `position: fixed`)
 * — largura fixa pra dar um enquadramento consistente pra compartilhar.
 */
export function PersonalTierlistExportView({
  ownerName,
  tiers,
  items,
}: {
  ownerName: string
  tiers: TierlistTierDef[]
  items: TierlistItem[]
}) {
  const orderedTiers = sortTiers(tiers)
  const byTier = new Map<string, TierlistItem[]>()
  for (const tier of orderedTiers) byTier.set(tier.id, [])
  for (const item of items) byTier.get(item.tierId)?.push(item)
  const visibleTiers = orderedTiers.filter((tier) => (byTier.get(tier.id)?.length ?? 0) > 0)

  return (
    <div style={{ width: EXPORT_WIDTH, backgroundColor: "#0B0D12", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "20px 24px 8px" }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#FFFFFF" }}>Tierlist de {ownerName}</p>
      </div>

      <div
        style={{
          margin: `0 ${BOARD_MARGIN_X}px ${BOARD_MARGIN_X}px`,
          borderRadius: 12,
          overflow: "hidden",
          border: `${BOARD_BORDER}px solid #ffffff1a`,
        }}
      >
        {visibleTiers.map((tier) => {
          const rows = chunk(byTier.get(tier.id) ?? [], EXPORT_ITEMS_PER_ROW)
          const textColor = tierTextColor(tier.color)

          return (
            <div key={tier.id} style={{ display: "flex", borderTop: "1px solid #ffffff14" }}>
              <div
                style={{
                  ...tierGradientStyle(tier.color),
                  width: TIER_COLUMN_WIDTH,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "8px 6px",
                }}
              >
                <span
                  style={{
                    color: textColor,
                    fontWeight: 900,
                    fontSize: 16,
                    lineHeight: 1.15,
                    textAlign: "center",
                    wordBreak: "break-word",
                  }}
                >
                  {tier.label}
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 0, backgroundColor: "#161A22", padding: ITEMS_PADDING }}>
                {rows.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    style={{ display: "flex", gap: ITEMS_GAP, marginTop: rowIndex === 0 ? 0 : ITEMS_GAP }}
                  >
                    {row.map((item) => (
                      <ExportCard key={item.peripheralId} item={item} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ExportCard({ item }: { item: TierlistItem }) {
  return (
    <div
      style={{
        width: CARD_WIDTH,
        flexShrink: 0,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#05060A",
        border: "1px solid #ffffff1f",
      }}
    >
      {/* Altura explícita, não `aspect-ratio`: o `html-to-image` rasteriza o
          board dentro de um `<foreignObject>`, e ali um quadrado declarado por
          proporção depende do layout resolver antes da serialização. Com a
          largura já fixa, dizer a altura em pixel é determinístico. */}
      <div style={{ position: "relative", width: "100%", height: CARD_WIDTH, backgroundColor: "#0f1117" }}>
        {item.peripheral.imageUrl ? (
          <Image
            src={item.peripheral.imageUrl}
            alt={item.peripheral.name}
            fill
            priority
            sizes={`${CARD_WIDTH}px`}
            style={{ objectFit: "contain", padding: 4 }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              height: "100%",
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 900,
              color: "#ffffff99",
            }}
          >
            {(item.peripheral.brandName ?? item.peripheral.name).slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <p
        style={{
          margin: 0,
          padding: "3px 4px",
          fontSize: 9,
          fontWeight: 600,
          lineHeight: 1.2,
          color: "#FFFFFF",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {item.peripheral.name}
      </p>
    </div>
  )
}
