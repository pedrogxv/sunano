import Link from "next/link"
import { ShieldAlert } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function SemPermissaoPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="max-w-md border-border bg-card/90">
        <CardHeader className="items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-amber-500/15">
            <ShieldAlert className="size-6 text-amber-400" />
          </div>
          <CardTitle>Sem permissões liberadas</CardTitle>
          <CardDescription>
            Sua conta tem acesso ao painel, mas nenhuma seção foi habilitada ainda.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>
            Peça a um WEB Master para liberar as seções em <strong>Usuários</strong>.
          </p>
          <Link href="/" className="mt-4 inline-block text-primary underline underline-offset-4">
            Voltar ao site
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
