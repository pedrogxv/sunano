"use client"

import Link from "next/link"
import { useState } from "react"
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  Shield,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { supabaseAuth } from "@/lib/client/supabase-auth"

interface PrivacidadeTabProps {
  email: string | null
  lgpdConsentAt: string | null
  lgpdConsentVersion: string | null
}

export function PrivacidadeTab({ email, lgpdConsentAt, lgpdConsentVersion }: PrivacidadeTabProps) {
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")

  async function exportData() {
    try {
      setExporting(true)
      const res = await fetch("/api/profile/export")
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Erro ao exportar dados")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `meus-dados-sunano-${new Date().toISOString().split("T")[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Exportação concluída", {
        description: "Seus dados foram baixados como JSON.",
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao exportar dados"
      toast.error("Falha na exportação", { description: message })
    } finally {
      setExporting(false)
    }
  }

  async function deleteAccount() {
    if (confirmEmail.trim().toLowerCase() !== (email ?? "").toLowerCase()) {
      toast.error("E-mail não confere", {
        description: "Digite seu e-mail exatamente como cadastrado.",
      })
      return
    }
    try {
      setDeleting(true)
      const res = await fetch("/api/profile/delete", { method: "DELETE" })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Erro ao excluir conta")
      }
      await supabaseAuth.auth.signOut()
      window.location.href = "/login?deleted=1"
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao excluir conta"
      toast.error("Falha ao excluir conta", { description: message })
      setDeleting(false)
    }
  }

  const consentDate = lgpdConsentAt
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(lgpdConsentAt))
    : null

  return (
    <div className="space-y-6">
      {/* Consentimento */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" />
            Consentimento LGPD
          </CardTitle>
          <CardDescription>
            Registro do seu consentimento em conformidade com a Lei 13.709/2018.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {consentDate ? (
            <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-400" />
                <span className="text-sm font-medium text-foreground">Consentimento registrado</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Você aceitou a{" "}
                <Link href="/privacidade" className="text-primary hover:underline">
                  Política de Privacidade
                </Link>{" "}
                (versão <strong>{lgpdConsentVersion}</strong>) em{" "}
                <strong>{consentDate}</strong>.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="size-4 text-amber-400 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Consentimento não registrado (conta criada antes do sistema de rastreamento LGPD).
                Ao continuar usando a plataforma, você concorda com nossa{" "}
                <Link href="/privacidade" className="text-primary hover:underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seus Direitos */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4 text-primary" />
            Seus Direitos (LGPD Art. 18)
          </CardTitle>
          <CardDescription>
            A LGPD garante os seguintes direitos sobre seus dados pessoais.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span><strong className="text-foreground">Acesso:</strong> visualize seus dados nesta página e exporte-os abaixo.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span><strong className="text-foreground">Correção:</strong> atualize nome, avatar e dados de compra na aba <em>Perfil</em>.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span><strong className="text-foreground">Portabilidade:</strong> exporte todos os seus dados em formato JSON.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                <strong className="text-foreground">Apagamento:</strong> exclua sua conta abaixo.
                Seus posts no fórum serão anonimizados.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                <strong className="text-foreground">Oposição / outros direitos:</strong> entre em
                contato pelo e-mail{" "}
                <a href="mailto:privacidade@sunano.gg" className="text-primary hover:underline">
                  privacidade@sunano.gg
                </a>
                .
              </span>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/privacidade" target="_blank">
              <Button variant="outline" size="sm" className="gap-2">
                <FileText className="size-4" />
                Política de Privacidade
                <ExternalLink className="size-3 text-muted-foreground" />
              </Button>
            </Link>
            <Link href="/termos" target="_blank">
              <Button variant="outline" size="sm" className="gap-2">
                <FileText className="size-4" />
                Termos de Uso
                <ExternalLink className="size-3 text-muted-foreground" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Exportar dados */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="size-4 text-primary" />
            Exportar meus dados
          </CardTitle>
          <CardDescription>
            Baixe todos os seus dados pessoais armazenados no Sunano em formato JSON (portabilidade —
            LGPD Art. 18, V).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <p className="mb-4 text-sm text-muted-foreground">
            O arquivo incluirá: perfil, dados de compra, posts e comentários do fórum, e histórico
            de pedidos.
          </p>
          <Button onClick={exportData} disabled={exporting} variant="outline" className="gap-2">
            <Download className="size-4" />
            {exporting ? "Exportando..." : "Baixar meus dados (JSON)"}
          </Button>
        </CardContent>
      </Card>

      {/* Excluir conta */}
      <Card className="border-border bg-card/90 border-red-500/20">
        <CardHeader className="border-b border-red-500/20">
          <CardTitle className="flex items-center gap-2 text-base text-red-400">
            <Trash2 className="size-4" />
            Excluir minha conta
          </CardTitle>
          <CardDescription>
            Ação permanente e irreversível — LGPD Art. 18, VI.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <p className="text-sm font-medium text-red-400">O que será excluído:</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Seu perfil, foto, dados de compra (nome, CPF, endereço, telefone)</li>
              <li>• Sua conta de autenticação (e-mail e senha)</li>
              <li>• Suas sessões ativas em todos os dispositivos</li>
              <li>• Seus dados de 2FA</li>
            </ul>
            <p className="mt-2 text-sm font-medium text-foreground">O que permanece:</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Posts e comentários do fórum — seu nome será substituído por &ldquo;[usuário removido]&rdquo;</li>
              <li>• Pedidos de compra — anonimizados, retidos por obrigação fiscal por 5 anos</li>
            </ul>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2" disabled={deleting}>
                <Trash2 className="size-4" />
                Solicitar exclusão de conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-400 flex items-center gap-2">
                  <AlertTriangle className="size-5" />
                  Excluir conta permanentemente?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <span className="block">
                    Esta ação é <strong>irreversível</strong>. Todos os seus dados pessoais serão
                    excluídos imediatamente.
                  </span>
                  <span className="block">
                    Para confirmar, digite seu e-mail:{" "}
                    <strong>{email}</strong>
                  </span>
                  <Input
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    placeholder={email ?? "seu@email.com"}
                    className="mt-2 border-border bg-background"
                    autoComplete="off"
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmEmail("")}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteAccount}
                  disabled={
                    deleting ||
                    confirmEmail.trim().toLowerCase() !== (email ?? "").toLowerCase()
                  }
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {deleting ? "Excluindo..." : "Sim, excluir minha conta"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
