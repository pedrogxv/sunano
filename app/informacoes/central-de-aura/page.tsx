import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { AuraGuide } from "@/components/aura/AuraGuide"

export const metadata: Metadata = buildMetadata({
  title: "Central de Aura",
  description:
    "Como o sistema de Aura funciona no Sunano: todas as formas de ganhar e gastar Aura, o multiplicador de Ofensiva e VIP, o que não gera Aura e os limites de reações.",
  path: "/informacoes/central-de-aura",
  eyebrow: "Comunidade",
  subtitle: "Como a Aura funciona",
})

/**
 * Guia de referência da Aura (texto genérico, sem os números do usuário).
 * `AuraGuide` conta a regra em capítulos interativos e termina no
 * `AuraFaqSection`, que segue sendo a fonte única do texto completo — aqui
 * sem `streak`/`isVip`, na Central (`/aura`) com os valores reais.
 */
export default function CentralDeAuraInfoPage() {
  return <AuraGuide />
}
