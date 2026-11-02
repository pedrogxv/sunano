import { cn } from "@/lib/utils"

/**
 * Painel temático da Central de Aura: borda em gradiente, focos de luz nos
 * cantos e um cabeçalho com ícone aceso. Agrupa as seções pela INTENÇÃO de
 * quem está ali — ganhar prêmio, gastar Aura, ganhar Aura —, cada grupo com a
 * sua cor, em vez de uma fila de títulos soltos com frase cinza embaixo.
 *
 * Dentro dele, cada seção vira uma "faixa" com `PrizeLaneHeader`.
 * A cor de cada tema mora em globals.css (`.aura-hub-*`).
 */
export type AuraHubTheme = "prize" | "shop" | "earn"

export function AuraHub({
  theme,
  icon,
  title,
  subtitle,
  right,
  id,
  className,
  children,
}: {
  theme: AuraHubTheme
  icon: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  right?: React.ReactNode
  /** Âncora de link (`#vip`, `#tarefas`...). */
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn("aura-hub scroll-mt-20 space-y-6 p-4 sm:p-5", `aura-hub-${theme}`, className)}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="aura-hub-icon flex size-11 shrink-0 items-center justify-center rounded-xl">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}
