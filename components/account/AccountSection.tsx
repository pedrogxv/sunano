"use client"

import { KeyRound, Link2, Shield, SlidersHorizontal } from "lucide-react"

import { LinkedAccountsTab } from "./LinkedAccountsTab"
import { PreferencesTab } from "./PreferencesTab"
import { PrivacidadeTab } from "./PrivacidadeTab"
import { SecurityTab } from "./SecurityTab"

interface AccountSectionProps {
  email: string | null
  lgpdConsentAt: string | null
  lgpdConsentVersion: string | null
}

const GROUPS = [
  { id: "seguranca", label: "Segurança", Icon: KeyRound },
  { id: "conexoes", label: "Conexões", Icon: Link2 },
  { id: "preferencias", label: "Preferências", Icon: SlidersHorizontal },
  { id: "privacidade", label: "Privacidade e dados", Icon: Shield },
] as const

/**
 * Tudo que é da conta em si — senha e 2FA, logins sociais, aparência/idioma e
 * os direitos de privacidade (LGPD). Os atalhos do topo rolam até cada grupo,
 * então não há uma segunda navegação lateral.
 */
export function AccountSection({ email, lgpdConsentAt, lgpdConsentVersion }: AccountSectionProps) {
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
