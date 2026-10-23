import type { CSSProperties } from "react"

/**
 * Fagulhas do banner de fogueira (`.aura-ember` no globals.css). Compartilhadas
 * entre a Central de Aura e o guia em /informacoes/central-de-aura, para os dois
 * títulos queimarem igual.
 */
export type EmberStyle = CSSProperties & {
  "--ember-size"?: string
  "--ember-color"?: string
  "--ember-duration"?: string
  "--ember-delay"?: string
  "--ember-drift"?: string
}

export const AURA_EMBERS: Array<{ left: string; style: EmberStyle }> = [
  { left: "8%", style: { "--ember-size": "3px", "--ember-color": "#ff8f00", "--ember-duration": "2.8s", "--ember-delay": "0s", "--ember-drift": "10px" } },
  { left: "22%", style: { "--ember-size": "2px", "--ember-color": "#ffb703", "--ember-duration": "3.4s", "--ember-delay": "0.6s", "--ember-drift": "-8px" } },
  { left: "38%", style: { "--ember-size": "4px", "--ember-color": "#ff5f1f", "--ember-duration": "3s", "--ember-delay": "1.1s", "--ember-drift": "6px" } },
  { left: "55%", style: { "--ember-size": "2px", "--ember-color": "#ffb703", "--ember-duration": "2.6s", "--ember-delay": "1.6s", "--ember-drift": "-12px" } },
  { left: "68%", style: { "--ember-size": "3px", "--ember-color": "#ff8f00", "--ember-duration": "3.6s", "--ember-delay": "0.3s", "--ember-drift": "8px" } },
  { left: "82%", style: { "--ember-size": "2px", "--ember-color": "#ff3d00", "--ember-duration": "3.1s", "--ember-delay": "2s", "--ember-drift": "-6px" } },
  { left: "92%", style: { "--ember-size": "3px", "--ember-color": "#ffb703", "--ember-duration": "2.9s", "--ember-delay": "1.4s", "--ember-drift": "4px" } },
]
