// Superfície de card padrão usada em listagens (periféricos, loja) e
// nos cards de detalhe (PeripheralDetailView). Fundo sólido, mais distinto
// do bg-background que o `bg-card` genérico — reutilizar aqui em vez de
// inventar uma variação nova por tela.
export const CARD_SURFACE = "border-border/60 bg-secondary/50"
export const CARD_SURFACE_HOVER = "hover:border-border hover:bg-secondary/80"
export const CARD_SURFACE_INTERACTIVE = `${CARD_SURFACE} ${CARD_SURFACE_HOVER}`
