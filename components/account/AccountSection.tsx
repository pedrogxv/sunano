"use client"

import Link from "next/link"
import { ArrowRight, Handshake, KeyRound, Link2, Shield, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"

import { LinkedAccountsTab } from "./LinkedAccountsTab"
import { PreferencesTab } from "./PreferencesTab"
import { PrivacidadeTab } from "./PrivacidadeTab"
import { SecurityTab } from "./SecurityTab"

interface AccountSectionProps {
  email: string | null
  lgpdConsentAt: string | null
  lgpdConsentVersion: string | null
}

const BASE_GROUPS = [
  { id: "seguranca", label: "Segurança", Icon: KeyRound },
  { id: "conexoes", label: "Conexões", Icon: Link2 },
  { id: "preferencias", label: "Preferências", Icon: SlidersHorizontal },
  { id: "privacidade", label: "Privacidade e dados", Icon: Shield },
] as const

const AFFILIATES_GROUP = { id: "afiliados", label: "Afiliados", Icon: Handshake } as const

/**
 * Tudo que é da conta em si — senha e 2FA, logins sociais, aparência/idioma e
 * os direitos de privacidade (LGPD). Os atalhos do topo rolam até cada grupo,
 * então não há uma segunda navegação lateral.
 */
export function AccountSection({ email, lgpdConsentAt, lgpdConsentVersion }: AccountSectionProps) {
  const showAffiliates = !isStoreMaintenanceEnabled()
  const GROUPS = showAffiliates ? [...BASE_GROUPS, AFFILIATES_GROUP] : BASE_GROUPS

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap gap-2">
        {GROUPS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollTo(id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-border hover:bg-secondary/80 hover:text-foreground hover:shadow-sm"
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      <section id="seguranca" className="scroll-mt-20 space-y-5">
        <SectionHeading title="Segurança" description="Senha e verificação em duas etapas." />
        <SecurityTab email={email} />
      </section>

      <section id="conexoes" className="scroll-mt-20 space-y-5">
        <SectionHeading title="Conexões" description="Logins sociais vinculados à sua conta." />
        <LinkedAccountsTab />
      </section>

      <section id="preferencias" className="scroll-mt-20 space-y-5">
        <SectionHeading
          title="Preferências"
          description="Aparência, idioma e sessões ativas nos seus dispositivos."
        />
        <PreferencesTab />
      </section>

      <section id="privacidade" className="scroll-mt-20 space-y-5">
        <SectionHeading
          title="Privacidade e dados"
          description="Consentimento, exportação dos seus dados e exclusão da conta (LGPD)."
        />
        <PrivacidadeTab
          email={email}
          lgpdConsentAt={lgpdConsentAt}
          lgpdConsentVersion={lgpdConsentVersion}
        />
      </section>

      {showAffiliates && (
        <section id="afiliados" className="scroll-mt-20 space-y-5">
          <SectionHeading
            title="Afiliados"
            description="Indique a loja e receba comissão sobre as vendas confirmadas."
          />
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-secondary/30 px-4 py-3.5">
            <p className="text-sm text-muted-foreground">
              Acompanhe seu saldo, extrato e link de indicação no painel do afiliado.
            </p>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/afiliados">
                Acessar painel
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1 border-l-2 border-primary/40 pl-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
